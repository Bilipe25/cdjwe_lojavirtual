CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_cfop_config(
    p_cfop_config_id UUID DEFAULT NULL,
    p_cfop_entry_id UUID DEFAULT NULL,
    p_cfop_version_id UUID DEFAULT NULL,
    p_operation_group TEXT DEFAULT NULL,
    p_general_description TEXT DEFAULT NULL,
    p_default_note TEXT DEFAULT NULL,
    p_operation_scope TEXT DEFAULT 'all',
    p_applies_to_own_manufacture BOOLEAN DEFAULT false,
    p_applies_to_resale BOOLEAN DEFAULT false,
    p_applies_outside_establishment BOOLEAN DEFAULT false,
    p_applies_consumer_final BOOLEAN DEFAULT false,
    p_applies_taxpayer BOOLEAN DEFAULT false,
    p_supports_st BOOLEAN DEFAULT false,
    p_impacts_icms BOOLEAN DEFAULT true,
    p_impacts_ibscbs BOOLEAN DEFAULT false,
    p_sum_operation_total_invoice BOOLEAN DEFAULT true,
    p_is_recommended BOOLEAN DEFAULT false,
    p_is_legacy BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_icms_config JSONB DEFAULT '{}'::JSONB,
    p_ibscbs_config JSONB DEFAULT '{}'::JSONB,
    p_piscofins_config JSONB DEFAULT '{}'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    cfop_config_id UUID,
    created BOOLEAN,
    configuration_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_config_id UUID;
    v_entry RECORD;
    v_direction TEXT;
    v_operation_scope TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operation_scope, '')), ''), 'all');
    v_status TEXT;
    v_cst_catalog_version_id UUID;
    v_classification_version_id UUID;
    v_presumed_credit_version_id UUID;
    v_cst_code TEXT;
    v_regular_cst_code TEXT;
    v_classification_code TEXT;
    v_regular_classification_code TEXT;
    v_presumed_credit_code TEXT;
    v_pis_cst_code TEXT;
    v_cofins_cst_code TEXT;
