-- Manual CFOP creation using the enterprise CFOP editor

CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_cfop_manual_config(
    p_cfop_config_id UUID DEFAULT NULL,
    p_cfop_entry_id UUID DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_operation_direction TEXT DEFAULT 'both',
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
    cfop_entry_id UUID,
    cfop_version_id UUID,
    created BOOLEAN,
    configuration_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_manual_version_id UUID;
    v_entry_id UUID;
    v_code TEXT := regexp_replace(COALESCE(p_code, ''), '\D', '', 'g');
    v_description TEXT := NULLIF(TRIM(COALESCE(p_description, '')), '');
    v_direction TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operation_direction, '')), ''), 'both');
    v_result RECORD;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_operation_group, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_operation_group is required';
    END IF;

    IF v_code IS NULL OR v_code !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'Manual CFOP code must contain exactly 4 digits';
    END IF;

    IF v_description IS NULL THEN
        RAISE EXCEPTION 'Manual CFOP description is required';
    END IF;

    IF v_direction NOT IN ('outbound', 'inbound', 'both') THEN
        RAISE EXCEPTION 'Manual CFOP direction must be outbound, inbound or both';
    END IF;

    SELECT version_row.id
      INTO v_manual_version_id
      FROM public.fiscal_reference_versions version_row
     WHERE version_row.table_type = 'cfop'
       AND version_row.source_type = 'manual'
     ORDER BY version_row.imported_at DESC NULLS LAST, version_row.created_at DESC
     LIMIT 1;

    IF v_manual_version_id IS NULL THEN
        INSERT INTO public.fiscal_reference_versions (
            table_type,
            version_label,
            imported_by,
            imported_at,
            valid_from,
            is_active,
            source_type,
            row_count,
            metadata_jsonb,
            future_tax_payload
        )
        VALUES (
            'cfop',
            'CFOP-MANUAL',
            v_actor,
            NOW(),
            CURRENT_DATE,
            false,
            'manual',
            0,
            '{"manual_workspace":true,"governance":"manual"}'::JSONB,
            '{}'::JSONB
        )
        RETURNING id INTO v_manual_version_id;
    END IF;

    IF p_cfop_entry_id IS NOT NULL THEN
        SELECT entry.id, entry.version_id
          INTO v_entry_id, v_manual_version_id
          FROM public.fiscal_cfop_entries entry
          INNER JOIN public.fiscal_reference_versions version_row
            ON version_row.id = entry.version_id
         WHERE entry.id = p_cfop_entry_id
           AND version_row.table_type = 'cfop'
           AND version_row.source_type = 'manual'
         LIMIT 1;

        IF v_entry_id IS NULL THEN
            RAISE EXCEPTION 'Manual CFOP entry % not found', p_cfop_entry_id;
        END IF;
    END IF;

    PERFORM 1
      FROM public.fiscal_cfop_entries entry
      INNER JOIN public.fiscal_reference_versions version_row
        ON version_row.id = entry.version_id
     WHERE entry.code = v_code
       AND version_row.table_type = 'cfop'
       AND (version_row.source_type = 'manual' OR version_row.is_active = true)
       AND (p_cfop_entry_id IS NULL OR entry.id <> p_cfop_entry_id)
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'CFOP % already exists in an active operational context', v_code;
    END IF;

    IF v_entry_id IS NULL THEN
        INSERT INTO public.fiscal_cfop_entries (
            version_id,
            code,
            description,
            operation_direction,
            metadata_jsonb,
            future_tax_payload
        )
        VALUES (
            v_manual_version_id,
            v_code,
            v_description,
            v_direction,
            jsonb_strip_nulls(COALESCE(p_metadata_jsonb, '{}'::JSONB) || '{"manual_entry":true}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB)
        )
        RETURNING id INTO v_entry_id;
    ELSE
        UPDATE public.fiscal_cfop_entries
           SET code = v_code,
               description = v_description,
               operation_direction = v_direction,
               metadata_jsonb = jsonb_strip_nulls(COALESCE(p_metadata_jsonb, '{}'::JSONB) || '{"manual_entry":true}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB)
         WHERE id = v_entry_id;
    END IF;

    UPDATE public.fiscal_reference_versions version_row
       SET row_count = (
               SELECT COUNT(*)
                 FROM public.fiscal_cfop_entries entry
                WHERE entry.version_id = v_manual_version_id
           ),
           updated_at = NOW()
     WHERE version_row.id = v_manual_version_id;

    SELECT *
      INTO v_result
      FROM public.admin_upsert_fiscal_cfop_config(
          p_cfop_config_id => p_cfop_config_id,
          p_cfop_entry_id => v_entry_id,
          p_cfop_version_id => v_manual_version_id,
          p_operation_group => p_operation_group,
          p_general_description => p_general_description,
          p_default_note => p_default_note,
          p_operation_scope => p_operation_scope,
          p_applies_to_own_manufacture => p_applies_to_own_manufacture,
          p_applies_to_resale => p_applies_to_resale,
          p_applies_outside_establishment => p_applies_outside_establishment,
          p_applies_consumer_final => p_applies_consumer_final,
          p_applies_taxpayer => p_applies_taxpayer,
          p_supports_st => p_supports_st,
          p_impacts_icms => p_impacts_icms,
          p_impacts_ibscbs => p_impacts_ibscbs,
          p_sum_operation_total_invoice => p_sum_operation_total_invoice,
          p_is_recommended => p_is_recommended,
          p_is_legacy => p_is_legacy,
          p_is_active => p_is_active,
          p_icms_config => p_icms_config,
          p_ibscbs_config => p_ibscbs_config,
          p_piscofins_config => p_piscofins_config,
          p_metadata_jsonb => COALESCE(p_metadata_jsonb, '{}'::JSONB),
          p_future_tax_payload => COALESCE(p_future_tax_payload, '{}'::JSONB)
      );

    RETURN QUERY
    SELECT
        v_result.cfop_config_id,
        v_entry_id,
        v_manual_version_id,
        v_result.created,
        v_result.configuration_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_cfop_manual_config(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN,
    BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;
