-- Enterprise IBS/CBS bases inside Fiscal Bases hub

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_cst_catalog_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label TEXT NOT NULL,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    source_type TEXT NOT NULL DEFAULT 'seed',
    source_file_name TEXT,
    import_batch_label TEXT,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_cst_catalog_versions_source_type_check CHECK (source_type IN ('seed', 'manual', 'csv', 'xlsx', 'api')),
    CONSTRAINT fiscal_ibscbs_cst_catalog_versions_validity_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT fiscal_ibscbs_cst_catalog_versions_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_ibscbs_cst_catalog_versions_active
    ON public.fiscal_ibscbs_cst_catalog_versions((CASE WHEN is_active THEN 1 END))
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_cst_catalog_versions_updated_at ON public.fiscal_ibscbs_cst_catalog_versions;
CREATE TRIGGER update_fiscal_ibscbs_cst_catalog_versions_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_cst_catalog_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_cst_catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_cst_catalog_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_cst_catalog_items_code_check CHECK (code ~ '^\d{3}$'),
    CONSTRAINT fiscal_ibscbs_cst_catalog_items_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_cst_catalog_items_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object'),
    UNIQUE (catalog_version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_cst_catalog_items_lookup
    ON public.fiscal_ibscbs_cst_catalog_items(catalog_version_id, sort_order ASC, code ASC);

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_cst_catalog_items_updated_at ON public.fiscal_ibscbs_cst_catalog_items;
CREATE TRIGGER update_fiscal_ibscbs_cst_catalog_items_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_cst_catalog_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_classification_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_label TEXT NOT NULL,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    source_type TEXT NOT NULL DEFAULT 'seed',
    source_file_name TEXT,
    import_batch_label TEXT,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_classification_versions_source_type_check CHECK (source_type IN ('seed', 'manual', 'csv', 'xlsx', 'api')),
    CONSTRAINT fiscal_ibscbs_classification_versions_validity_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT fiscal_ibscbs_classification_versions_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_ibscbs_classification_versions_active
    ON public.fiscal_ibscbs_classification_versions((CASE WHEN is_active THEN 1 END))
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_classification_versions_updated_at ON public.fiscal_ibscbs_classification_versions;
CREATE TRIGGER update_fiscal_ibscbs_classification_versions_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_classification_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_classification_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_classification_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    cst_code TEXT NOT NULL,
    label TEXT NOT NULL,
    short_label TEXT,
    description TEXT,
    valid_from DATE,
    valid_to DATE,
    indicators_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    legal_basis_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_classification_items_code_check CHECK (code ~ '^\d{6}$'),
    CONSTRAINT fiscal_ibscbs_classification_items_cst_code_check CHECK (cst_code ~ '^\d{3}$'),
    CONSTRAINT fiscal_ibscbs_classification_items_code_prefix_check CHECK (LEFT(code, 3) = cst_code),
    CONSTRAINT fiscal_ibscbs_classification_items_validity_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT fiscal_ibscbs_classification_items_indicators_check CHECK (jsonb_typeof(indicators_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_classification_items_legal_basis_check CHECK (jsonb_typeof(legal_basis_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_classification_items_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_classification_items_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object'),
    UNIQUE (catalog_version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_classification_items_lookup
    ON public.fiscal_ibscbs_classification_items(catalog_version_id, sort_order ASC, code ASC);

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_classification_items_updated_at ON public.fiscal_ibscbs_classification_items;
CREATE TRIGGER update_fiscal_ibscbs_classification_items_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_classification_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_bases_code_unique UNIQUE (code),
    CONSTRAINT fiscal_ibscbs_bases_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_bases_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_bases_name
    ON public.fiscal_ibscbs_bases(name);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_bases_is_active
    ON public.fiscal_ibscbs_bases(is_active);

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_bases_updated_at ON public.fiscal_ibscbs_bases;
CREATE TRIGGER update_fiscal_ibscbs_bases_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_bases
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_base_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ibscbs_base_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_bases(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    valid_from DATE,
    valid_to DATE,
    cst_catalog_version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_cst_catalog_versions(id),
    classification_catalog_version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_classification_versions(id),
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_base_versions_status_check CHECK (status IN ('draft', 'active', 'superseded', 'inactive')),
    CONSTRAINT fiscal_ibscbs_base_versions_validity_check CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CONSTRAINT fiscal_ibscbs_base_versions_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_base_versions_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object'),
    UNIQUE (ibscbs_base_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_ibscbs_base_versions_active
    ON public.fiscal_ibscbs_base_versions(ibscbs_base_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_ibscbs_base_versions_draft
    ON public.fiscal_ibscbs_base_versions(ibscbs_base_id)
    WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_base_versions_lookup
    ON public.fiscal_ibscbs_base_versions(ibscbs_base_id, version_number DESC);

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_base_versions_updated_at ON public.fiscal_ibscbs_base_versions;
CREATE TRIGGER update_fiscal_ibscbs_base_versions_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_base_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ibscbs_version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_base_versions(id) ON DELETE CASCADE,
    target_uf TEXT,
    cst_code TEXT NOT NULL,
    classification_code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_rules_target_uf_check CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$'),
    CONSTRAINT fiscal_ibscbs_rules_cst_code_check CHECK (cst_code ~ '^\d{3}$'),
    CONSTRAINT fiscal_ibscbs_rules_classification_code_check CHECK (classification_code ~ '^\d{6}$'),
    CONSTRAINT fiscal_ibscbs_rules_code_prefix_check CHECK (LEFT(classification_code, 3) = cst_code),
    CONSTRAINT fiscal_ibscbs_rules_metadata_check CHECK (jsonb_typeof(metadata_jsonb) = 'object'),
    CONSTRAINT fiscal_ibscbs_rules_future_payload_check CHECK (jsonb_typeof(future_tax_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_ibscbs_rules_active
    ON public.fiscal_ibscbs_rules(ibscbs_version_id, COALESCE(target_uf, '__BASE__'))
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_rules_target_uf
    ON public.fiscal_ibscbs_rules(target_uf);

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_rules_updated_at ON public.fiscal_ibscbs_rules;
CREATE TRIGGER update_fiscal_ibscbs_rules_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS ibscbs_base_id UUID REFERENCES public.fiscal_ibscbs_bases(id) ON DELETE SET NULL;

ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS ibscbs_version_id UUID REFERENCES public.fiscal_ibscbs_base_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_ibscbs_base_id
    ON public.product_tax_profiles(ibscbs_base_id);

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_ibscbs_version_id
    ON public.product_tax_profiles(ibscbs_version_id);

DO $$
DECLARE
    v_cst_version_id UUID;
    v_classification_version_id UUID;
BEGIN
    SELECT id
      INTO v_cst_version_id
      FROM public.fiscal_ibscbs_cst_catalog_versions
     WHERE version_label = 'IBSCBS-CST-SEED-2026-04'
     LIMIT 1;

    IF v_cst_version_id IS NULL THEN
        INSERT INTO public.fiscal_ibscbs_cst_catalog_versions (
            version_label,
            valid_from,
            is_active,
            source_type,
            import_batch_label,
            metadata_jsonb
        )
        VALUES (
            'IBSCBS-CST-SEED-2026-04',
            DATE '2026-01-01',
            true,
            'seed',
            'initial-operational-seed',
            '{"seed_scope":"operational","official_reference_pending":true}'::JSONB
        )
        RETURNING id INTO v_cst_version_id;
    END IF;

    INSERT INTO public.fiscal_ibscbs_cst_catalog_items (
        catalog_version_id, code, label, description, sort_order, is_active, metadata_jsonb
    )
    VALUES
        (v_cst_version_id, '000', '000 - Tributacao integral', 'Regra operacional para tributacao integral de IBS/CBS.', 10, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '200', '200 - Aliquota reduzida', 'Regra operacional para cenarios com aliquota reduzida.', 20, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '410', '410 - Imunidade e nao incidencia', 'Regra operacional para imunidade e nao incidencia.', 30, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '510', '510 - Diferimento', 'Regra operacional para diferimento de IBS/CBS.', 40, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '515', '515 - Diferimento com reducao de aliquota', 'Regra operacional para diferimento com reducao de aliquota.', 50, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '550', '550 - Suspensao', 'Regra operacional para suspensao de IBS/CBS.', 60, true, '{"seed_scope":"operational"}'::JSONB),
        (v_cst_version_id, '620', '620 - Tributacao monofasica', 'Regra operacional para tributacao monofasica.', 70, true, '{"seed_scope":"operational"}'::JSONB)
    ON CONFLICT (catalog_version_id, code) DO UPDATE
       SET label = EXCLUDED.label,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           is_active = EXCLUDED.is_active,
           metadata_jsonb = EXCLUDED.metadata_jsonb,
           updated_at = NOW();

    SELECT id
      INTO v_classification_version_id
      FROM public.fiscal_ibscbs_classification_versions
     WHERE version_label = 'IBSCBS-CLASS-SEED-2026-04'
     LIMIT 1;

    IF v_classification_version_id IS NULL THEN
        INSERT INTO public.fiscal_ibscbs_classification_versions (
            version_label,
            valid_from,
            is_active,
            source_type,
            import_batch_label,
            metadata_jsonb
        )
        VALUES (
            'IBSCBS-CLASS-SEED-2026-04',
            DATE '2026-01-01',
            true,
            'seed',
            'initial-operational-seed',
            '{"seed_scope":"operational","official_reference_pending":true}'::JSONB
        )
        RETURNING id INTO v_classification_version_id;
    END IF;

    INSERT INTO public.fiscal_ibscbs_classification_items (
        catalog_version_id, code, cst_code, label, short_label, description, valid_from,
        indicators_jsonb, legal_basis_jsonb, sort_order, is_active, metadata_jsonb
    )
    VALUES
        (v_classification_version_id, '000001', '000', '000001 - Situacoes tributadas integralmente pelo IBS e CBS.', 'Tributacao integral', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 10, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '000003', '000', '000003 - Regime automotivo - projetos incentivados (art. 311).', 'Automotivo art. 311', NULL, DATE '2026-01-01', '{"requires_uf":false,"special_regime":true}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 20, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '000004', '000', '000004 - Regime automotivo - projetos incentivados (art. 312).', 'Automotivo art. 312', NULL, DATE '2026-01-01', '{"requires_uf":false,"special_regime":true}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 30, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '200001', '200', '200001 - Situacoes com aliquota reduzida de IBS e CBS.', 'Aliquota reduzida', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 40, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '410001', '410', '410001 - Imunidade e nao incidencia do IBS e CBS.', 'Imunidade e nao incidencia', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 50, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '510001', '510', '510001 - Diferimento de IBS e CBS.', 'Diferimento', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 60, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '515001', '515', '515001 - Diferimento com reducao de aliquota de IBS e CBS.', 'Diferimento com reducao', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 70, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '550001', '550', '550001 - Suspensao de IBS e CBS.', 'Suspensao', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 80, true, '{"seed_scope":"operational"}'::JSONB),
        (v_classification_version_id, '620001', '620', '620001 - Tributacao monofasica de IBS e CBS.', 'Monofasica', NULL, DATE '2026-01-01', '{"requires_uf":false}'::JSONB, '{"seed_scope":"operational"}'::JSONB, 90, true, '{"seed_scope":"operational"}'::JSONB)
    ON CONFLICT (catalog_version_id, code) DO UPDATE
       SET cst_code = EXCLUDED.cst_code,
           label = EXCLUDED.label,
           short_label = EXCLUDED.short_label,
           description = EXCLUDED.description,
           valid_from = EXCLUDED.valid_from,
           indicators_jsonb = EXCLUDED.indicators_jsonb,
           legal_basis_jsonb = EXCLUDED.legal_basis_jsonb,
           sort_order = EXCLUDED.sort_order,
           is_active = EXCLUDED.is_active,
           metadata_jsonb = EXCLUDED.metadata_jsonb,
           updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_ibscbs_base_version(
    p_ibscbs_base_id UUID DEFAULT NULL,
    p_ibscbs_version_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_base_is_active BOOLEAN DEFAULT true,
    p_version_label TEXT DEFAULT NULL,
    p_valid_from DATE DEFAULT NULL,
    p_valid_to DATE DEFAULT NULL,
    p_cst_catalog_version_id UUID DEFAULT NULL,
    p_classification_catalog_version_id UUID DEFAULT NULL,
    p_national_rule JSONB DEFAULT '{}'::JSONB,
    p_state_rules JSONB DEFAULT '[]'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    ibscbs_base_id UUID,
    ibscbs_version_id UUID,
    created_base BOOLEAN,
    created_version BOOLEAN,
    version_number INTEGER,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created_base BOOLEAN := false;
    v_created_version BOOLEAN := false;
    v_base_id UUID;
    v_version_id UUID;
    v_version_number INTEGER;
    v_rule_item JSONB;
    v_target_uf TEXT;
    v_rule_cst_code TEXT;
    v_rule_classification_code TEXT;
    v_cst_catalog_version_id UUID;
    v_classification_catalog_version_id UUID;
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

    IF p_metadata_jsonb IS NULL OR jsonb_typeof(p_metadata_jsonb) <> 'object' THEN
        RAISE EXCEPTION 'p_metadata_jsonb must be a JSON object';
    END IF;

    IF p_future_tax_payload IS NULL OR jsonb_typeof(p_future_tax_payload) <> 'object' THEN
        RAISE EXCEPTION 'p_future_tax_payload must be a JSON object';
    END IF;

    IF p_valid_to IS NOT NULL AND p_valid_from IS NOT NULL AND p_valid_to < p_valid_from THEN
        RAISE EXCEPTION 'valid_to must be greater than or equal to valid_from';
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

    IF p_ibscbs_base_id IS NULL THEN
        INSERT INTO public.fiscal_ibscbs_bases (
            name,
            code,
            description,
            is_active,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            TRIM(p_name),
            UPPER(TRIM(p_code)),
            NULLIF(TRIM(COALESCE(p_description, '')), ''),
            COALESCE(p_base_is_active, true),
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING id INTO v_base_id;

        v_created_base := true;
    ELSE
        UPDATE public.fiscal_ibscbs_bases base
           SET name = TRIM(p_name),
               code = UPPER(TRIM(p_code)),
               description = NULLIF(TRIM(COALESCE(p_description, '')), ''),
               is_active = COALESCE(p_base_is_active, true),
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor
         WHERE base.id = p_ibscbs_base_id
         RETURNING base.id INTO v_base_id;

        IF v_base_id IS NULL THEN
            RAISE EXCEPTION 'IBS/CBS base % not found', p_ibscbs_base_id;
        END IF;
    END IF;

    v_cst_catalog_version_id := p_cst_catalog_version_id;
    IF v_cst_catalog_version_id IS NULL THEN
        SELECT id
          INTO v_cst_catalog_version_id
          FROM public.fiscal_ibscbs_cst_catalog_versions
         WHERE is_active = true
         ORDER BY valid_from DESC NULLS LAST, created_at DESC
         LIMIT 1;
    END IF;

    v_classification_catalog_version_id := p_classification_catalog_version_id;
    IF v_classification_catalog_version_id IS NULL THEN
        SELECT id
          INTO v_classification_catalog_version_id
          FROM public.fiscal_ibscbs_classification_versions
         WHERE is_active = true
         ORDER BY valid_from DESC NULLS LAST, created_at DESC
         LIMIT 1;
    END IF;

    IF v_cst_catalog_version_id IS NULL THEN
        RAISE EXCEPTION 'No active IBS/CBS CST catalog version found';
    END IF;

    IF v_classification_catalog_version_id IS NULL THEN
        RAISE EXCEPTION 'No active IBS/CBS classification catalog version found';
    END IF;

    IF p_ibscbs_version_id IS NULL THEN
        SELECT id
          INTO v_version_id
          FROM public.fiscal_ibscbs_base_versions
         WHERE ibscbs_base_id = v_base_id
           AND status = 'draft'
         ORDER BY version_number DESC
         LIMIT 1;
    ELSE
        v_version_id := p_ibscbs_version_id;
    END IF;

    IF v_version_id IS NULL THEN
        SELECT COALESCE(MAX(version_number), 0) + 1
          INTO v_version_number
          FROM public.fiscal_ibscbs_base_versions
         WHERE ibscbs_base_id = v_base_id;

        INSERT INTO public.fiscal_ibscbs_base_versions (
            ibscbs_base_id,
            version_number,
            version_label,
            status,
            valid_from,
            valid_to,
            cst_catalog_version_id,
            classification_catalog_version_id,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_base_id,
            v_version_number,
            COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), FORMAT('%s-V%s', UPPER(TRIM(p_code)), v_version_number)),
            'draft',
            p_valid_from,
            p_valid_to,
            v_cst_catalog_version_id,
            v_classification_catalog_version_id,
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        RETURNING id, version_number INTO v_version_id, v_version_number;

        v_created_version := true;
    ELSE
        UPDATE public.fiscal_ibscbs_base_versions version_row
           SET version_label = COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), version_row.version_label),
               valid_from = p_valid_from,
               valid_to = p_valid_to,
               cst_catalog_version_id = v_cst_catalog_version_id,
               classification_catalog_version_id = v_classification_catalog_version_id,
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor
         WHERE version_row.id = v_version_id
           AND version_row.ibscbs_base_id = v_base_id
           AND version_row.status = 'draft'
         RETURNING version_row.version_number INTO v_version_number;

        IF v_version_number IS NULL THEN
            RAISE EXCEPTION 'Only draft IBS/CBS versions can be edited';
        END IF;
    END IF;

    v_rule_cst_code := NULLIF(TRIM(COALESCE(p_national_rule ->> 'cst_code', '')), '');
    v_rule_classification_code := NULLIF(TRIM(COALESCE(p_national_rule ->> 'classification_code', '')), '');

    IF v_rule_cst_code IS NULL THEN
        RAISE EXCEPTION 'National rule requires cst_code';
    END IF;

    IF v_rule_classification_code IS NULL THEN
        RAISE EXCEPTION 'National rule requires classification_code';
    END IF;

    IF LEFT(v_rule_classification_code, 3) <> v_rule_cst_code THEN
        RAISE EXCEPTION 'National classification code prefix must match cst_code';
    END IF;

    PERFORM 1
      FROM public.fiscal_ibscbs_cst_catalog_items
     WHERE catalog_version_id = v_cst_catalog_version_id
       AND code = v_rule_cst_code
       AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CST % was not found in the selected IBS/CBS catalog version', v_rule_cst_code;
    END IF;

    PERFORM 1
      FROM public.fiscal_ibscbs_classification_items
     WHERE catalog_version_id = v_classification_catalog_version_id
       AND code = v_rule_classification_code
       AND cst_code = v_rule_cst_code
       AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Classification % was not found in the selected IBS/CBS catalog version', v_rule_classification_code;
    END IF;

    FOR v_rule_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        v_target_uf := UPPER(TRIM(COALESCE(v_rule_item ->> 'target_uf', '')));
        v_rule_cst_code := NULLIF(TRIM(COALESCE(v_rule_item ->> 'cst_code', '')), '');
        v_rule_classification_code := NULLIF(TRIM(COALESCE(v_rule_item ->> 'classification_code', '')), '');

        IF v_target_uf = '' OR v_target_uf !~ '^[A-Z]{2}$' THEN
            RAISE EXCEPTION 'State rules require a valid target_uf';
        END IF;

        IF v_rule_cst_code IS NULL THEN
            RAISE EXCEPTION 'State rule % requires cst_code', v_target_uf;
        END IF;

        IF v_rule_classification_code IS NULL THEN
            RAISE EXCEPTION 'State rule % requires classification_code', v_target_uf;
        END IF;

        IF LEFT(v_rule_classification_code, 3) <> v_rule_cst_code THEN
            RAISE EXCEPTION 'State rule % classification prefix must match cst_code', v_target_uf;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_cst_catalog_items
         WHERE catalog_version_id = v_cst_catalog_version_id
           AND code = v_rule_cst_code
           AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CST % was not found in the selected IBS/CBS catalog version', v_rule_cst_code;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_classification_items
         WHERE catalog_version_id = v_classification_catalog_version_id
           AND code = v_rule_classification_code
           AND cst_code = v_rule_cst_code
           AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Classification % was not found in the selected IBS/CBS catalog version', v_rule_classification_code;
        END IF;
    END LOOP;

    DELETE FROM public.fiscal_ibscbs_rules
     WHERE ibscbs_version_id = v_version_id;

    INSERT INTO public.fiscal_ibscbs_rules (
        ibscbs_version_id,
        target_uf,
        cst_code,
        classification_code,
        is_active,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    VALUES (
        v_version_id,
        NULL,
        NULLIF(TRIM(COALESCE(p_national_rule ->> 'cst_code', '')), ''),
        NULLIF(TRIM(COALESCE(p_national_rule ->> 'classification_code', '')), ''),
        COALESCE((p_national_rule ->> 'is_active')::BOOLEAN, true),
        COALESCE(p_national_rule -> 'metadata_jsonb', '{}'::JSONB),
        COALESCE(p_national_rule -> 'future_tax_payload', '{}'::JSONB),
        v_actor,
        v_actor
    );

    FOR v_rule_item IN
        SELECT value FROM jsonb_array_elements(p_state_rules)
    LOOP
        INSERT INTO public.fiscal_ibscbs_rules (
            ibscbs_version_id,
            target_uf,
            cst_code,
            classification_code,
            is_active,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_version_id,
            UPPER(TRIM(COALESCE(v_rule_item ->> 'target_uf', ''))),
            NULLIF(TRIM(COALESCE(v_rule_item ->> 'cst_code', '')), ''),
            NULLIF(TRIM(COALESCE(v_rule_item ->> 'classification_code', '')), ''),
            COALESCE((v_rule_item ->> 'is_active')::BOOLEAN, true),
            COALESCE(v_rule_item -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(v_rule_item -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        );
    END LOOP;

    RETURN QUERY
    SELECT
        v_base_id,
        v_version_id,
        v_created_base,
        v_created_version,
        v_version_number,
        'draft'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_ibscbs_base_version(
    UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, DATE, DATE, UUID, UUID, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_create_fiscal_ibscbs_base_version(
    p_ibscbs_base_id UUID,
    p_source_version_id UUID DEFAULT NULL,
    p_version_label TEXT DEFAULT NULL,
    p_valid_from DATE DEFAULT NULL,
    p_valid_to DATE DEFAULT NULL
)
RETURNS TABLE (
    ibscbs_base_id UUID,
    ibscbs_version_id UUID,
    version_number INTEGER,
    version_label TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_base RECORD;
    v_source_version RECORD;
    v_new_version_id UUID;
    v_new_version_number INTEGER;
BEGIN
    SELECT *
      INTO v_base
      FROM public.fiscal_ibscbs_bases
     WHERE id = p_ibscbs_base_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'IBS/CBS base % not found', p_ibscbs_base_id;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.fiscal_ibscbs_base_versions
         WHERE ibscbs_base_id = p_ibscbs_base_id
           AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'There is already a draft version for this IBS/CBS base';
    END IF;

    IF p_source_version_id IS NOT NULL THEN
        SELECT *
          INTO v_source_version
          FROM public.fiscal_ibscbs_base_versions
         WHERE id = p_source_version_id
           AND ibscbs_base_id = p_ibscbs_base_id
         LIMIT 1;
    ELSE
        SELECT *
          INTO v_source_version
          FROM public.fiscal_ibscbs_base_versions
         WHERE ibscbs_base_id = p_ibscbs_base_id
         ORDER BY (CASE WHEN status = 'active' THEN 0 ELSE 1 END), version_number DESC
         LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No source version was found for IBS/CBS base %', p_ibscbs_base_id;
    END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_new_version_number
      FROM public.fiscal_ibscbs_base_versions
     WHERE ibscbs_base_id = p_ibscbs_base_id;

    INSERT INTO public.fiscal_ibscbs_base_versions (
        ibscbs_base_id,
        version_number,
        version_label,
        status,
        valid_from,
        valid_to,
        cst_catalog_version_id,
        classification_catalog_version_id,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    VALUES (
        p_ibscbs_base_id,
        v_new_version_number,
        COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), FORMAT('%s-V%s', v_base.code, v_new_version_number)),
        'draft',
        COALESCE(p_valid_from, v_source_version.valid_from),
        COALESCE(p_valid_to, v_source_version.valid_to),
        v_source_version.cst_catalog_version_id,
        v_source_version.classification_catalog_version_id,
        COALESCE(v_source_version.metadata_jsonb, '{}'::JSONB),
        COALESCE(v_source_version.future_tax_payload, '{}'::JSONB),
        v_actor,
        v_actor
    )
    RETURNING id INTO v_new_version_id;

    INSERT INTO public.fiscal_ibscbs_rules (
        ibscbs_version_id,
        target_uf,
        cst_code,
        classification_code,
        is_active,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    SELECT
        v_new_version_id,
        target_uf,
        cst_code,
        classification_code,
        is_active,
        metadata_jsonb,
        future_tax_payload,
        v_actor,
        v_actor
      FROM public.fiscal_ibscbs_rules
     WHERE ibscbs_version_id = v_source_version.id
     ORDER BY target_uf NULLS FIRST, created_at ASC;

    RETURN QUERY
    SELECT
        p_ibscbs_base_id,
        v_new_version_id,
        v_new_version_number,
        COALESCE(NULLIF(TRIM(COALESCE(p_version_label, '')), ''), FORMAT('%s-V%s', v_base.code, v_new_version_number));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_fiscal_ibscbs_base_version(UUID, UUID, TEXT, DATE, DATE)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_activate_fiscal_ibscbs_base_version(
    p_ibscbs_version_id UUID
)
RETURNS TABLE (
    ibscbs_base_id UUID,
    ibscbs_version_id UUID,
    version_label TEXT,
    valid_from DATE,
    valid_to DATE,
    status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_target_version RECORD;
BEGIN
    SELECT *
      INTO v_target_version
      FROM public.fiscal_ibscbs_base_versions
     WHERE id = p_ibscbs_version_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'IBS/CBS version % not found', p_ibscbs_version_id;
    END IF;

    IF v_target_version.status = 'active' THEN
        RETURN QUERY
        SELECT
            v_target_version.ibscbs_base_id,
            v_target_version.id,
            v_target_version.version_label,
            v_target_version.valid_from,
            v_target_version.valid_to,
            v_target_version.status;
        RETURN;
    END IF;

    IF v_target_version.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft IBS/CBS versions can be activated';
    END IF;

    UPDATE public.fiscal_ibscbs_base_versions version_row
       SET status = 'superseded',
           valid_to = CASE
               WHEN version_row.valid_to IS NULL
                    AND v_target_version.valid_from IS NOT NULL
                    AND (version_row.valid_from IS NULL OR version_row.valid_from <= (v_target_version.valid_from - 1))
                   THEN (v_target_version.valid_from - 1)
               ELSE version_row.valid_to
           END,
           updated_by = v_actor,
           updated_at = NOW()
     WHERE version_row.ibscbs_base_id = v_target_version.ibscbs_base_id
       AND version_row.status = 'active'
       AND version_row.id <> v_target_version.id;

    UPDATE public.fiscal_ibscbs_base_versions version_row
       SET status = 'active',
           activated_at = NOW(),
           activated_by = v_actor,
           updated_by = v_actor,
           updated_at = NOW()
     WHERE version_row.id = v_target_version.id;

    RETURN QUERY
    SELECT
        version_row.ibscbs_base_id,
        version_row.id,
        version_row.version_label,
        version_row.valid_from,
        version_row.valid_to,
        version_row.status
      FROM public.fiscal_ibscbs_base_versions version_row
     WHERE version_row.id = v_target_version.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_fiscal_ibscbs_base_version(UUID)
TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB,
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
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
    p_ibscbs_base_id UUID DEFAULT NULL,
    p_ibscbs_version_id UUID DEFAULT NULL,
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
            icms_base_id, ibscbs_base_id, ibscbs_version_id,
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
               ibscbs_base_id = p_ibscbs_base_id,
               ibscbs_version_id = p_ibscbs_version_id,
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
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
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
        icms_base_id, ibscbs_base_id, ibscbs_version_id,
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
        COALESCE(v_source.fiscal_reference_snapshot_jsonb, '{}'::JSONB),
        v_actor,
        v_actor
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.product_tax_profile_rules (
        tax_profile_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override, priority,
        is_active, effective_from, effective_to, rule_payload_jsonb, future_tax_payload,
        created_by, updated_by
    )
    SELECT
        v_new_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override, priority,
        is_active, effective_from, effective_to, rule_payload_jsonb, future_tax_payload,
        v_actor, v_actor
      FROM public.product_tax_profile_rules
     WHERE tax_profile_id = p_tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(
        v_new_id,
        'duplicate',
        v_actor,
        jsonb_build_object('source_tax_profile_id', p_tax_profile_id)
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
                'ibscbs_base_id', v_profile.ibscbs_base_id,
                'ibscbs_version_id', v_profile.ibscbs_version_id,
                'ibscbs_base_code', (SELECT base.code FROM public.fiscal_ibscbs_bases base WHERE base.id = v_profile.ibscbs_base_id LIMIT 1),
                'ibscbs_base_name', (SELECT base.name FROM public.fiscal_ibscbs_bases base WHERE base.id = v_profile.ibscbs_base_id LIMIT 1),
                'ibscbs_version_label', (SELECT version_row.version_label FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'ibscbs_valid_from', (SELECT version_row.valid_from FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'ibscbs_valid_to', (SELECT version_row.valid_to FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'fiscal_reference_snapshot', v_profile.fiscal_reference_snapshot_jsonb
            )
            || COALESCE(v_profile.future_tax_payload, '{}'::JSONB)
            || COALESCE(v_rule.rule_payload_jsonb, '{}'::JSONB)
            || COALESCE(v_rule.future_tax_payload, '{}'::JSONB)
        );
END;
$$;
