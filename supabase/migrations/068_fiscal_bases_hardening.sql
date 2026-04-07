-- ============================================================
-- Migration 068: Fiscal bases hardening and integrity closure
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_reference_versions_table_type_label
    ON public.fiscal_reference_versions(table_type, version_label);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_import_batch_items_batch_row
    ON public.fiscal_import_batch_items(batch_id, row_number);

ALTER TABLE public.fiscal_import_batch_items
    ADD COLUMN IF NOT EXISTS validation_warnings_jsonb JSONB NOT NULL DEFAULT '[]'::JSONB;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batch_items_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batch_items
            DROP CONSTRAINT fiscal_import_batch_items_payload_check;
    END IF;

    ALTER TABLE public.fiscal_import_batch_items
        ADD CONSTRAINT fiscal_import_batch_items_payload_check
        CHECK (
            jsonb_typeof(raw_payload_jsonb) = 'object'
            AND jsonb_typeof(normalized_payload_jsonb) = 'object'
            AND jsonb_typeof(validation_errors_jsonb) = 'array'
            AND jsonb_typeof(validation_warnings_jsonb) = 'array'
        );
END $$;

CREATE OR REPLACE FUNCTION public.validate_product_tax_profile_reference_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_table_type TEXT;
BEGIN
    IF NEW.ncm_reference_id IS NOT NULL AND NEW.ncm_version_id IS NULL THEN
        RAISE EXCEPTION 'NCM reference requires NCM version';
    END IF;
    IF NEW.ncm_reference_id IS NULL AND NEW.ncm_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'NCM version requires NCM reference';
    END IF;
    IF NEW.tipi_reference_id IS NOT NULL AND NEW.tipi_version_id IS NULL THEN
        RAISE EXCEPTION 'TIPI reference requires TIPI version';
    END IF;
    IF NEW.tipi_reference_id IS NULL AND NEW.tipi_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'TIPI version requires TIPI reference';
    END IF;
    IF NEW.cest_reference_id IS NOT NULL AND NEW.cest_version_id IS NULL THEN
        RAISE EXCEPTION 'CEST reference requires CEST version';
    END IF;
    IF NEW.cest_reference_id IS NULL AND NEW.cest_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'CEST version requires CEST reference';
    END IF;
    IF NEW.default_output_cfop_reference_id IS NOT NULL AND NEW.default_output_cfop_version_id IS NULL THEN
        RAISE EXCEPTION 'Output CFOP reference requires CFOP version';
    END IF;
    IF NEW.default_output_cfop_reference_id IS NULL AND NEW.default_output_cfop_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'Output CFOP version requires CFOP reference';
    END IF;
    IF NEW.default_input_cfop_reference_id IS NOT NULL AND NEW.default_input_cfop_version_id IS NULL THEN
        RAISE EXCEPTION 'Input CFOP reference requires CFOP version';
    END IF;
    IF NEW.default_input_cfop_reference_id IS NULL AND NEW.default_input_cfop_version_id IS NOT NULL THEN
        RAISE EXCEPTION 'Input CFOP version requires CFOP reference';
    END IF;

    IF NEW.ncm_version_id IS NOT NULL THEN
        SELECT table_type INTO v_table_type
          FROM public.fiscal_reference_versions
         WHERE id = NEW.ncm_version_id;
        IF v_table_type IS DISTINCT FROM 'ncm' THEN
            RAISE EXCEPTION 'ncm_version_id must point to an NCM version';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.fiscal_ncm_entries
             WHERE id = NEW.ncm_reference_id
               AND version_id = NEW.ncm_version_id
        ) THEN
            RAISE EXCEPTION 'NCM reference does not belong to informed version';
        END IF;
    END IF;

    IF NEW.tipi_version_id IS NOT NULL THEN
        SELECT table_type INTO v_table_type
          FROM public.fiscal_reference_versions
         WHERE id = NEW.tipi_version_id;
        IF v_table_type IS DISTINCT FROM 'tipi' THEN
            RAISE EXCEPTION 'tipi_version_id must point to a TIPI version';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.fiscal_tipi_entries
             WHERE id = NEW.tipi_reference_id
               AND version_id = NEW.tipi_version_id
        ) THEN
            RAISE EXCEPTION 'TIPI reference does not belong to informed version';
        END IF;
    END IF;

    IF NEW.cest_version_id IS NOT NULL THEN
        SELECT table_type INTO v_table_type
          FROM public.fiscal_reference_versions
         WHERE id = NEW.cest_version_id;
        IF v_table_type IS DISTINCT FROM 'cest' THEN
            RAISE EXCEPTION 'cest_version_id must point to a CEST version';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.fiscal_cest_entries
             WHERE id = NEW.cest_reference_id
               AND version_id = NEW.cest_version_id
        ) THEN
            RAISE EXCEPTION 'CEST reference does not belong to informed version';
        END IF;
    END IF;

    IF NEW.default_output_cfop_version_id IS NOT NULL THEN
        SELECT table_type INTO v_table_type
          FROM public.fiscal_reference_versions
         WHERE id = NEW.default_output_cfop_version_id;
        IF v_table_type IS DISTINCT FROM 'cfop' THEN
            RAISE EXCEPTION 'default_output_cfop_version_id must point to a CFOP version';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.fiscal_cfop_entries
             WHERE id = NEW.default_output_cfop_reference_id
               AND version_id = NEW.default_output_cfop_version_id
        ) THEN
            RAISE EXCEPTION 'Output CFOP reference does not belong to informed version';
        END IF;
    END IF;

    IF NEW.default_input_cfop_version_id IS NOT NULL THEN
        SELECT table_type INTO v_table_type
          FROM public.fiscal_reference_versions
         WHERE id = NEW.default_input_cfop_version_id;
        IF v_table_type IS DISTINCT FROM 'cfop' THEN
            RAISE EXCEPTION 'default_input_cfop_version_id must point to a CFOP version';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.fiscal_cfop_entries
             WHERE id = NEW.default_input_cfop_reference_id
               AND version_id = NEW.default_input_cfop_version_id
        ) THEN
            RAISE EXCEPTION 'Input CFOP reference does not belong to informed version';
        END IF;
    END IF;

    IF NEW.fiscal_reference_snapshot_jsonb IS NULL OR jsonb_typeof(NEW.fiscal_reference_snapshot_jsonb) <> 'object' THEN
        RAISE EXCEPTION 'Fiscal reference snapshot must be a JSON object';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_tax_profile_reference_integrity ON public.product_tax_profiles;
