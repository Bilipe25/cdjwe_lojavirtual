CREATE OR REPLACE FUNCTION public.admin_upsert_product_tax_profile(
    p_tax_profile_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_ncm TEXT DEFAULT NULL,
    p_cest TEXT DEFAULT NULL,
    p_origin_code TEXT DEFAULT '0',
    p_commercial_unit TEXT DEFAULT NULL,
    p_tax_unit TEXT DEFAULT NULL,
    p_ean_gtin TEXT DEFAULT NULL,
    p_tax_ean_gtin TEXT DEFAULT NULL,
    p_default_fiscal_description TEXT DEFAULT NULL,
    p_fiscal_type TEXT DEFAULT 'goods',
    p_item_type TEXT DEFAULT 'goods',
    p_has_substitution_tax BOOLEAN DEFAULT false,
    p_requires_cest BOOLEAN DEFAULT false,
    p_has_ipi BOOLEAN DEFAULT false,
    p_ipi_cst_out TEXT DEFAULT NULL,
    p_ipi_enquadramento_codigo TEXT DEFAULT NULL,
    p_pis_cst TEXT DEFAULT NULL,
    p_cofins_cst TEXT DEFAULT NULL,
    p_pis_aliquota NUMERIC DEFAULT NULL,
    p_cofins_aliquota NUMERIC DEFAULT NULL,
    p_default_output_cfop TEXT DEFAULT NULL,
    p_default_input_cfop TEXT DEFAULT NULL,
    p_internal_fiscal_code TEXT DEFAULT NULL,
    p_default_fiscal_notes TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT true,
    p_requires_tax_configuration BOOLEAN DEFAULT true,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_ncm_reference_id UUID DEFAULT NULL,
    p_ncm_version_id UUID DEFAULT NULL,
    p_tipi_reference_id UUID DEFAULT NULL,
    p_tipi_version_id UUID DEFAULT NULL,
    p_cest_reference_id UUID DEFAULT NULL,
    p_cest_version_id UUID DEFAULT NULL,
    p_default_output_cfop_reference_id UUID DEFAULT NULL,
    p_default_output_cfop_version_id UUID DEFAULT NULL,
    p_default_input_cfop_reference_id UUID DEFAULT NULL,
    p_default_input_cfop_version_id UUID DEFAULT NULL,
    p_icms_base_id UUID DEFAULT NULL,
    p_ibscbs_base_id UUID DEFAULT NULL,
    p_ibscbs_version_id UUID DEFAULT NULL,
    p_default_output_cfop_config_id UUID DEFAULT NULL,
    p_default_input_cfop_config_id UUID DEFAULT NULL,
    p_fiscal_reference_snapshot_jsonb JSONB DEFAULT '{}'::JSONB,
    p_rules JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
    tax_profile_id UUID,
    created BOOLEAN,
    version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_profile_id UUID;
    v_version INTEGER;
    v_rule JSONB;
    v_rule_id UUID;
    v_keep_rule_ids UUID[] := ARRAY[]::UUID[];
    v_default_output_cfop RECORD;
    v_default_input_cfop RECORD;
    v_rule_cfop RECORD;
    v_rule_cfop_config_id UUID;
    v_rule_cfop_reference_id UUID;
    v_rule_cfop_version_id UUID;
    v_rule_cfop_override TEXT;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN
        RAISE EXCEPTION 'p_rules must be a JSON array';
    END IF;

    IF p_default_output_cfop_config_id IS NOT NULL THEN
        SELECT
            config.id AS config_id,
            config.cfop_entry_id AS reference_id,
            config.cfop_version_id AS version_id,
            config.is_active,
            entry.code,
            entry.operation_direction
        INTO v_default_output_cfop
        FROM public.fiscal_cfop_configs config
        INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
        WHERE config.id = p_default_output_cfop_config_id;

        IF v_default_output_cfop.config_id IS NULL THEN
            RAISE EXCEPTION 'Default output CFOP config % not found', p_default_output_cfop_config_id;
        END IF;

        IF COALESCE(v_default_output_cfop.is_active, false) = false THEN
            RAISE EXCEPTION 'Default output CFOP config % is inactive', COALESCE(v_default_output_cfop.code, p_default_output_cfop_config_id::TEXT);
        END IF;

        IF COALESCE(v_default_output_cfop.operation_direction, 'both') NOT IN ('outbound', 'both') THEN
            RAISE EXCEPTION 'CFOP config % cannot be used as default output', COALESCE(v_default_output_cfop.code, p_default_output_cfop_config_id::TEXT);
        END IF;

        p_default_output_cfop_reference_id := v_default_output_cfop.reference_id;
        p_default_output_cfop_version_id := v_default_output_cfop.version_id;
        p_default_output_cfop := v_default_output_cfop.code;
    END IF;

    IF p_default_input_cfop_config_id IS NOT NULL THEN
        SELECT
            config.id AS config_id,
            config.cfop_entry_id AS reference_id,
            config.cfop_version_id AS version_id,
            config.is_active,
            entry.code,
            entry.operation_direction
        INTO v_default_input_cfop
        FROM public.fiscal_cfop_configs config
        INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
        WHERE config.id = p_default_input_cfop_config_id;

        IF v_default_input_cfop.config_id IS NULL THEN
            RAISE EXCEPTION 'Default input CFOP config % not found', p_default_input_cfop_config_id;
        END IF;

        IF COALESCE(v_default_input_cfop.is_active, false) = false THEN
            RAISE EXCEPTION 'Default input CFOP config % is inactive', COALESCE(v_default_input_cfop.code, p_default_input_cfop_config_id::TEXT);
        END IF;

        IF COALESCE(v_default_input_cfop.operation_direction, 'both') NOT IN ('inbound', 'both') THEN
            RAISE EXCEPTION 'CFOP config % cannot be used as default input', COALESCE(v_default_input_cfop.code, p_default_input_cfop_config_id::TEXT);
        END IF;

        p_default_input_cfop_reference_id := v_default_input_cfop.reference_id;
        p_default_input_cfop_version_id := v_default_input_cfop.version_id;
        p_default_input_cfop := v_default_input_cfop.code;
    END IF;

    IF p_tax_profile_id IS NULL THEN
        INSERT INTO public.product_tax_profiles AS tp (
            name, code, description, ncm, cest, origin_code,
            commercial_unit, tax_unit, ean_gtin, tax_ean_gtin,
            default_fiscal_description, fiscal_type, item_type,
            has_substitution_tax, requires_cest, has_ipi,
            ipi_cst_out, ipi_enquadramento_codigo, pis_cst, cofins_cst,
            pis_aliquota, cofins_aliquota, default_output_cfop, default_input_cfop,
            internal_fiscal_code, default_fiscal_notes, is_active,
            requires_tax_configuration, future_tax_payload, metadata_jsonb,
            ncm_reference_id, ncm_version_id, tipi_reference_id, tipi_version_id,
            cest_reference_id, cest_version_id,
            default_output_cfop_reference_id, default_output_cfop_version_id,
            default_input_cfop_reference_id, default_input_cfop_version_id,
            icms_base_id, ibscbs_base_id, ibscbs_version_id,
            default_output_cfop_config_id, default_input_cfop_config_id,
            fiscal_reference_snapshot_jsonb,
            created_by, updated_by
        )
        VALUES (
            p_name, p_code, p_description, p_ncm, p_cest, COALESCE(p_origin_code, '0'),
            p_commercial_unit, p_tax_unit, p_ean_gtin, p_tax_ean_gtin,
            p_default_fiscal_description, COALESCE(p_fiscal_type, 'goods'), COALESCE(p_item_type, 'goods'),
            COALESCE(p_has_substitution_tax, false), COALESCE(p_requires_cest, false), COALESCE(p_has_ipi, false),
            p_ipi_cst_out, p_ipi_enquadramento_codigo, p_pis_cst, p_cofins_cst,
            p_pis_aliquota, p_cofins_aliquota, p_default_output_cfop, p_default_input_cfop,
            p_internal_fiscal_code, p_default_fiscal_notes, COALESCE(p_is_active, true),
            COALESCE(p_requires_tax_configuration, true),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            p_ncm_reference_id, p_ncm_version_id, p_tipi_reference_id, p_tipi_version_id,
            p_cest_reference_id, p_cest_version_id,
            p_default_output_cfop_reference_id, p_default_output_cfop_version_id,
            p_default_input_cfop_reference_id, p_default_input_cfop_version_id,
            p_icms_base_id, p_ibscbs_base_id, p_ibscbs_version_id,
            p_default_output_cfop_config_id, p_default_input_cfop_config_id,
            COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
            v_actor, v_actor
        )
        RETURNING tp.id, tp.version INTO v_profile_id, v_version;

        v_created := true;
    ELSE
        UPDATE public.product_tax_profiles tp
           SET name = p_name,
               code = p_code,
               description = p_description,
               ncm = p_ncm,
               cest = p_cest,
               origin_code = COALESCE(p_origin_code, '0'),
               commercial_unit = p_commercial_unit,
               tax_unit = p_tax_unit,
               ean_gtin = p_ean_gtin,
               tax_ean_gtin = p_tax_ean_gtin,
               default_fiscal_description = p_default_fiscal_description,
               fiscal_type = COALESCE(p_fiscal_type, 'goods'),
               item_type = COALESCE(p_item_type, 'goods'),
               has_substitution_tax = COALESCE(p_has_substitution_tax, false),
               requires_cest = COALESCE(p_requires_cest, false),
               has_ipi = COALESCE(p_has_ipi, false),
               ipi_cst_out = p_ipi_cst_out,
               ipi_enquadramento_codigo = p_ipi_enquadramento_codigo,
               pis_cst = p_pis_cst,
               cofins_cst = p_cofins_cst,
               pis_aliquota = p_pis_aliquota,
               cofins_aliquota = p_cofins_aliquota,
               default_output_cfop = p_default_output_cfop,
               default_input_cfop = p_default_input_cfop,
               internal_fiscal_code = p_internal_fiscal_code,
               default_fiscal_notes = p_default_fiscal_notes,
               is_active = COALESCE(p_is_active, true),
               requires_tax_configuration = COALESCE(p_requires_tax_configuration, true),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               ncm_reference_id = p_ncm_reference_id,
               ncm_version_id = p_ncm_version_id,
               tipi_reference_id = p_tipi_reference_id,
               tipi_version_id = p_tipi_version_id,
               cest_reference_id = p_cest_reference_id,
               cest_version_id = p_cest_version_id,
               default_output_cfop_reference_id = p_default_output_cfop_reference_id,
               default_output_cfop_version_id = p_default_output_cfop_version_id,
               default_input_cfop_reference_id = p_default_input_cfop_reference_id,
               default_input_cfop_version_id = p_default_input_cfop_version_id,
               icms_base_id = p_icms_base_id,
               ibscbs_base_id = p_ibscbs_base_id,
               ibscbs_version_id = p_ibscbs_version_id,
               default_output_cfop_config_id = p_default_output_cfop_config_id,
               default_input_cfop_config_id = p_default_input_cfop_config_id,
               fiscal_reference_snapshot_jsonb = COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
               version = tp.version + 1,
               updated_by = v_actor
         WHERE tp.id = p_tax_profile_id
         RETURNING tp.id, tp.version INTO v_profile_id, v_version;

        IF v_profile_id IS NULL THEN
            RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
        END IF;
    END IF;

    FOR v_rule IN
        SELECT value FROM jsonb_array_elements(p_rules)
    LOOP
        IF NULLIF(TRIM(COALESCE(v_rule ->> 'rule_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Every product tax profile rule requires rule_name';
        END IF;

        IF NULLIF(TRIM(COALESCE(v_rule ->> 'operation_direction', '')), '') NOT IN ('outbound', 'inbound') THEN
            RAISE EXCEPTION 'Every product tax profile rule requires operation_direction inbound/outbound';
        END IF;

        v_rule_cfop_config_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_config_id', '')), '')::UUID;
        v_rule_cfop_reference_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_reference_id', '')), '')::UUID;
        v_rule_cfop_version_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_version_id', '')), '')::UUID;
        v_rule_cfop_override := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_override', '')), '');

        IF v_rule_cfop_config_id IS NOT NULL THEN
            SELECT
                config.id AS config_id,
                config.cfop_entry_id AS reference_id,
                config.cfop_version_id AS version_id,
                config.is_active,
                entry.code,
                entry.operation_direction
            INTO v_rule_cfop
            FROM public.fiscal_cfop_configs config
            INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
            WHERE config.id = v_rule_cfop_config_id;

            IF v_rule_cfop.config_id IS NULL THEN
                RAISE EXCEPTION 'Rule CFOP config % not found', v_rule_cfop_config_id;
            END IF;

            IF COALESCE(v_rule_cfop.is_active, false) = false THEN
                RAISE EXCEPTION 'Rule CFOP config % is inactive', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            IF
                TRIM(v_rule ->> 'operation_direction') = 'outbound'
                AND COALESCE(v_rule_cfop.operation_direction, 'both') NOT IN ('outbound', 'both')
            THEN
                RAISE EXCEPTION 'Rule CFOP config % is not compatible with outbound operation', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            IF
                TRIM(v_rule ->> 'operation_direction') = 'inbound'
                AND COALESCE(v_rule_cfop.operation_direction, 'both') NOT IN ('inbound', 'both')
            THEN
                RAISE EXCEPTION 'Rule CFOP config % is not compatible with inbound operation', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            v_rule_cfop_reference_id := v_rule_cfop.reference_id;
            v_rule_cfop_version_id := v_rule_cfop.version_id;
            v_rule_cfop_override := v_rule_cfop.code;
        END IF;

        v_rule_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_rule ->> 'id', '')), '') IS NOT NULL THEN
            BEGIN
                UPDATE public.product_tax_profile_rules rule_row
                   SET rule_name = TRIM(v_rule ->> 'rule_name'),
                       operation_direction = TRIM(v_rule ->> 'operation_direction'),
                       origin_uf = NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'origin_uf', ''))), ''),
                       destination_uf = NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'destination_uf', ''))), ''),
                       customer_type_id = NULLIF(TRIM(COALESCE(v_rule ->> 'customer_type_id', '')), '')::UUID,
                       person_type = NULLIF(TRIM(COALESCE(v_rule ->> 'person_type', '')), ''),
                       taxpayer_indicator = NULLIF(TRIM(COALESCE(v_rule ->> 'taxpayer_indicator', '')), ''),
                       cfop_override = v_rule_cfop_override,
                       cfop_config_id = v_rule_cfop_config_id,
                       cfop_reference_id = v_rule_cfop_reference_id,
                       cfop_version_id = v_rule_cfop_version_id,
                       priority = COALESCE(NULLIF(v_rule ->> 'priority', '')::INTEGER, 0),
                       is_active = COALESCE((v_rule ->> 'is_active')::BOOLEAN, true),
                       effective_from = NULLIF(v_rule ->> 'effective_from', '')::DATE,
                       effective_to = NULLIF(v_rule ->> 'effective_to', '')::DATE,
                       rule_payload_jsonb = COALESCE(v_rule -> 'rule_payload_jsonb', COALESCE(v_rule -> 'rule_payload', '{}'::JSONB)),
                       future_tax_payload = COALESCE(v_rule -> 'future_tax_payload', '{}'::JSONB),
                       version = rule_row.version + 1,
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule_row.id = (v_rule ->> 'id')::UUID
                   AND rule_row.tax_profile_id = v_profile_id
                 RETURNING rule_row.id INTO v_rule_id;
            EXCEPTION WHEN invalid_text_representation THEN
                v_rule_id := NULL;
            END;
        END IF;

        IF v_rule_id IS NULL THEN
            INSERT INTO public.product_tax_profile_rules (
                tax_profile_id,
                rule_name,
                operation_direction,
                origin_uf,
                destination_uf,
                customer_type_id,
                person_type,
                taxpayer_indicator,
                cfop_override,
                cfop_config_id,
                cfop_reference_id,
                cfop_version_id,
                priority,
                is_active,
                effective_from,
                effective_to,
                rule_payload_jsonb,
                future_tax_payload,
                created_by,
                updated_by
            )
            VALUES (
                v_profile_id,
                TRIM(v_rule ->> 'rule_name'),
                TRIM(v_rule ->> 'operation_direction'),
                NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'origin_uf', ''))), ''),
                NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'destination_uf', ''))), ''),
                NULLIF(TRIM(COALESCE(v_rule ->> 'customer_type_id', '')), '')::UUID,
                NULLIF(TRIM(COALESCE(v_rule ->> 'person_type', '')), ''),
                NULLIF(TRIM(COALESCE(v_rule ->> 'taxpayer_indicator', '')), ''),
                v_rule_cfop_override,
                v_rule_cfop_config_id,
                v_rule_cfop_reference_id,
                v_rule_cfop_version_id,
                COALESCE(NULLIF(v_rule ->> 'priority', '')::INTEGER, 0),
                COALESCE((v_rule ->> 'is_active')::BOOLEAN, true),
                NULLIF(v_rule ->> 'effective_from', '')::DATE,
                NULLIF(v_rule ->> 'effective_to', '')::DATE,
                COALESCE(v_rule -> 'rule_payload_jsonb', COALESCE(v_rule -> 'rule_payload', '{}'::JSONB)),
                COALESCE(v_rule -> 'future_tax_payload', '{}'::JSONB),
                v_actor,
                v_actor
            )
            RETURNING id INTO v_rule_id;
        END IF;

        v_keep_rule_ids := array_append(v_keep_rule_ids, v_rule_id);
    END LOOP;

    DELETE FROM public.product_tax_profile_rules AS rule_row
     WHERE rule_row.tax_profile_id = v_profile_id
       AND (
            array_length(v_keep_rule_ids, 1) IS NULL
            OR rule_row.id <> ALL(v_keep_rule_ids)
       );

    PERFORM public.persist_product_tax_profile_version(
        v_profile_id,
        CASE WHEN v_created THEN 'create' ELSE 'update' END,
        v_actor,
        NULL
    );

    RETURN QUERY SELECT v_profile_id, v_created, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB,
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, JSONB
) TO authenticated, service_role;
