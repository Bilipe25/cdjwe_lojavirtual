-- Enterprise ICMS bases inside Fiscal Bases hub

ALTER TABLE public.fiscal_catalog_items
    DROP CONSTRAINT IF EXISTS fiscal_catalog_items_type_check;

ALTER TABLE public.fiscal_catalog_items
    ADD CONSTRAINT fiscal_catalog_items_type_check
    CHECK (
        catalog_type IN (
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
        )
    );

INSERT INTO public.fiscal_catalog_items (catalog_type, code, label, description, sort_order, is_active, metadata_jsonb)
VALUES
    ('icms_cst', '00', '00 - Tributada integralmente', 'ICMS cobrado integralmente sem reducao de base.', 10, true, '{"is_taxed": true, "allows_credit": true}'::jsonb),
    ('icms_cst', '10', '10 - Tributada com ICMS ST', 'ICMS proprio com cobranca concomitante de substituicao tributaria.', 20, true, '{"is_taxed": true, "has_st": true}'::jsonb),
    ('icms_cst', '20', '20 - Tributada com reducao de base', 'ICMS tributado com reducao de base de calculo.', 30, true, '{"is_taxed": true, "supports_base_reduction": true}'::jsonb),
    ('icms_cst', '30', '30 - Isenta ou nao tributada com ICMS ST', 'Saida sem ICMS proprio com retencao anterior ou aplicavel de ST.', 40, true, '{"has_st": true, "supports_base_reduction": false}'::jsonb),
    ('icms_cst', '40', '40 - Isenta', 'Operacao isenta de ICMS.', 50, true, '{"is_taxed": false}'::jsonb),
    ('icms_cst', '41', '41 - Nao tributada', 'Operacao nao tributada pelo ICMS.', 60, true, '{"is_taxed": false}'::jsonb),
    ('icms_cst', '50', '50 - Suspensao', 'Operacao com suspensao de ICMS.', 70, true, '{"is_taxed": false, "special_regime": true}'::jsonb),
    ('icms_cst', '51', '51 - Diferimento', 'Operacao com diferimento total ou parcial do ICMS.', 80, true, '{"is_taxed": true, "special_regime": true}'::jsonb),
    ('icms_cst', '60', '60 - ICMS cobrado anteriormente por ST', 'Mercadoria com ICMS cobrado anteriormente por substituicao tributaria.', 90, true, '{"has_st": true, "st_already_collected": true}'::jsonb),
    ('icms_cst', '70', '70 - Tributada com reducao e ICMS ST', 'Tributacao do ICMS com reducao de base e estrutura de ST.', 100, true, '{"is_taxed": true, "has_st": true, "supports_base_reduction": true}'::jsonb),
    ('icms_cst', '90', '90 - Outras', 'Reserva para demais cenarios de ICMS que exigem configuracao adicional.', 110, true, '{"is_taxed": true, "requires_review": true}'::jsonb)
ON CONFLICT (catalog_type, code) DO UPDATE
   SET label = EXCLUDED.label,
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       metadata_jsonb = EXCLUDED.metadata_jsonb,
       updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.fiscal_icms_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_icms_bases_code_unique UNIQUE (code),
    CONSTRAINT fiscal_icms_bases_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_icms_bases_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_fiscal_icms_bases_name
    ON public.fiscal_icms_bases USING btree (name);

CREATE INDEX IF NOT EXISTS idx_fiscal_icms_bases_is_active
    ON public.fiscal_icms_bases USING btree (is_active);

CREATE TABLE IF NOT EXISTS public.fiscal_icms_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icms_base_id UUID NOT NULL REFERENCES public.fiscal_icms_bases(id) ON DELETE CASCADE,
    target_uf TEXT,
    cst_catalog_type TEXT NOT NULL DEFAULT 'icms_cst',
    cst_code TEXT NOT NULL,
    icms_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    fcp_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    special_advance_destination BOOLEAN NOT NULL DEFAULT false,
    differentiate_consumer_final_rate BOOLEAN NOT NULL DEFAULT false,
    base_calc_type TEXT NOT NULL DEFAULT 'operation_value',
    base_calc_percent NUMERIC(7, 4),
    base_reduction_percent NUMERIC(7, 4),
    base_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_icms_rules_target_uf_check CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$'),
    CONSTRAINT fiscal_icms_rules_cst_catalog_type_check CHECK (cst_catalog_type = 'icms_cst'),
    CONSTRAINT fiscal_icms_rules_cst_fk
        FOREIGN KEY (cst_catalog_type, cst_code)
        REFERENCES public.fiscal_catalog_items(catalog_type, code),
    CONSTRAINT fiscal_icms_rules_icms_rate_check CHECK (icms_rate >= 0 AND icms_rate <= 100),
    CONSTRAINT fiscal_icms_rules_fcp_rate_check CHECK (fcp_rate >= 0 AND fcp_rate <= 100),
    CONSTRAINT fiscal_icms_rules_base_calc_percent_check CHECK (base_calc_percent IS NULL OR (base_calc_percent >= 0 AND base_calc_percent <= 100)),
    CONSTRAINT fiscal_icms_rules_base_reduction_percent_check CHECK (base_reduction_percent IS NULL OR (base_reduction_percent >= 0 AND base_reduction_percent <= 100)),
    CONSTRAINT fiscal_icms_rules_base_calc_type_check CHECK (base_calc_type IN ('operation_value', 'operation_value_with_additions', 'fixed_percent', 'other')),
    CONSTRAINT fiscal_icms_rules_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_icms_rules_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_icms_rules_active_unique
    ON public.fiscal_icms_rules (icms_base_id, COALESCE(target_uf, '__BASE__'))
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fiscal_icms_rules_target_uf
    ON public.fiscal_icms_rules (target_uf);

