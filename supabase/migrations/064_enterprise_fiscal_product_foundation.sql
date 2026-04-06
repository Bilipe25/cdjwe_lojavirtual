-- ============================================================
-- Migration 064: Enterprise Fiscal Foundation (Products + Orders)
-- ============================================================

-- 1) Tax profile master table (reusable fiscal setup per product)
CREATE TABLE IF NOT EXISTS public.product_tax_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    ncm TEXT,
    cest TEXT,
    origin_code TEXT NOT NULL DEFAULT '0',
    commercial_unit TEXT,
    tax_unit TEXT,
    ean_gtin TEXT,
    tax_ean_gtin TEXT,
    default_fiscal_description TEXT,
    fiscal_type TEXT NOT NULL DEFAULT 'goods',
    item_type TEXT NOT NULL DEFAULT 'goods',
    has_substitution_tax BOOLEAN NOT NULL DEFAULT false,
    requires_cest BOOLEAN NOT NULL DEFAULT false,
    has_ipi BOOLEAN NOT NULL DEFAULT false,
    ipi_cst_out TEXT,
    ipi_enquadramento_codigo TEXT,
    pis_cst TEXT,
    cofins_cst TEXT,
    pis_aliquota NUMERIC(7,4),
    cofins_aliquota NUMERIC(7,4),
    default_output_cfop TEXT,
    default_input_cfop TEXT,
    internal_fiscal_code TEXT,
    default_fiscal_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    requires_tax_configuration BOOLEAN NOT NULL DEFAULT true,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_active
    ON public.product_tax_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_name
    ON public.product_tax_profiles(name);
CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_code
    ON public.product_tax_profiles(code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_origin_code_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_origin_code_check
            CHECK (origin_code IN ('0','1','2','3','4','5','6','7','8'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_ncm_format_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_ncm_format_check
            CHECK (ncm IS NULL OR regexp_replace(ncm, '\D', '', 'g') ~ '^\d{8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_cest_format_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_cest_format_check
            CHECK (cest IS NULL OR regexp_replace(cest, '\D', '', 'g') ~ '^\d{7}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_cfop_format_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_cfop_format_check
            CHECK (
                (default_output_cfop IS NULL OR default_output_cfop ~ '^\d{4}$')
                AND (default_input_cfop IS NULL OR default_input_cfop ~ '^\d{4}$')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_required_ncm_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_required_ncm_check
            CHECK (
                (NOT requires_tax_configuration)
                OR (NULLIF(TRIM(COALESCE(ncm, '')), '') IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_requires_cest_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_requires_cest_check
            CHECK (
                (NOT requires_cest)
                OR (NULLIF(TRIM(COALESCE(cest, '')), '') IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_st_requires_cest_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_st_requires_cest_check
            CHECK ((NOT has_substitution_tax) OR requires_cest);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_ipi_consistency_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_ipi_consistency_check
            CHECK ((NOT has_ipi) OR NULLIF(TRIM(COALESCE(ipi_cst_out, '')), '') IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_aliquotas_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_aliquotas_check
            CHECK (
                (pis_aliquota IS NULL OR pis_aliquota >= 0)
                AND (cofins_aliquota IS NULL OR cofins_aliquota >= 0)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_payload_object_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_payload_object_check
            CHECK (
                jsonb_typeof(future_tax_payload) = 'object'
                AND jsonb_typeof(metadata_jsonb) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_product_tax_profiles_updated_at ON public.product_tax_profiles;
CREATE TRIGGER update_product_tax_profiles_updated_at
    BEFORE UPDATE ON public.product_tax_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Contextual tax rules (ready for UF/context growth)
CREATE TABLE IF NOT EXISTS public.product_tax_profile_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_profile_id UUID NOT NULL REFERENCES public.product_tax_profiles(id) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    operation_direction TEXT NOT NULL DEFAULT 'outbound',
    origin_uf CHAR(2),
    destination_uf CHAR(2),
    customer_type_id UUID REFERENCES public.customer_types(id) ON DELETE SET NULL,
    person_type TEXT,
    taxpayer_indicator TEXT,
    cfop_override TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from DATE,
    effective_to DATE,
    rule_payload_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_tax_profile_rules_profile_active
    ON public.product_tax_profile_rules(tax_profile_id, is_active, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_tax_profile_rules_uf
    ON public.product_tax_profile_rules(origin_uf, destination_uf);
CREATE INDEX IF NOT EXISTS idx_product_tax_profile_rules_effective
    ON public.product_tax_profile_rules(effective_from, effective_to);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_direction_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_direction_check
            CHECK (operation_direction IN ('outbound', 'inbound'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_uf_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_uf_check
            CHECK (
                (origin_uf IS NULL OR origin_uf ~ '^[A-Z]{2}$')
                AND (destination_uf IS NULL OR destination_uf ~ '^[A-Z]{2}$')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_cfop_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_cfop_check
            CHECK (cfop_override IS NULL OR cfop_override ~ '^\d{4}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_effective_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_effective_check
            CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_person_type_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_person_type_check
            CHECK (person_type IS NULL OR person_type IN ('individual', 'legal_entity'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_taxpayer_indicator_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_taxpayer_indicator_check
            CHECK (taxpayer_indicator IS NULL OR taxpayer_indicator IN ('contributor', 'non_contributor', 'exempt'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profile_rules_payload_object_check'
    ) THEN
        ALTER TABLE public.product_tax_profile_rules
            ADD CONSTRAINT product_tax_profile_rules_payload_object_check
            CHECK (
                jsonb_typeof(rule_payload_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_product_tax_profile_rules_updated_at ON public.product_tax_profile_rules;
CREATE TRIGGER update_product_tax_profile_rules_updated_at
    BEFORE UPDATE ON public.product_tax_profile_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Version snapshots + audit
CREATE TABLE IF NOT EXISTS public.product_tax_profile_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_profile_id UUID NOT NULL REFERENCES public.product_tax_profiles(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'update',
    snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    UNIQUE (tax_profile_id, version)
);

CREATE INDEX IF NOT EXISTS idx_product_tax_profile_versions_profile
    ON public.product_tax_profile_versions(tax_profile_id, version DESC);

CREATE TABLE IF NOT EXISTS public.admin_product_tax_profile_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    tax_profile_id UUID REFERENCES public.product_tax_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'application',
    success BOOLEAN NOT NULL DEFAULT true,
    message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_product_tax_profile_audit_operation
    ON public.admin_product_tax_profile_audit_log(operation_id);
CREATE INDEX IF NOT EXISTS idx_admin_product_tax_profile_audit_profile
    ON public.admin_product_tax_profile_audit_log(tax_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_fiscal_overrides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    override_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_fiscal_overrides_object_check'
    ) THEN
        ALTER TABLE public.product_fiscal_overrides
            ADD CONSTRAINT product_fiscal_overrides_object_check
            CHECK (jsonb_typeof(override_jsonb) = 'object');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_product_fiscal_overrides_updated_at ON public.product_fiscal_overrides;
CREATE TRIGGER update_product_fiscal_overrides_updated_at
    BEFORE UPDATE ON public.product_fiscal_overrides
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Product link to reusable tax profile
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS tax_profile_id UUID REFERENCES public.product_tax_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_tax_profile_id
    ON public.products(tax_profile_id);

-- 5) Helpers for profile versions/audit
CREATE OR REPLACE FUNCTION public.persist_product_tax_profile_version(
    p_tax_profile_id UUID,
    p_change_type TEXT DEFAULT 'update',
    p_actor_profile_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
BEGIN
    SELECT *
      INTO v_profile
      FROM public.product_tax_profiles
     WHERE id = p_tax_profile_id
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.product_tax_profile_versions (
        tax_profile_id,
        version,
        change_type,
        snapshot,
        changed_by,
        notes
    )
    VALUES (
        v_profile.id,
        v_profile.version,
        COALESCE(NULLIF(TRIM(COALESCE(p_change_type, '')), ''), 'update'),
        to_jsonb(v_profile),
        p_actor_profile_id,
        p_notes
    )
    ON CONFLICT (tax_profile_id, version) DO UPDATE
        SET change_type = EXCLUDED.change_type,
            snapshot = EXCLUDED.snapshot,
            changed_by = EXCLUDED.changed_by,
            notes = EXCLUDED.notes,
            changed_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.persist_product_tax_profile_version(UUID, TEXT, UUID, TEXT)
TO authenticated, service_role;

-- 6) Tax profile management RPCs
CREATE OR REPLACE FUNCTION public.admin_list_product_tax_profiles(
    p_search TEXT DEFAULT NULL,
    p_include_inactive BOOLEAN DEFAULT true
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    code TEXT,
    ncm TEXT,
    cest TEXT,
    default_output_cfop TEXT,
    is_active BOOLEAN,
    version INTEGER,
    products_count BIGINT,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        tp.id,
        tp.name,
        tp.code,
        tp.ncm,
        tp.cest,
        tp.default_output_cfop,
        tp.is_active,
        tp.version,
        COUNT(p.id)::BIGINT AS products_count,
        tp.updated_at
    FROM public.product_tax_profiles tp
    LEFT JOIN public.products p
      ON p.tax_profile_id = tp.id
    WHERE (
        p_include_inactive
        OR tp.is_active = true
    )
      AND (
        p_search IS NULL
        OR TRIM(p_search) = ''
        OR tp.name ILIKE '%' || p_search || '%'
        OR tp.code ILIKE '%' || p_search || '%'
        OR COALESCE(tp.ncm, '') ILIKE '%' || p_search || '%'
      )
    GROUP BY tp.id
    ORDER BY tp.is_active DESC, tp.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_product_tax_profiles(TEXT, BOOLEAN)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_product_tax_profile_usage(
    p_tax_profile_id UUID,
    p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    product_slug TEXT,
    product_is_active BOOLEAN,
    product_updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.is_active AS product_is_active,
        p.updated_at AS product_updated_at
    FROM public.products p
    WHERE p.tax_profile_id = p_tax_profile_id
    ORDER BY p.updated_at DESC, p.name ASC
    LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_product_tax_profile_usage(UUID, INTEGER)
TO authenticated, service_role;

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
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB
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
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_toggle_product_tax_profile_status(
    p_tax_profile_id UUID,
    p_is_active BOOLEAN
)
RETURNS TABLE (
    tax_profile_id UUID,
    is_active BOOLEAN,
    version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_profile_id UUID;
    v_status BOOLEAN;
    v_version INTEGER;
BEGIN
    UPDATE public.product_tax_profiles tp
       SET is_active = COALESCE(p_is_active, false),
           version = tp.version + 1,
           updated_by = v_actor
     WHERE tp.id = p_tax_profile_id
     RETURNING tp.id, tp.is_active, tp.version
      INTO v_profile_id, v_status, v_version;

    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
    END IF;

    PERFORM public.persist_product_tax_profile_version(v_profile_id, 'toggle', v_actor, NULL);
    RETURN QUERY SELECT v_profile_id, v_status, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_product_tax_profile_status(UUID, BOOLEAN)
TO authenticated, service_role;

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

-- 7) Extend product upsert RPC with tax_profile_id (without breaking old signature)
CREATE OR REPLACE FUNCTION public.admin_upsert_product_domain(
    p_product_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_slug TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_size TEXT DEFAULT NULL,
    p_has_size_variants BOOLEAN DEFAULT false,
    p_size_options JSONB DEFAULT NULL,
    p_base_price NUMERIC DEFAULT 0,
    p_is_active BOOLEAN DEFAULT true,
    p_is_featured BOOLEAN DEFAULT false,
    p_active_variant_ids UUID[] DEFAULT NULL,
    p_variant_price_overrides JSONB DEFAULT NULL,
    p_tax_profile_id UUID DEFAULT NULL
)
RETURNS TABLE(product_id UUID, created BOOLEAN, variants_inserted INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_result RECORD;
BEGIN
    SELECT *
      INTO v_result
      FROM public.admin_upsert_product_domain(
        p_product_id,
        p_name,
        p_slug,
        p_description,
        p_category_id,
        p_size,
        p_has_size_variants,
        p_size_options,
        p_base_price,
        p_is_active,
        p_is_featured,
        p_active_variant_ids,
        p_variant_price_overrides
      );

    IF v_result.product_id IS NULL THEN
        RAISE EXCEPTION 'Failed to persist product domain';
    END IF;

    UPDATE public.products p
       SET tax_profile_id = p_tax_profile_id
     WHERE p.id = v_result.product_id;

    RETURN QUERY SELECT v_result.product_id, v_result.created, v_result.variants_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_domain(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, JSONB, NUMERIC, BOOLEAN, BOOLEAN, UUID[], JSONB, UUID
)
TO service_role, authenticated;

-- 8) Fiscal snapshot in order items (future NF-e baseline)
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS tax_profile_id UUID REFERENCES public.product_tax_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tax_profile_version INTEGER,
    ADD COLUMN IF NOT EXISTS fiscal_ncm TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_cest TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_origin_code TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_cfop TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS fiscal_payload JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS fiscal_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS fiscal_ready BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_fiscal_cfop_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_fiscal_cfop_check
            CHECK (fiscal_cfop IS NULL OR fiscal_cfop ~ '^\d{4}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_fiscal_payload_object_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_fiscal_payload_object_check
            CHECK (
                jsonb_typeof(fiscal_context) = 'object'
                AND jsonb_typeof(fiscal_payload) = 'object'
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_tax_profile_id
    ON public.order_items(tax_profile_id);
CREATE INDEX IF NOT EXISTS idx_order_items_fiscal_cfop
    ON public.order_items(fiscal_cfop);

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
                'rule_priority', v_rule.priority
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
                'internal_fiscal_code', v_profile.internal_fiscal_code
            )
            || COALESCE(v_profile.future_tax_payload, '{}'::JSONB)
            || COALESCE(v_rule.rule_payload_jsonb, '{}'::JSONB)
            || COALESCE(v_rule.future_tax_payload, '{}'::JSONB)
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_product_tax_context(UUID, UUID, TEXT, DATE)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_order_item_fiscal_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_ctx RECORD;
BEGIN
    SELECT o.store_id, o.created_at
      INTO v_order
      FROM public.orders o
     WHERE o.id = NEW.order_id
     LIMIT 1;

    IF v_order.store_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT *
      INTO v_ctx
      FROM public.resolve_product_tax_context(
        NEW.product_variant_id,
        v_order.store_id,
        'outbound',
        COALESCE(v_order.created_at::DATE, CURRENT_DATE)
      );

    NEW.tax_profile_id := v_ctx.tax_profile_id;
    NEW.tax_profile_version := v_ctx.tax_profile_version;
    NEW.fiscal_ncm := v_ctx.ncm;
    NEW.fiscal_cest := v_ctx.cest;
    NEW.fiscal_origin_code := v_ctx.origin_code;
    NEW.fiscal_cfop := v_ctx.resolved_cfop;
    NEW.fiscal_context := COALESCE(v_ctx.context_jsonb, '{}'::JSONB);
    NEW.fiscal_payload := COALESCE(v_ctx.payload_jsonb, '{}'::JSONB);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_order_item_fiscal_snapshot ON public.order_items;
CREATE TRIGGER trg_apply_order_item_fiscal_snapshot
    BEFORE INSERT OR UPDATE OF product_variant_id, order_id
    ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.apply_order_item_fiscal_snapshot();

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
                            'context', oi.fiscal_context
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

GRANT EXECUTE ON FUNCTION public.refresh_order_fiscal_snapshot(UUID)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_order_fiscal_snapshot_from_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_order_fiscal_snapshot(OLD.order_id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_order_fiscal_snapshot(NEW.order_id);
    IF TG_OP = 'UPDATE' AND OLD.order_id <> NEW.order_id THEN
        PERFORM public.refresh_order_fiscal_snapshot(OLD.order_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_fiscal_snapshot_from_items ON public.order_items;
CREATE TRIGGER trg_sync_order_fiscal_snapshot_from_items
    AFTER INSERT OR UPDATE OR DELETE
    ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_fiscal_snapshot_from_items();

-- Backfill order item snapshots for legacy records
WITH order_item_tax_resolution AS (
    SELECT
        oi.id AS order_item_id,
        ctx.tax_profile_id,
        ctx.tax_profile_version,
        ctx.ncm,
        ctx.cest,
        ctx.origin_code,
        ctx.resolved_cfop,
        COALESCE(ctx.context_jsonb, '{}'::JSONB) AS context_jsonb,
        COALESCE(ctx.payload_jsonb, '{}'::JSONB) AS payload_jsonb
    FROM public.order_items oi
    JOIN public.orders o
      ON o.id = oi.order_id
    CROSS JOIN LATERAL public.resolve_product_tax_context(
        oi.product_variant_id,
        o.store_id,
        'outbound',
        COALESCE(o.created_at::DATE, CURRENT_DATE)
    ) AS ctx
)
UPDATE public.order_items oi
   SET tax_profile_id = r.tax_profile_id,
       tax_profile_version = r.tax_profile_version,
       fiscal_ncm = r.ncm,
       fiscal_cest = r.cest,
       fiscal_origin_code = r.origin_code,
       fiscal_cfop = r.resolved_cfop,
       fiscal_context = r.context_jsonb,
       fiscal_payload = r.payload_jsonb
  FROM order_item_tax_resolution r
 WHERE r.order_item_id = oi.id;

DO $$
DECLARE
    v_order_id UUID;
BEGIN
    FOR v_order_id IN
        SELECT id FROM public.orders
    LOOP
        PERFORM public.refresh_order_fiscal_snapshot(v_order_id);
    END LOOP;
END $$;