BEGIN
    IF p_cfop_entry_id IS NULL THEN
        RAISE EXCEPTION 'p_cfop_entry_id is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_operation_group, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_operation_group is required';
    END IF;

    IF p_icms_config IS NULL OR jsonb_typeof(p_icms_config) <> 'object' THEN
        RAISE EXCEPTION 'p_icms_config must be a JSON object';
    END IF;

    IF p_ibscbs_config IS NULL OR jsonb_typeof(p_ibscbs_config) <> 'object' THEN
        RAISE EXCEPTION 'p_ibscbs_config must be a JSON object';
    END IF;

    IF p_piscofins_config IS NULL OR jsonb_typeof(p_piscofins_config) <> 'object' THEN
        RAISE EXCEPTION 'p_piscofins_config must be a JSON object';
    END IF;

    SELECT entry.*, version_row.id AS resolved_version_id
      INTO v_entry
      FROM public.fiscal_cfop_entries entry
      INNER JOIN public.fiscal_reference_versions version_row
        ON version_row.id = entry.version_id
     WHERE entry.id = p_cfop_entry_id
       AND (p_cfop_version_id IS NULL OR entry.version_id = p_cfop_version_id)
     LIMIT 1;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'CFOP entry % not found', p_cfop_entry_id;
    END IF;

    v_direction := COALESCE(v_entry.operation_direction, 'both');

    IF v_operation_scope = 'internal' AND LEFT(v_entry.code, 1) NOT IN ('1', '5') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com escopo interno', v_entry.code;
    END IF;

    IF v_operation_scope = 'interstate' AND LEFT(v_entry.code, 1) NOT IN ('2', '6') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com escopo interestadual', v_entry.code;
    END IF;

    IF v_operation_scope = 'external' AND LEFT(v_entry.code, 1) NOT IN ('3', '7') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com operacoes com exterior', v_entry.code;
    END IF;

    v_cst_catalog_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'cst_catalog_version_id', '')), '')::UUID;
    v_classification_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'classification_version_id', '')), '')::UUID;
    v_presumed_credit_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'presumed_credit_catalog_version_id', '')), '')::UUID;
    v_cst_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'cst_code', '')), '');
    v_regular_cst_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'regular_cst_code', '')), '');
    v_classification_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'classification_code', '')), '');
    v_regular_classification_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'regular_classification_code', '')), '');
    v_presumed_credit_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'presumed_credit_code', '')), '');
    v_pis_cst_code := NULLIF(TRIM(COALESCE(p_piscofins_config ->> 'pis_cst_code', '')), '');
    v_cofins_cst_code := NULLIF(TRIM(COALESCE(p_piscofins_config ->> 'cofins_cst_code', '')), '');

    IF COALESCE(p_impacts_ibscbs, false) THEN
        IF v_cst_catalog_version_id IS NULL OR v_classification_version_id IS NULL THEN
            RAISE EXCEPTION 'Selecione versoes de catalogo ativas para IBS/CBS';
        END IF;

        IF v_cst_code IS NULL OR v_classification_code IS NULL THEN
            RAISE EXCEPTION 'CST e classificacao tributaria de IBS/CBS sao obrigatorios quando o bloco estiver ativo';
        END IF;

        IF LEFT(v_classification_code, 3) <> v_cst_code THEN
            RAISE EXCEPTION 'Classification code % must match IBS/CBS CST %', v_classification_code, v_cst_code;
        END IF;

        IF v_regular_classification_code IS NOT NULL AND v_regular_cst_code IS NULL THEN
            RAISE EXCEPTION 'Regular CST is required when regular classification is informed';
        END IF;

        IF v_regular_classification_code IS NOT NULL AND LEFT(v_regular_classification_code, 3) <> v_regular_cst_code THEN
            RAISE EXCEPTION 'Regular classification code % must match regular CST %', v_regular_classification_code, v_regular_cst_code;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_cst_catalog_items item
         WHERE item.catalog_version_id = v_cst_catalog_version_id
           AND item.code = v_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'IBS/CBS CST % not found in catalog version %', v_cst_code, v_cst_catalog_version_id;
        END IF;

        IF v_regular_cst_code IS NOT NULL THEN
            PERFORM 1
              FROM public.fiscal_ibscbs_cst_catalog_items item
             WHERE item.catalog_version_id = v_cst_catalog_version_id
               AND item.code = v_regular_cst_code
               AND item.is_active = true;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Regular IBS/CBS CST % not found in catalog version %', v_regular_cst_code, v_cst_catalog_version_id;
            END IF;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_classification_items item
         WHERE item.catalog_version_id = v_classification_version_id
           AND item.code = v_classification_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'IBS/CBS classification % not found in catalog version %', v_classification_code, v_classification_version_id;
        END IF;

        IF v_regular_classification_code IS NOT NULL THEN
            PERFORM 1
              FROM public.fiscal_ibscbs_classification_items item
             WHERE item.catalog_version_id = v_classification_version_id
               AND item.code = v_regular_classification_code
               AND item.is_active = true;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Regular IBS/CBS classification % not found in catalog version %', v_regular_classification_code, v_classification_version_id;
            END IF;
        END IF;
    END IF;

    IF v_presumed_credit_code IS NOT NULL THEN
        IF v_presumed_credit_version_id IS NULL THEN
            RAISE EXCEPTION 'Presumed credit catalog version is required when presumed credit code is informed';
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_presumed_credit_items item
         WHERE item.catalog_version_id = v_presumed_credit_version_id
           AND item.code = v_presumed_credit_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Presumed credit code % not found in catalog version %', v_presumed_credit_code, v_presumed_credit_version_id;
        END IF;
    END IF;

    IF v_pis_cst_code IS NOT NULL THEN
        PERFORM 1
          FROM public.fiscal_catalog_items item
         WHERE item.catalog_type = 'pis_cst'
           AND item.code = v_pis_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PIS CST % not found in fiscal catalog', v_pis_cst_code;
        END IF;
    END IF;

    IF v_cofins_cst_code IS NOT NULL THEN
        PERFORM 1
          FROM public.fiscal_catalog_items item
         WHERE item.catalog_type = 'cofins_cst'
           AND item.code = v_cofins_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'COFINS CST % not found in fiscal catalog', v_cofins_cst_code;
        END IF;
    END IF;

    v_status := public.compute_fiscal_cfop_configuration_status(
        p_operation_group,
        p_general_description,
        p_impacts_icms,
        p_impacts_ibscbs,
        p_is_legacy,
        p_icms_config,
        p_ibscbs_config
    );

    IF p_cfop_config_id IS NULL THEN
        INSERT INTO public.fiscal_cfop_configs (
            cfop_entry_id,
            cfop_version_id,
            operation_group,
            general_description,
            default_note,
            operation_scope,
            applies_to_own_manufacture,
            applies_to_resale,
            applies_outside_establishment,
            applies_consumer_final,
            applies_taxpayer,
            supports_st,
            impacts_icms,
            impacts_ibscbs,
            sum_operation_total_invoice,
            is_recommended,
            is_legacy,
            is_active,
            configuration_status,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            p_cfop_entry_id,
            v_entry.version_id,
            TRIM(p_operation_group),
            NULLIF(TRIM(COALESCE(p_general_description, '')), ''),
            NULLIF(TRIM(COALESCE(p_default_note, '')), ''),
            v_operation_scope,
            COALESCE(p_applies_to_own_manufacture, false),
            COALESCE(p_applies_to_resale, false),
            COALESCE(p_applies_outside_establishment, false),
            COALESCE(p_applies_consumer_final, false),
            COALESCE(p_applies_taxpayer, false),
            COALESCE(p_supports_st, false),
            COALESCE(p_impacts_icms, true),
            COALESCE(p_impacts_ibscbs, false),
            COALESCE(p_sum_operation_total_invoice, true),
            COALESCE(p_is_recommended, false),
            COALESCE(p_is_legacy, false),
            COALESCE(p_is_active, true),
            v_status,
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT (cfop_entry_id) DO UPDATE
            SET cfop_version_id = EXCLUDED.cfop_version_id,
                operation_group = EXCLUDED.operation_group,
                general_description = EXCLUDED.general_description,
                default_note = EXCLUDED.default_note,
                operation_scope = EXCLUDED.operation_scope,
                applies_to_own_manufacture = EXCLUDED.applies_to_own_manufacture,
                applies_to_resale = EXCLUDED.applies_to_resale,
                applies_outside_establishment = EXCLUDED.applies_outside_establishment,
                applies_consumer_final = EXCLUDED.applies_consumer_final,
                applies_taxpayer = EXCLUDED.applies_taxpayer,
                supports_st = EXCLUDED.supports_st,
                impacts_icms = EXCLUDED.impacts_icms,
                impacts_ibscbs = EXCLUDED.impacts_ibscbs,
                sum_operation_total_invoice = EXCLUDED.sum_operation_total_invoice,
                is_recommended = EXCLUDED.is_recommended,
                is_legacy = EXCLUDED.is_legacy,
                is_active = EXCLUDED.is_active,
                configuration_status = EXCLUDED.configuration_status,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW()
        RETURNING id INTO v_config_id;

        v_created := true;
    ELSE
        UPDATE public.fiscal_cfop_configs config
           SET cfop_entry_id = p_cfop_entry_id,
               cfop_version_id = v_entry.version_id,
               operation_group = TRIM(p_operation_group),
               general_description = NULLIF(TRIM(COALESCE(p_general_description, '')), ''),
               default_note = NULLIF(TRIM(COALESCE(p_default_note, '')), ''),
               operation_scope = v_operation_scope,
               applies_to_own_manufacture = COALESCE(p_applies_to_own_manufacture, false),
               applies_to_resale = COALESCE(p_applies_to_resale, false),
               applies_outside_establishment = COALESCE(p_applies_outside_establishment, false),
               applies_consumer_final = COALESCE(p_applies_consumer_final, false),
               applies_taxpayer = COALESCE(p_applies_taxpayer, false),
               supports_st = COALESCE(p_supports_st, false),
               impacts_icms = COALESCE(p_impacts_icms, true),
               impacts_ibscbs = COALESCE(p_impacts_ibscbs, false),
               sum_operation_total_invoice = COALESCE(p_sum_operation_total_invoice, true),
               is_recommended = COALESCE(p_is_recommended, false),
               is_legacy = COALESCE(p_is_legacy, false),
               is_active = COALESCE(p_is_active, true),
               configuration_status = v_status,
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor,
               updated_at = NOW()
         WHERE config.id = p_cfop_config_id
         RETURNING config.id INTO v_config_id;

        IF v_config_id IS NULL THEN
            RAISE EXCEPTION 'CFOP config % not found', p_cfop_config_id;
        END IF;
    END IF;

    INSERT INTO public.fiscal_cfop_icms_configs (
        cfop_config_id,
        calculate_icms,
        simple_national_non_taxed,
        omit_icms_for_individual,
        highlight_st_on_invoice,
        st_collected_previously,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    VALUES (
        v_config_id,
        COALESCE((p_icms_config ->> 'calculate_icms')::BOOLEAN, true),
        COALESCE((p_icms_config ->> 'simple_national_non_taxed')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'omit_icms_for_individual')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'highlight_st_on_invoice')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'st_collected_previously')::BOOLEAN, false),
        COALESCE(p_icms_config -> 'metadata_jsonb', '{}'::JSONB),
        COALESCE(p_icms_config -> 'future_tax_payload', '{}'::JSONB),
        v_actor,
        v_actor
    )
    ON CONFLICT ON CONSTRAINT fiscal_cfop_icms_configs_cfop_config_unique DO UPDATE
        SET calculate_icms = EXCLUDED.calculate_icms,
            simple_national_non_taxed = EXCLUDED.simple_national_non_taxed,
            omit_icms_for_individual = EXCLUDED.omit_icms_for_individual,
            highlight_st_on_invoice = EXCLUDED.highlight_st_on_invoice,
            st_collected_previously = EXCLUDED.st_collected_previously,
            metadata_jsonb = EXCLUDED.metadata_jsonb,
            future_tax_payload = EXCLUDED.future_tax_payload,
            updated_by = v_actor,
            updated_at = NOW();

    IF p_ibscbs_config <> '{}'::JSONB OR COALESCE(p_impacts_ibscbs, false) THEN
        INSERT INTO public.fiscal_cfop_ibscbs_configs (
            cfop_config_id,
            cst_catalog_version_id,
            cst_code,
            classification_version_id,
            classification_code,
            regular_cst_code,
            regular_classification_code,
            presumed_credit_catalog_version_id,
            presumed_credit_code,
            presumed_credit_rate,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_config_id,
            v_cst_catalog_version_id,
            v_cst_code,
            v_classification_version_id,
            v_classification_code,
            v_regular_cst_code,
            v_regular_classification_code,
            v_presumed_credit_version_id,
            v_presumed_credit_code,
            NULLIF(p_ibscbs_config ->> 'presumed_credit_rate', '')::NUMERIC,
            COALESCE(p_ibscbs_config -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_ibscbs_config -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT ON CONSTRAINT fiscal_cfop_ibscbs_configs_cfop_config_unique DO UPDATE
            SET cst_catalog_version_id = EXCLUDED.cst_catalog_version_id,
                cst_code = EXCLUDED.cst_code,
                classification_version_id = EXCLUDED.classification_version_id,
                classification_code = EXCLUDED.classification_code,
                regular_cst_code = EXCLUDED.regular_cst_code,
                regular_classification_code = EXCLUDED.regular_classification_code,
                presumed_credit_catalog_version_id = EXCLUDED.presumed_credit_catalog_version_id,
                presumed_credit_code = EXCLUDED.presumed_credit_code,
                presumed_credit_rate = EXCLUDED.presumed_credit_rate,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW();
    ELSE
        DELETE FROM public.fiscal_cfop_ibscbs_configs config WHERE config.cfop_config_id = v_config_id;
    END IF;

    IF p_piscofins_config <> '{}'::JSONB THEN
        INSERT INTO public.fiscal_cfop_piscofins_configs (
            cfop_config_id,
            pis_cst_code,
            cofins_cst_code,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_config_id,
            v_pis_cst_code,
            v_cofins_cst_code,
            COALESCE(p_piscofins_config -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_piscofins_config -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT ON CONSTRAINT fiscal_cfop_piscofins_configs_cfop_config_unique DO UPDATE
            SET pis_cst_code = EXCLUDED.pis_cst_code,
                cofins_cst_code = EXCLUDED.cofins_cst_code,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW();
    ELSE
        DELETE FROM public.fiscal_cfop_piscofins_configs config WHERE config.cfop_config_id = v_config_id;
    END IF;

    RETURN QUERY SELECT v_config_id, v_created, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_cfop_config(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN,
    BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
