-- Hardening for enterprise ICMS bases: safer catalog constraint and audited rule upserts

DO $$
DECLARE
    v_catalog_values TEXT;
BEGIN
    SELECT string_agg(quote_literal(value), ', ' ORDER BY value)
      INTO v_catalog_values
      FROM (
            SELECT DISTINCT catalog_type AS value
              FROM public.fiscal_catalog_items
            UNION
            SELECT unnest(
                ARRAY[
                    'origin',
                    'commercial_unit',
                    'tax_unit',
                    'pis_cst',
                    'cofins_cst',
                    'ipi_cst',
                    'icms_cst',
                    'taxpayer_indicator',
                    'person_type',
                    'item_type',
                    'fiscal_type'
                ]
            ) AS value
        ) catalog_values;

    EXECUTE 'ALTER TABLE public.fiscal_catalog_items DROP CONSTRAINT IF EXISTS fiscal_catalog_items_type_check';
    EXECUTE format(
        'ALTER TABLE public.fiscal_catalog_items ADD CONSTRAINT fiscal_catalog_items_type_check CHECK (catalog_type IN (%s))',
        v_catalog_values
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_icms_base(
    p_icms_base_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT true,
    p_national_rule JSONB DEFAULT '{}'::JSONB,
    p_state_rules JSONB DEFAULT '[]'::JSONB,
    p_interstate_rule JSONB DEFAULT '{}'::JSONB,
    p_st_rule JSONB DEFAULT '{}'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    icms_base_id UUID,
    created BOOLEAN,
    version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_base_id UUID;
    v_version INTEGER;
    v_state_item JSONB;
    v_state_uf TEXT;
    v_state_rule_id UUID;
    v_existing_national_rule_id UUID;
    v_interstate_rule_id UUID;
    v_st_rule_id UUID;
    v_keep_state_rule_ids UUID[] := ARRAY[]::UUID[];
    v_interstate_target_uf TEXT;
    v_st_target_uf TEXT;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_national_rule IS NULL OR jsonb_typeof(p_national_rule) <> 'object' THEN
        RAISE EXCEPTION 'p_national_rule must be a JSON object';
    END IF;

    IF p_state_rules IS NULL OR jsonb_typeof(p_state_rules) <> 'array' THEN
        RAISE EXCEPTION 'p_state_rules must be a JSON array';
    END IF;

    IF p_interstate_rule IS NULL OR jsonb_typeof(p_interstate_rule) <> 'object' THEN
        RAISE EXCEPTION 'p_interstate_rule must be a JSON object';
    END IF;

    IF p_st_rule IS NULL OR jsonb_typeof(p_st_rule) <> 'object' THEN
        RAISE EXCEPTION 'p_st_rule must be a JSON object';
    END IF;

    IF p_metadata_jsonb IS NULL OR jsonb_typeof(p_metadata_jsonb) <> 'object' THEN
        RAISE EXCEPTION 'p_metadata_jsonb must be a JSON object';
    END IF;

    IF p_future_tax_payload IS NULL OR jsonb_typeof(p_future_tax_payload) <> 'object' THEN
        RAISE EXCEPTION 'p_future_tax_payload must be a JSON object';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (
              SELECT UPPER(TRIM(COALESCE(value ->> 'target_uf', ''))) AS target_uf
                FROM jsonb_array_elements(p_state_rules)
          ) duplicated
         WHERE duplicated.target_uf <> ''
         GROUP BY duplicated.target_uf
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'State rules cannot repeat the same UF';
    END IF;

    IF p_icms_base_id IS NULL THEN
        INSERT INTO public.fiscal_icms_bases AS base (
            name, code, description, is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
        )
        VALUES (
            TRIM(p_name),
            UPPER(TRIM(p_code)),
            NULLIF(TRIM(COALESCE(p_description, '')), ''),
            COALESCE(p_is_active, true),
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING base.id, base.version INTO v_base_id, v_version;

        v_created := true;
    ELSE
        UPDATE public.fiscal_icms_bases base
           SET name = TRIM(p_name),
               code = UPPER(TRIM(p_code)),
               description = NULLIF(TRIM(COALESCE(p_description, '')), ''),
               is_active = COALESCE(p_is_active, true),
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               version = base.version + 1,
               updated_by = v_actor
         WHERE base.id = p_icms_base_id
         RETURNING base.id, base.version INTO v_base_id, v_version;

        IF v_base_id IS NULL THEN
            RAISE EXCEPTION 'ICMS base % not found', p_icms_base_id;
        END IF;
    END IF;

    SELECT rule.id
      INTO v_existing_national_rule_id
      FROM public.fiscal_icms_rules rule
     WHERE rule.icms_base_id = v_base_id
       AND rule.target_uf IS NULL
     ORDER BY rule.created_at ASC
     LIMIT 1;

    IF v_existing_national_rule_id IS NULL
       AND NULLIF(TRIM(COALESCE(p_national_rule ->> 'id', '')), '') IS NOT NULL THEN
        BEGIN
            SELECT rule.id
              INTO v_existing_national_rule_id
              FROM public.fiscal_icms_rules rule
             WHERE rule.id = (p_national_rule ->> 'id')::UUID
               AND rule.icms_base_id = v_base_id
             LIMIT 1;
        EXCEPTION WHEN invalid_text_representation THEN
            v_existing_national_rule_id := NULL;
        END;
    END IF;

    IF v_existing_national_rule_id IS NULL THEN
        INSERT INTO public.fiscal_icms_rules (
            icms_base_id, target_uf, cst_code, icms_rate, fcp_rate,
            special_advance_destination, differentiate_consumer_final_rate,
            base_calc_type, base_calc_percent, base_reduction_percent, base_notes,
            is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
        )
        VALUES (
            v_base_id,
            NULL,
            TRIM(COALESCE(p_national_rule ->> 'cst_code', '')),
            COALESCE(NULLIF(p_national_rule ->> 'icms_rate', '')::NUMERIC, 0),
            COALESCE(NULLIF(p_national_rule ->> 'fcp_rate', '')::NUMERIC, 0),
            COALESCE((p_national_rule ->> 'special_advance_destination')::BOOLEAN, false),
            COALESCE((p_national_rule ->> 'differentiate_consumer_final_rate')::BOOLEAN, false),
            COALESCE(NULLIF(TRIM(COALESCE(p_national_rule ->> 'base_calc_type', '')), ''), 'operation_value'),
            NULLIF(p_national_rule ->> 'base_calc_percent', '')::NUMERIC,
            NULLIF(p_national_rule ->> 'base_reduction_percent', '')::NUMERIC,
            NULLIF(TRIM(COALESCE(p_national_rule ->> 'base_notes', '')), ''),
            COALESCE((p_national_rule ->> 'is_active')::BOOLEAN, true),
            COALESCE(p_national_rule -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_national_rule -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING id INTO v_existing_national_rule_id;
    ELSE
        UPDATE public.fiscal_icms_rules
           SET cst_code = TRIM(COALESCE(p_national_rule ->> 'cst_code', '')),
               icms_rate = COALESCE(NULLIF(p_national_rule ->> 'icms_rate', '')::NUMERIC, 0),
               fcp_rate = COALESCE(NULLIF(p_national_rule ->> 'fcp_rate', '')::NUMERIC, 0),
               special_advance_destination = COALESCE((p_national_rule ->> 'special_advance_destination')::BOOLEAN, false),
               differentiate_consumer_final_rate = COALESCE((p_national_rule ->> 'differentiate_consumer_final_rate')::BOOLEAN, false),
               base_calc_type = COALESCE(NULLIF(TRIM(COALESCE(p_national_rule ->> 'base_calc_type', '')), ''), 'operation_value'),
               base_calc_percent = NULLIF(p_national_rule ->> 'base_calc_percent', '')::NUMERIC,
               base_reduction_percent = NULLIF(p_national_rule ->> 'base_reduction_percent', '')::NUMERIC,
               base_notes = NULLIF(TRIM(COALESCE(p_national_rule ->> 'base_notes', '')), ''),
               is_active = COALESCE((p_national_rule ->> 'is_active')::BOOLEAN, true),
               metadata_jsonb = COALESCE(p_national_rule -> 'metadata_jsonb', '{}'::JSONB),
               future_tax_payload = COALESCE(p_national_rule -> 'future_tax_payload', '{}'::JSONB),
               updated_by = v_actor,
               updated_at = NOW()
         WHERE id = v_existing_national_rule_id;
    END IF;

    DELETE FROM public.fiscal_icms_rules
     WHERE icms_base_id = v_base_id
       AND target_uf IS NULL
       AND id <> v_existing_national_rule_id;

    FOR v_state_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        v_state_uf := UPPER(TRIM(COALESCE(v_state_item ->> 'target_uf', '')));
        IF v_state_uf = '' THEN
            RAISE EXCEPTION 'State rules require target_uf';
        END IF;

        v_state_rule_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_state_item ->> 'id', '')), '') IS NOT NULL THEN
            BEGIN
                UPDATE public.fiscal_icms_rules rule
                   SET target_uf = v_state_uf,
                       cst_code = TRIM(COALESCE(v_state_item ->> 'cst_code', '')),
                       icms_rate = COALESCE(NULLIF(v_state_item ->> 'icms_rate', '')::NUMERIC, 0),
                       fcp_rate = COALESCE(NULLIF(v_state_item ->> 'fcp_rate', '')::NUMERIC, 0),
                       special_advance_destination = COALESCE((v_state_item ->> 'special_advance_destination')::BOOLEAN, false),
                       differentiate_consumer_final_rate = COALESCE((v_state_item ->> 'differentiate_consumer_final_rate')::BOOLEAN, false),
                       base_calc_type = COALESCE(NULLIF(TRIM(COALESCE(v_state_item ->> 'base_calc_type', '')), ''), 'operation_value'),
                       base_calc_percent = NULLIF(v_state_item ->> 'base_calc_percent', '')::NUMERIC,
                       base_reduction_percent = NULLIF(v_state_item ->> 'base_reduction_percent', '')::NUMERIC,
                       base_notes = NULLIF(TRIM(COALESCE(v_state_item ->> 'base_notes', '')), ''),
                       is_active = COALESCE((v_state_item ->> 'is_active')::BOOLEAN, true),
                       metadata_jsonb = COALESCE(v_state_item -> 'metadata_jsonb', '{}'::JSONB),
                       future_tax_payload = COALESCE(v_state_item -> 'future_tax_payload', '{}'::JSONB),
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule.id = (v_state_item ->> 'id')::UUID
                   AND rule.icms_base_id = v_base_id
                 RETURNING rule.id INTO v_state_rule_id;
            EXCEPTION WHEN invalid_text_representation THEN
                v_state_rule_id := NULL;
            END;
        END IF;

        IF v_state_rule_id IS NULL THEN
            SELECT rule.id
              INTO v_state_rule_id
              FROM public.fiscal_icms_rules rule
             WHERE rule.icms_base_id = v_base_id
               AND rule.target_uf = v_state_uf
             ORDER BY rule.created_at ASC
             LIMIT 1;

            IF v_state_rule_id IS NOT NULL THEN
                UPDATE public.fiscal_icms_rules rule
                   SET cst_code = TRIM(COALESCE(v_state_item ->> 'cst_code', '')),
                       icms_rate = COALESCE(NULLIF(v_state_item ->> 'icms_rate', '')::NUMERIC, 0),
                       fcp_rate = COALESCE(NULLIF(v_state_item ->> 'fcp_rate', '')::NUMERIC, 0),
                       special_advance_destination = COALESCE((v_state_item ->> 'special_advance_destination')::BOOLEAN, false),
                       differentiate_consumer_final_rate = COALESCE((v_state_item ->> 'differentiate_consumer_final_rate')::BOOLEAN, false),
                       base_calc_type = COALESCE(NULLIF(TRIM(COALESCE(v_state_item ->> 'base_calc_type', '')), ''), 'operation_value'),
                       base_calc_percent = NULLIF(v_state_item ->> 'base_calc_percent', '')::NUMERIC,
                       base_reduction_percent = NULLIF(v_state_item ->> 'base_reduction_percent', '')::NUMERIC,
                       base_notes = NULLIF(TRIM(COALESCE(v_state_item ->> 'base_notes', '')), ''),
                       is_active = COALESCE((v_state_item ->> 'is_active')::BOOLEAN, true),
                       metadata_jsonb = COALESCE(v_state_item -> 'metadata_jsonb', '{}'::JSONB),
                       future_tax_payload = COALESCE(v_state_item -> 'future_tax_payload', '{}'::JSONB),
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule.id = v_state_rule_id;
            ELSE
                INSERT INTO public.fiscal_icms_rules (
                    icms_base_id, target_uf, cst_code, icms_rate, fcp_rate,
                    special_advance_destination, differentiate_consumer_final_rate,
                    base_calc_type, base_calc_percent, base_reduction_percent, base_notes,
                    is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
                )
                VALUES (
                    v_base_id,
                    v_state_uf,
                    TRIM(COALESCE(v_state_item ->> 'cst_code', '')),
                    COALESCE(NULLIF(v_state_item ->> 'icms_rate', '')::NUMERIC, 0),
                    COALESCE(NULLIF(v_state_item ->> 'fcp_rate', '')::NUMERIC, 0),
                    COALESCE((v_state_item ->> 'special_advance_destination')::BOOLEAN, false),
                    COALESCE((v_state_item ->> 'differentiate_consumer_final_rate')::BOOLEAN, false),
                    COALESCE(NULLIF(TRIM(COALESCE(v_state_item ->> 'base_calc_type', '')), ''), 'operation_value'),
                    NULLIF(v_state_item ->> 'base_calc_percent', '')::NUMERIC,
                    NULLIF(v_state_item ->> 'base_reduction_percent', '')::NUMERIC,
                    NULLIF(TRIM(COALESCE(v_state_item ->> 'base_notes', '')), ''),
                    COALESCE((v_state_item ->> 'is_active')::BOOLEAN, true),
                    COALESCE(v_state_item -> 'metadata_jsonb', '{}'::JSONB),
                    COALESCE(v_state_item -> 'future_tax_payload', '{}'::JSONB),
                    v_actor,
                    v_actor
                )
                RETURNING id INTO v_state_rule_id;
            END IF;
        END IF;

        v_keep_state_rule_ids := array_append(v_keep_state_rule_ids, v_state_rule_id);
    END LOOP;

    DELETE FROM public.fiscal_icms_rules rule
     WHERE rule.icms_base_id = v_base_id
       AND rule.target_uf IS NOT NULL
       AND NOT (rule.id = ANY(v_keep_state_rule_ids));

    IF COALESCE(jsonb_object_length(p_interstate_rule), 0) > 0 THEN
        v_interstate_target_uf := NULLIF(UPPER(TRIM(COALESCE(p_interstate_rule ->> 'target_uf', ''))), '');
        v_interstate_rule_id := NULL;

        IF NULLIF(TRIM(COALESCE(p_interstate_rule ->> 'id', '')), '') IS NOT NULL THEN
            BEGIN
                UPDATE public.fiscal_icms_interstate_rules rule
                   SET target_uf = v_interstate_target_uf,
                       icms_rate = COALESCE(NULLIF(p_interstate_rule ->> 'icms_rate', '')::NUMERIC, 0),
                       fcp_rate = COALESCE(NULLIF(p_interstate_rule ->> 'fcp_rate', '')::NUMERIC, 0),
                       consumer_final_mode = COALESCE(NULLIF(TRIM(COALESCE(p_interstate_rule ->> 'consumer_final_mode', '')), ''), 'standard'),
                       is_active = COALESCE((p_interstate_rule ->> 'is_active')::BOOLEAN, true),
                       metadata_jsonb = COALESCE(p_interstate_rule -> 'metadata_jsonb', '{}'::JSONB),
                       future_tax_payload = COALESCE(p_interstate_rule -> 'future_tax_payload', '{}'::JSONB),
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule.id = (p_interstate_rule ->> 'id')::UUID
                   AND rule.icms_base_id = v_base_id
                 RETURNING rule.id INTO v_interstate_rule_id;
            EXCEPTION WHEN invalid_text_representation THEN
                v_interstate_rule_id := NULL;
            END;
        END IF;

        IF v_interstate_rule_id IS NULL THEN
            SELECT rule.id
              INTO v_interstate_rule_id
              FROM public.fiscal_icms_interstate_rules rule
             WHERE rule.icms_base_id = v_base_id
               AND rule.target_uf IS NOT DISTINCT FROM v_interstate_target_uf
             ORDER BY rule.created_at ASC
             LIMIT 1;
        END IF;

        IF v_interstate_rule_id IS NULL THEN
            SELECT rule.id
              INTO v_interstate_rule_id
              FROM public.fiscal_icms_interstate_rules rule
             WHERE rule.icms_base_id = v_base_id
             ORDER BY rule.created_at ASC
             LIMIT 1;
        END IF;

        IF v_interstate_rule_id IS NULL THEN
            INSERT INTO public.fiscal_icms_interstate_rules (
                icms_base_id, target_uf, icms_rate, fcp_rate, consumer_final_mode,
                is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
            )
            VALUES (
                v_base_id,
                v_interstate_target_uf,
                COALESCE(NULLIF(p_interstate_rule ->> 'icms_rate', '')::NUMERIC, 0),
                COALESCE(NULLIF(p_interstate_rule ->> 'fcp_rate', '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(COALESCE(p_interstate_rule ->> 'consumer_final_mode', '')), ''), 'standard'),
                COALESCE((p_interstate_rule ->> 'is_active')::BOOLEAN, true),
                COALESCE(p_interstate_rule -> 'metadata_jsonb', '{}'::JSONB),
                COALESCE(p_interstate_rule -> 'future_tax_payload', '{}'::JSONB),
                v_actor,
                v_actor
            )
            RETURNING id INTO v_interstate_rule_id;
        END IF;

        DELETE FROM public.fiscal_icms_interstate_rules rule
         WHERE rule.icms_base_id = v_base_id
           AND rule.id <> v_interstate_rule_id;
    ELSE
        DELETE FROM public.fiscal_icms_interstate_rules rule
         WHERE rule.icms_base_id = v_base_id;
    END IF;

    IF COALESCE(jsonb_object_length(p_st_rule), 0) > 0 THEN
        v_st_target_uf := NULLIF(UPPER(TRIM(COALESCE(p_st_rule ->> 'target_uf', ''))), '');
        v_st_rule_id := NULL;

        IF NULLIF(TRIM(COALESCE(p_st_rule ->> 'id', '')), '') IS NOT NULL THEN
            BEGIN
                UPDATE public.fiscal_icms_st_rules rule
                   SET target_uf = v_st_target_uf,
                       st_enabled = COALESCE((p_st_rule ->> 'st_enabled')::BOOLEAN, false),
                       st_base_calc_type = NULLIF(TRIM(COALESCE(p_st_rule ->> 'st_base_calc_type', '')), ''),
                       st_base_calc_percent = NULLIF(p_st_rule ->> 'st_base_calc_percent', '')::NUMERIC,
                       st_base_reduction_percent = NULLIF(p_st_rule ->> 'st_base_reduction_percent', '')::NUMERIC,
                       st_rate = NULLIF(p_st_rule ->> 'st_rate', '')::NUMERIC,
                       st_fcp_rate = NULLIF(p_st_rule ->> 'st_fcp_rate', '')::NUMERIC,
                       mva_original = NULLIF(p_st_rule ->> 'mva_original', '')::NUMERIC,
                       mva_adjusted = NULLIF(p_st_rule ->> 'mva_adjusted', '')::NUMERIC,
                       st_notes = NULLIF(TRIM(COALESCE(p_st_rule ->> 'st_notes', '')), ''),
                       is_active = COALESCE((p_st_rule ->> 'is_active')::BOOLEAN, true),
                       metadata_jsonb = COALESCE(p_st_rule -> 'metadata_jsonb', '{}'::JSONB),
                       future_tax_payload = COALESCE(p_st_rule -> 'future_tax_payload', '{}'::JSONB),
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule.id = (p_st_rule ->> 'id')::UUID
                   AND rule.icms_base_id = v_base_id
                 RETURNING rule.id INTO v_st_rule_id;
            EXCEPTION WHEN invalid_text_representation THEN
                v_st_rule_id := NULL;
            END;
        END IF;

        IF v_st_rule_id IS NULL THEN
            SELECT rule.id
              INTO v_st_rule_id
              FROM public.fiscal_icms_st_rules rule
             WHERE rule.icms_base_id = v_base_id
               AND rule.target_uf IS NOT DISTINCT FROM v_st_target_uf
             ORDER BY rule.created_at ASC
             LIMIT 1;
        END IF;

        IF v_st_rule_id IS NULL THEN
            SELECT rule.id
              INTO v_st_rule_id
              FROM public.fiscal_icms_st_rules rule
             WHERE rule.icms_base_id = v_base_id
             ORDER BY rule.created_at ASC
             LIMIT 1;
        END IF;

        IF v_st_rule_id IS NULL THEN
            INSERT INTO public.fiscal_icms_st_rules (
                icms_base_id, target_uf, st_enabled, st_base_calc_type, st_base_calc_percent,
                st_base_reduction_percent, st_rate, st_fcp_rate, mva_original, mva_adjusted,
                st_notes, is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
            )
            VALUES (
                v_base_id,
                v_st_target_uf,
                COALESCE((p_st_rule ->> 'st_enabled')::BOOLEAN, false),
                NULLIF(TRIM(COALESCE(p_st_rule ->> 'st_base_calc_type', '')), ''),
                NULLIF(p_st_rule ->> 'st_base_calc_percent', '')::NUMERIC,
                NULLIF(p_st_rule ->> 'st_base_reduction_percent', '')::NUMERIC,
                NULLIF(p_st_rule ->> 'st_rate', '')::NUMERIC,
                NULLIF(p_st_rule ->> 'st_fcp_rate', '')::NUMERIC,
                NULLIF(p_st_rule ->> 'mva_original', '')::NUMERIC,
                NULLIF(p_st_rule ->> 'mva_adjusted', '')::NUMERIC,
                NULLIF(TRIM(COALESCE(p_st_rule ->> 'st_notes', '')), ''),
                COALESCE((p_st_rule ->> 'is_active')::BOOLEAN, true),
                COALESCE(p_st_rule -> 'metadata_jsonb', '{}'::JSONB),
                COALESCE(p_st_rule -> 'future_tax_payload', '{}'::JSONB),
                v_actor,
                v_actor
            )
            RETURNING id INTO v_st_rule_id;
        END IF;

        DELETE FROM public.fiscal_icms_st_rules rule
         WHERE rule.icms_base_id = v_base_id
           AND rule.id <> v_st_rule_id;
    ELSE
        DELETE FROM public.fiscal_icms_st_rules rule
         WHERE rule.icms_base_id = v_base_id;
    END IF;

    RETURN QUERY SELECT v_base_id, v_created, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_icms_base(
    UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