CREATE TRIGGER trg_validate_product_tax_profile_reference_integrity
    BEFORE INSERT OR UPDATE OF
        ncm_reference_id,
        ncm_version_id,
        tipi_reference_id,
        tipi_version_id,
        cest_reference_id,
        cest_version_id,
        default_output_cfop_reference_id,
        default_output_cfop_version_id,
        default_input_cfop_reference_id,
        default_input_cfop_version_id,
        fiscal_reference_snapshot_jsonb
    ON public.product_tax_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_product_tax_profile_reference_integrity();

CREATE OR REPLACE FUNCTION public.admin_activate_fiscal_reference_version(
    p_version_id UUID
)
RETURNS TABLE (
    version_id UUID,
    table_type TEXT,
    is_active BOOLEAN,
    deactivated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_target RECORD;
    v_deactivated_count INTEGER := 0;
BEGIN
    SELECT *
      INTO v_target
      FROM public.fiscal_reference_versions
     WHERE id = p_version_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal reference version % not found', p_version_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('fiscal_reference_versions:' || v_target.table_type));

    UPDATE public.fiscal_reference_versions
       SET is_active = false,
           valid_to = COALESCE(valid_to, CURRENT_DATE),
           updated_at = NOW()
     WHERE table_type = v_target.table_type
       AND is_active = true
       AND id <> p_version_id;

    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    UPDATE public.fiscal_reference_versions
       SET is_active = true,
           valid_from = COALESCE(valid_from, CURRENT_DATE),
           valid_to = NULL,
           activated_at = NOW(),
           activated_by = v_actor,
           updated_at = NOW()
     WHERE id = p_version_id;

    RETURN QUERY
    SELECT
        v_target.id,
        v_target.table_type,
        true,
        v_deactivated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_product_tax_context(
    p_product_variant_id UUID,
    p_store_id UUID,
    p_operation_direction TEXT DEFAULT 'outbound',
    p_issue_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_profile_id UUID,
    tax_profile_version INTEGER,
    ncm TEXT,
    cest TEXT,
    origin_code TEXT,
    resolved_cfop TEXT,
    applied_rule_id UUID,
    context_jsonb JSONB,
    payload_jsonb JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_id UUID;
    v_destination_uf TEXT;
    v_profile RECORD;
    v_rule RECORD;
BEGIN
    SELECT pv.product_id
      INTO v_product_id
      FROM public.product_variants pv
     WHERE pv.id = p_product_variant_id
     LIMIT 1;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Product variant % not found', p_product_variant_id;
    END IF;

    SELECT UPPER(COALESCE(sa.state, s.state))
      INTO v_destination_uf
      FROM public.stores s
      LEFT JOIN LATERAL (
        SELECT state
          FROM public.store_addresses
         WHERE store_id = s.id
           AND is_main = true
         ORDER BY created_at ASC
         LIMIT 1
      ) sa ON true
     WHERE s.id = p_store_id
     LIMIT 1;

    SELECT tp.*
      INTO v_profile
      FROM public.products p
      LEFT JOIN public.product_tax_profiles tp
        ON tp.id = p.tax_profile_id
     WHERE p.id = v_product_id
     LIMIT 1;

    IF v_profile.id IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::UUID,
            jsonb_build_object(
                'operation_direction', COALESCE(p_operation_direction, 'outbound'),
                'destination_uf', v_destination_uf,
                'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
                'rule_applied', false
            ),
            '{}'::JSONB;
        RETURN;
    END IF;

    SELECT r.*
      INTO v_rule
      FROM public.product_tax_profile_rules r
     WHERE r.tax_profile_id = v_profile.id
       AND r.is_active = true
       AND r.operation_direction = COALESCE(p_operation_direction, 'outbound')
       AND (r.destination_uf IS NULL OR r.destination_uf = v_destination_uf)
       AND (r.effective_from IS NULL OR r.effective_from <= COALESCE(p_issue_date, CURRENT_DATE))
       AND (r.effective_to IS NULL OR r.effective_to >= COALESCE(p_issue_date, CURRENT_DATE))
     ORDER BY r.priority DESC, r.created_at DESC
     LIMIT 1;

    RETURN QUERY
    SELECT
        v_profile.id,
        v_profile.version,
        v_profile.ncm,
        v_profile.cest,
        v_profile.origin_code,
        COALESCE(
            v_rule.cfop_override,
            CASE
                WHEN COALESCE(p_operation_direction, 'outbound') = 'inbound' THEN v_profile.default_input_cfop
                ELSE v_profile.default_output_cfop
            END
        ),
        v_rule.id,
        jsonb_strip_nulls(
            jsonb_build_object(
                'operation_direction', COALESCE(p_operation_direction, 'outbound'),
                'destination_uf', v_destination_uf,
                'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
                'rule_applied', v_rule.id IS NOT NULL,
                'rule_priority', v_rule.priority,
                'tax_profile_version', v_profile.version
            )
        ),
        jsonb_strip_nulls(
            jsonb_build_object(
                'fiscal_type', v_profile.fiscal_type,
                'item_type', v_profile.item_type,
                'has_substitution_tax', v_profile.has_substitution_tax,
                'has_ipi', v_profile.has_ipi,
                'ipi_cst_out', v_profile.ipi_cst_out,
                'ipi_enquadramento_codigo', v_profile.ipi_enquadramento_codigo,
                'pis_cst', v_profile.pis_cst,
                'cofins_cst', v_profile.cofins_cst,
                'pis_aliquota', v_profile.pis_aliquota,
                'cofins_aliquota', v_profile.cofins_aliquota,
                'internal_fiscal_code', v_profile.internal_fiscal_code,
                'ncm_version_id', v_profile.ncm_version_id,
                'tipi_version_id', v_profile.tipi_version_id,
                'cest_version_id', v_profile.cest_version_id,
                'default_output_cfop_version_id', v_profile.default_output_cfop_version_id,
                'default_input_cfop_version_id', v_profile.default_input_cfop_version_id,
                'fiscal_reference_snapshot', v_profile.fiscal_reference_snapshot_jsonb
            )
            || COALESCE(v_profile.future_tax_payload, '{}'::JSONB)
            || COALESCE(v_rule.rule_payload_jsonb, '{}'::JSONB)
            || COALESCE(v_rule.future_tax_payload, '{}'::JSONB)
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_order_fiscal_snapshot(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.orders o
       SET fiscal_ready = NOT EXISTS (
                SELECT 1
                  FROM public.order_items oi
                 WHERE oi.order_id = p_order_id
                   AND (
                     oi.tax_profile_id IS NULL
                     OR NULLIF(TRIM(COALESCE(oi.fiscal_cfop, '')), '') IS NULL
                     OR NULLIF(TRIM(COALESCE(oi.fiscal_ncm, '')), '') IS NULL
                   )
           ),
           fiscal_snapshot = jsonb_build_object(
                'generated_at', NOW(),
                'items_count', (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = p_order_id),
                'missing_items_count', (
                    SELECT COUNT(*)
                      FROM public.order_items oi
                     WHERE oi.order_id = p_order_id
                       AND (
                         oi.tax_profile_id IS NULL
                         OR NULLIF(TRIM(COALESCE(oi.fiscal_cfop, '')), '') IS NULL
                         OR NULLIF(TRIM(COALESCE(oi.fiscal_ncm, '')), '') IS NULL
                       )
                ),
                'items', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'order_item_id', oi.id,
                            'tax_profile_id', oi.tax_profile_id,
                            'tax_profile_version', oi.tax_profile_version,
                            'ncm', oi.fiscal_ncm,
                            'cest', oi.fiscal_cest,
                            'origin_code', oi.fiscal_origin_code,
                            'cfop', oi.fiscal_cfop,
                            'context', oi.fiscal_context,
                            'payload', oi.fiscal_payload
                        )
                        ORDER BY oi.created_at ASC
                    )
                    FROM public.order_items oi
                    WHERE oi.order_id = p_order_id
                ), '[]'::JSONB)
           )
     WHERE o.id = p_order_id;
END;
$$;