CREATE TABLE IF NOT EXISTS public.fiscal_icms_interstate_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icms_base_id UUID NOT NULL REFERENCES public.fiscal_icms_bases(id) ON DELETE CASCADE,
    target_uf TEXT,
    icms_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    fcp_rate NUMERIC(7, 4) NOT NULL DEFAULT 0,
    consumer_final_mode TEXT NOT NULL DEFAULT 'standard',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_icms_interstate_rules_target_uf_check CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$'),
    CONSTRAINT fiscal_icms_interstate_rules_icms_rate_check CHECK (icms_rate >= 0 AND icms_rate <= 100),
    CONSTRAINT fiscal_icms_interstate_rules_fcp_rate_check CHECK (fcp_rate >= 0 AND fcp_rate <= 100),
    CONSTRAINT fiscal_icms_interstate_rules_consumer_final_mode_check CHECK (consumer_final_mode IN ('standard', 'consumer_final_specific')),
    CONSTRAINT fiscal_icms_interstate_rules_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_icms_interstate_rules_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_icms_interstate_rules_active_unique
    ON public.fiscal_icms_interstate_rules (icms_base_id, COALESCE(target_uf, '__INTERSTATE__'))
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.fiscal_icms_st_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icms_base_id UUID NOT NULL REFERENCES public.fiscal_icms_bases(id) ON DELETE CASCADE,
    target_uf TEXT,
    st_enabled BOOLEAN NOT NULL DEFAULT false,
    st_base_calc_type TEXT,
    st_base_calc_percent NUMERIC(7, 4),
    st_base_reduction_percent NUMERIC(7, 4),
    st_rate NUMERIC(7, 4),
    st_fcp_rate NUMERIC(7, 4),
    mva_original NUMERIC(7, 4),
    mva_adjusted NUMERIC(7, 4),
    st_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_icms_st_rules_target_uf_check CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$'),
    CONSTRAINT fiscal_icms_st_rules_base_calc_type_check CHECK (st_base_calc_type IS NULL OR st_base_calc_type IN ('mva', 'suggested_price', 'fixed_percent', 'other')),
    CONSTRAINT fiscal_icms_st_rules_base_calc_percent_check CHECK (st_base_calc_percent IS NULL OR (st_base_calc_percent >= 0 AND st_base_calc_percent <= 100)),
    CONSTRAINT fiscal_icms_st_rules_base_reduction_percent_check CHECK (st_base_reduction_percent IS NULL OR (st_base_reduction_percent >= 0 AND st_base_reduction_percent <= 100)),
    CONSTRAINT fiscal_icms_st_rules_st_rate_check CHECK (st_rate IS NULL OR (st_rate >= 0 AND st_rate <= 100)),
    CONSTRAINT fiscal_icms_st_rules_st_fcp_rate_check CHECK (st_fcp_rate IS NULL OR (st_fcp_rate >= 0 AND st_fcp_rate <= 100)),
    CONSTRAINT fiscal_icms_st_rules_mva_original_check CHECK (mva_original IS NULL OR (mva_original >= 0 AND mva_original <= 100)),
    CONSTRAINT fiscal_icms_st_rules_mva_adjusted_check CHECK (mva_adjusted IS NULL OR (mva_adjusted >= 0 AND mva_adjusted <= 100)),
    CONSTRAINT fiscal_icms_st_rules_enabled_payload_check CHECK (st_enabled = false OR st_rate IS NOT NULL OR mva_original IS NOT NULL OR st_base_calc_percent IS NOT NULL),
    CONSTRAINT fiscal_icms_st_rules_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_icms_st_rules_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_icms_st_rules_active_unique
    ON public.fiscal_icms_st_rules (icms_base_id, COALESCE(target_uf, '__ST__'))
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_fiscal_icms_bases_updated_at ON public.fiscal_icms_bases;
CREATE TRIGGER update_fiscal_icms_bases_updated_at
    BEFORE UPDATE ON public.fiscal_icms_bases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_icms_rules_updated_at ON public.fiscal_icms_rules;
