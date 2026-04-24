ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS pis_unit_rate NUMERIC(15, 6),
    ADD COLUMN IF NOT EXISTS cofins_unit_rate NUMERIC(15, 6),
    ADD COLUMN IF NOT EXISTS approx_tax_rate_percent NUMERIC(7, 4);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'product_tax_profiles_unit_rates_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_unit_rates_check
            CHECK (
                (pis_unit_rate IS NULL OR pis_unit_rate >= 0)
                AND (cofins_unit_rate IS NULL OR cofins_unit_rate >= 0)
                AND (approx_tax_rate_percent IS NULL OR (approx_tax_rate_percent >= 0 AND approx_tax_rate_percent <= 100))
            );
    END IF;
END;
$$;

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
    p_pis_unit_rate NUMERIC DEFAULT NULL,
    p_cofins_unit_rate NUMERIC DEFAULT NULL,
    p_approx_tax_rate_percent NUMERIC DEFAULT NULL,
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
    v_result RECORD;
BEGIN
    SELECT *
      INTO v_result
      FROM public.admin_upsert_product_tax_profile(
        p_tax_profile_id,
        p_name,
        p_code,
        p_description,
        p_ncm,
        p_cest,
        p_origin_code,
        p_commercial_unit,
        p_tax_unit,
        p_ean_gtin,
        p_tax_ean_gtin,
        p_default_fiscal_description,
        p_fiscal_type,
        p_item_type,
        p_has_substitution_tax,
        p_requires_cest,
        p_has_ipi,
        p_ipi_cst_out,
        p_ipi_enquadramento_codigo,
        p_pis_cst,
        p_cofins_cst,
        p_pis_aliquota,
        p_cofins_aliquota,
        p_default_output_cfop,
        p_default_input_cfop,
        p_internal_fiscal_code,
        p_default_fiscal_notes,
        p_is_active,
        p_requires_tax_configuration,
        p_future_tax_payload,
        p_metadata_jsonb,
        p_ncm_reference_id,
        p_ncm_version_id,
        p_tipi_reference_id,
        p_tipi_version_id,
        p_cest_reference_id,
        p_cest_version_id,
        p_default_output_cfop_reference_id,
        p_default_output_cfop_version_id,
        p_default_input_cfop_reference_id,
        p_default_input_cfop_version_id,
        p_icms_base_id,
        p_ibscbs_base_id,
        p_ibscbs_version_id,
        p_default_output_cfop_config_id,
        p_default_input_cfop_config_id,
        p_fiscal_reference_snapshot_jsonb,
        p_rules
      );

    UPDATE public.product_tax_profiles
       SET pis_unit_rate = p_pis_unit_rate,
           cofins_unit_rate = p_cofins_unit_rate,
           approx_tax_rate_percent = p_approx_tax_rate_percent,
           updated_by = v_actor,
           updated_at = NOW()
     WHERE id = v_result.tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(
        v_result.tax_profile_id,
        CASE WHEN v_result.created THEN 'create' ELSE 'update' END,
        v_actor,
        NULL
    );

    RETURN QUERY SELECT v_result.tax_profile_id, v_result.created, v_result.version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN,
    JSONB, JSONB, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, JSONB
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_duplicate_product_tax_profile(
    p_tax_profile_id UUID,
    p_new_name TEXT DEFAULT NULL,
    p_new_code TEXT DEFAULT NULL
)
RETURNS TABLE (
    new_tax_profile_id UUID,
    new_name TEXT,
    new_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_source RECORD;
    v_new_id UUID;
BEGIN
    SELECT * INTO v_source
      FROM public.product_tax_profiles
     WHERE id = p_tax_profile_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
    END IF;

    INSERT INTO public.product_tax_profiles (
        name, code, description, ncm, cest, origin_code,
        commercial_unit, tax_unit, ean_gtin, tax_ean_gtin,
        default_fiscal_description, fiscal_type, item_type,
        has_substitution_tax, requires_cest, has_ipi,
        ipi_cst_out, ipi_enquadramento_codigo, pis_cst, cofins_cst,
        pis_aliquota, cofins_aliquota, pis_unit_rate, cofins_unit_rate,
        approx_tax_rate_percent, default_output_cfop, default_input_cfop,
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
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '-COPIA'),
        v_source.description,
        v_source.ncm,
        v_source.cest,
        v_source.origin_code,
        v_source.commercial_unit,
        v_source.tax_unit,
        v_source.ean_gtin,
        v_source.tax_ean_gtin,
        v_source.default_fiscal_description,
        v_source.fiscal_type,
        v_source.item_type,
        v_source.has_substitution_tax,
        v_source.requires_cest,
        v_source.has_ipi,
        v_source.ipi_cst_out,
        v_source.ipi_enquadramento_codigo,
        v_source.pis_cst,
        v_source.cofins_cst,
        v_source.pis_aliquota,
        v_source.cofins_aliquota,
        v_source.pis_unit_rate,
        v_source.cofins_unit_rate,
        v_source.approx_tax_rate_percent,
        v_source.default_output_cfop,
        v_source.default_input_cfop,
        v_source.internal_fiscal_code,
        v_source.default_fiscal_notes,
        false,
        v_source.requires_tax_configuration,
        COALESCE(v_source.future_tax_payload, '{}'::JSONB),
        COALESCE(v_source.metadata_jsonb, '{}'::JSONB),
        v_source.ncm_reference_id,
        v_source.ncm_version_id,
        v_source.tipi_reference_id,
        v_source.tipi_version_id,
        v_source.cest_reference_id,
        v_source.cest_version_id,
        v_source.default_output_cfop_reference_id,
        v_source.default_output_cfop_version_id,
        v_source.default_input_cfop_reference_id,
        v_source.default_input_cfop_version_id,
        v_source.icms_base_id,
        v_source.ibscbs_base_id,
        v_source.ibscbs_version_id,
        v_source.default_output_cfop_config_id,
        v_source.default_input_cfop_config_id,
        COALESCE(v_source.fiscal_reference_snapshot_jsonb, '{}'::JSONB),
        v_actor,
        v_actor
    )
    RETURNING id INTO v_new_id;

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
    SELECT
        v_new_id,
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
        v_actor,
        v_actor
      FROM public.product_tax_profile_rules
     WHERE tax_profile_id = p_tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(
        v_new_id,
        'duplicate',
        v_actor,
        'Duplicated from existing profile'
    );

    RETURN QUERY
    SELECT
        v_new_id,
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '-COPIA');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_duplicate_product_tax_profile(UUID, TEXT, TEXT)
TO authenticated, service_role;
