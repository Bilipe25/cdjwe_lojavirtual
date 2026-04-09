-- ============================================================
-- Migration 087: Emitter Tax Configuration
-- Creates emitter-level tax config tables that LINK to existing
-- fiscal bases (fiscal_icms_bases, fiscal_ibscbs_bases).
-- No duplication of base logic — only configuration layer.
-- ============================================================

-- 1) Emitter Federal Tax Config (single row per company)
CREATE TABLE IF NOT EXISTS public.emitter_federal_tax_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aliquota_pis NUMERIC(7, 4) DEFAULT 0,
    aliquota_cofins NUMERIC(7, 4) DEFAULT 0,
    artigo_sc_mva TEXT DEFAULT 'nenhum',
    exibir_total_tributos BOOLEAN NOT NULL DEFAULT true,
    credito_presumido_icms BOOLEAN NOT NULL DEFAULT false,
    ultrapassou_sublimite BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emitter_federal_tax_config_pis_check'
    ) THEN
        ALTER TABLE public.emitter_federal_tax_config
            ADD CONSTRAINT emitter_federal_tax_config_pis_check
            CHECK (aliquota_pis IS NULL OR (aliquota_pis >= 0 AND aliquota_pis <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emitter_federal_tax_config_cofins_check'
    ) THEN
        ALTER TABLE public.emitter_federal_tax_config
            ADD CONSTRAINT emitter_federal_tax_config_cofins_check
            CHECK (aliquota_cofins IS NULL OR (aliquota_cofins >= 0 AND aliquota_cofins <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emitter_federal_tax_config_artigo_sc_check'
    ) THEN
        ALTER TABLE public.emitter_federal_tax_config
            ADD CONSTRAINT emitter_federal_tax_config_artigo_sc_check
            CHECK (artigo_sc_mva IS NULL OR artigo_sc_mva IN ('nenhum', 'artigo_8', 'artigo_9', 'artigo_10'));
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_emitter_federal_tax_config_updated_at ON public.emitter_federal_tax_config;
CREATE TRIGGER update_emitter_federal_tax_config_updated_at
    BEFORE UPDATE ON public.emitter_federal_tax_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Emitter ICMS State Links (vincula emitente a bases ICMS por UF)
CREATE TABLE IF NOT EXISTS public.emitter_icms_state_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_uf TEXT,
    icms_base_id UUID NOT NULL REFERENCES public.fiscal_icms_bases(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emitter_icms_state_links_uf_check'
    ) THEN
        ALTER TABLE public.emitter_icms_state_links
            ADD CONSTRAINT emitter_icms_state_links_uf_check
            CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$');
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_emitter_icms_state_links_uf
    ON public.emitter_icms_state_links (COALESCE(target_uf, '__NATIONAL__'))
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_emitter_icms_state_links_updated_at ON public.emitter_icms_state_links;
CREATE TRIGGER update_emitter_icms_state_links_updated_at
    BEFORE UPDATE ON public.emitter_icms_state_links
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Emitter IBS/CBS State Links (vincula emitente a bases IBS/CBS por UF)
CREATE TABLE IF NOT EXISTS public.emitter_ibscbs_state_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_uf TEXT,
    ibscbs_base_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_bases(id) ON DELETE CASCADE,
    ibscbs_version_id UUID REFERENCES public.fiscal_ibscbs_base_versions(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emitter_ibscbs_state_links_uf_check'
    ) THEN
        ALTER TABLE public.emitter_ibscbs_state_links
            ADD CONSTRAINT emitter_ibscbs_state_links_uf_check
            CHECK (target_uf IS NULL OR target_uf ~ '^[A-Z]{2}$');
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_emitter_ibscbs_state_links_uf
    ON public.emitter_ibscbs_state_links (COALESCE(target_uf, '__NATIONAL__'))
    WHERE is_active = true;

DROP TRIGGER IF EXISTS update_emitter_ibscbs_state_links_updated_at ON public.emitter_ibscbs_state_links;
CREATE TRIGGER update_emitter_ibscbs_state_links_updated_at
    BEFORE UPDATE ON public.emitter_ibscbs_state_links
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) RLS
ALTER TABLE public.emitter_federal_tax_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emitter_icms_state_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emitter_ibscbs_state_links ENABLE ROW LEVEL SECURITY;

-- Federal Tax Config RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_federal_tax_config' AND policyname = 'eftc_admin_all'
    ) THEN
        CREATE POLICY "eftc_admin_all" ON public.emitter_federal_tax_config FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_federal_tax_config' AND policyname = 'eftc_auth_read'
    ) THEN
        CREATE POLICY "eftc_auth_read" ON public.emitter_federal_tax_config FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- ICMS State Links RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_icms_state_links' AND policyname = 'eisl_admin_all'
    ) THEN
        CREATE POLICY "eisl_admin_all" ON public.emitter_icms_state_links FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_icms_state_links' AND policyname = 'eisl_auth_read'
    ) THEN
        CREATE POLICY "eisl_auth_read" ON public.emitter_icms_state_links FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- IBS/CBS State Links RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_ibscbs_state_links' AND policyname = 'eibsl_admin_all'
    ) THEN
        CREATE POLICY "eibsl_admin_all" ON public.emitter_ibscbs_state_links FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'emitter_ibscbs_state_links' AND policyname = 'eibsl_auth_read'
    ) THEN
        CREATE POLICY "eibsl_auth_read" ON public.emitter_ibscbs_state_links FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;