CREATE TRIGGER update_fiscal_icms_rules_updated_at
    BEFORE UPDATE ON public.fiscal_icms_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_icms_interstate_rules_updated_at ON public.fiscal_icms_interstate_rules;
CREATE TRIGGER update_fiscal_icms_interstate_rules_updated_at
    BEFORE UPDATE ON public.fiscal_icms_interstate_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fiscal_icms_st_rules_updated_at ON public.fiscal_icms_st_rules;
CREATE TRIGGER update_fiscal_icms_st_rules_updated_at
    BEFORE UPDATE ON public.fiscal_icms_st_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS icms_base_id UUID REFERENCES public.fiscal_icms_bases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_icms_base_id
    ON public.product_tax_profiles(icms_base_id);

DROP FUNCTION IF EXISTS public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB,
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
);

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
    p_fiscal_reference_snapshot_jsonb JSONB DEFAULT '{}'::JSONB
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
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_profile_id UUID;
    v_version INTEGER;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_tax_profile_id IS NULL THEN
        INSERT INTO public.product_tax_profiles (
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
            icms_base_id,
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
            p_icms_base_id,
            COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
            v_actor, v_actor
        )
        RETURNING id, version INTO v_profile_id, v_version;

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
               fiscal_reference_snapshot_jsonb = COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
               version = tp.version + 1,
               updated_by = v_actor
         WHERE tp.id = p_tax_profile_id
         RETURNING tp.id, tp.version INTO v_profile_id, v_version;

        IF v_profile_id IS NULL THEN
            RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
        END IF;
    END IF;

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
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
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
        pis_aliquota, cofins_aliquota, default_output_cfop, default_input_cfop,
        internal_fiscal_code, default_fiscal_notes, is_active,
        requires_tax_configuration, future_tax_payload, metadata_jsonb,
        ncm_reference_id, ncm_version_id, tipi_reference_id, tipi_version_id,
        cest_reference_id, cest_version_id,
        default_output_cfop_reference_id, default_output_cfop_version_id,
        default_input_cfop_reference_id, default_input_cfop_version_id,
        icms_base_id,
        fiscal_reference_snapshot_jsonb,
        created_by, updated_by
    )
    VALUES (
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '_COPY_' || SUBSTRING(REPLACE(v_source.id::TEXT, '-', '') FROM 1 FOR 6)),
        v_source.description, v_source.ncm, v_source.cest, v_source.origin_code,
        v_source.commercial_unit, v_source.tax_unit, v_source.ean_gtin, v_source.tax_ean_gtin,
        v_source.default_fiscal_description, v_source.fiscal_type, v_source.item_type,
        v_source.has_substitution_tax, v_source.requires_cest, v_source.has_ipi,
        v_source.ipi_cst_out, v_source.ipi_enquadramento_codigo, v_source.pis_cst, v_source.cofins_cst,
        v_source.pis_aliquota, v_source.cofins_aliquota, v_source.default_output_cfop, v_source.default_input_cfop,
        v_source.internal_fiscal_code, v_source.default_fiscal_notes, v_source.is_active,
        v_source.requires_tax_configuration, v_source.future_tax_payload, v_source.metadata_jsonb,
        v_source.ncm_reference_id, v_source.ncm_version_id, v_source.tipi_reference_id, v_source.tipi_version_id,
        v_source.cest_reference_id, v_source.cest_version_id,
        v_source.default_output_cfop_reference_id, v_source.default_output_cfop_version_id,
        v_source.default_input_cfop_reference_id, v_source.default_input_cfop_version_id,
        v_source.icms_base_id,
        v_source.fiscal_reference_snapshot_jsonb,
        v_actor, v_actor
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.product_tax_profile_rules (
        tax_profile_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override,
        priority, is_active, effective_from, effective_to,
        rule_payload_jsonb, future_tax_payload, created_by, updated_by
    )
    SELECT
        v_new_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override,
        priority, is_active, effective_from, effective_to,
        rule_payload_jsonb, future_tax_payload, v_actor, v_actor
    FROM public.product_tax_profile_rules
    WHERE tax_profile_id = p_tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(v_new_id, 'create', v_actor, 'Created by duplication');
    PERFORM public.persist_product_tax_profile_version(v_new_id, 'duplicate', v_actor, 'Duplicated from existing profile');

    RETURN QUERY
    SELECT
        v_new_id,
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '_COPY_' || SUBSTRING(REPLACE(v_source.id::TEXT, '-', '') FROM 1 FOR 6));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_duplicate_product_tax_profile(UUID, TEXT, TEXT)
TO authenticated, service_role;

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
        INSERT INTO public.fiscal_icms_bases (
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
        RETURNING id, version INTO v_base_id, v_version;

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

    DELETE FROM public.fiscal_icms_rules WHERE icms_base_id = v_base_id;
    DELETE FROM public.fiscal_icms_interstate_rules WHERE icms_base_id = v_base_id;
    DELETE FROM public.fiscal_icms_st_rules WHERE icms_base_id = v_base_id;

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
    );

    FOR v_state_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        v_state_uf := UPPER(TRIM(COALESCE(v_state_item ->> 'target_uf', '')));
        IF v_state_uf = '' THEN
            RAISE EXCEPTION 'State rules require target_uf';
        END IF;

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
        );
    END LOOP;

    IF COALESCE(jsonb_object_length(p_interstate_rule), 0) > 0 THEN
        INSERT INTO public.fiscal_icms_interstate_rules (
            icms_base_id, target_uf, icms_rate, fcp_rate, consumer_final_mode,
            is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
        )
        VALUES (
            v_base_id,
            NULLIF(UPPER(TRIM(COALESCE(p_interstate_rule ->> 'target_uf', ''))), ''),
            COALESCE(NULLIF(p_interstate_rule ->> 'icms_rate', '')::NUMERIC, 0),
            COALESCE(NULLIF(p_interstate_rule ->> 'fcp_rate', '')::NUMERIC, 0),
            COALESCE(NULLIF(TRIM(COALESCE(p_interstate_rule ->> 'consumer_final_mode', '')), ''), 'standard'),
            COALESCE((p_interstate_rule ->> 'is_active')::BOOLEAN, true),
            COALESCE(p_interstate_rule -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_interstate_rule -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        );
    END IF;

    IF COALESCE(jsonb_object_length(p_st_rule), 0) > 0 THEN
        INSERT INTO public.fiscal_icms_st_rules (
            icms_base_id, target_uf, st_enabled, st_base_calc_type, st_base_calc_percent,
            st_base_reduction_percent, st_rate, st_fcp_rate, mva_original, mva_adjusted,
            st_notes, is_active, metadata_jsonb, future_tax_payload, created_by, updated_by
        )
        VALUES (
            v_base_id,
            NULLIF(UPPER(TRIM(COALESCE(p_st_rule ->> 'target_uf', ''))), ''),
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
        );
    END IF;

    RETURN QUERY SELECT v_base_id, v_created, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_icms_base(
    UUID, TEXT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_toggle_fiscal_icms_base_status(
    p_icms_base_id UUID,
    p_is_active BOOLEAN
)
RETURNS TABLE (
    icms_base_id UUID,
    is_active BOOLEAN,
    version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_base_id UUID;
    v_status BOOLEAN;
    v_version INTEGER;
BEGIN
    UPDATE public.fiscal_icms_bases base
       SET is_active = COALESCE(p_is_active, false),
           version = base.version + 1,
           updated_by = v_actor
     WHERE base.id = p_icms_base_id
     RETURNING base.id, base.is_active, base.version
      INTO v_base_id, v_status, v_version;

    IF v_base_id IS NULL THEN
        RAISE EXCEPTION 'ICMS base % not found', p_icms_base_id;
    END IF;

    RETURN QUERY SELECT v_base_id, v_status, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_fiscal_icms_base_status(UUID, BOOLEAN)
TO authenticated, service_role;

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
    SELECT pv.product_id INTO v_product_id FROM public.product_variants pv WHERE pv.id = p_product_variant_id LIMIT 1;
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

    SELECT tp.* INTO v_profile
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

    SELECT r.* INTO v_rule
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
                'icms_base_id', v_profile.icms_base_id,
                'icms_base_code', (SELECT base.code FROM public.fiscal_icms_bases base WHERE base.id = v_profile.icms_base_id LIMIT 1),
                'icms_base_name', (SELECT base.name FROM public.fiscal_icms_bases base WHERE base.id = v_profile.icms_base_id LIMIT 1),
                'fiscal_reference_snapshot', v_profile.fiscal_reference_snapshot_jsonb
            )
            || COALESCE(v_profile.future_tax_payload, '{}'::JSONB)
            || COALESCE(v_rule.rule_payload_jsonb, '{}'::JSONB)
            || COALESCE(v_rule.future_tax_payload, '{}'::JSONB)
        );
END;
$$;
