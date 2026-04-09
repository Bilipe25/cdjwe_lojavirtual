-- ============================================================
-- Migration 086: Company Fiscal Enterprise Foundation
-- Creates fiscal profile, environment, and certificate config
-- for the company (emitente) side of NF-e issuance.
-- ============================================================

-- 1) Extend system_settings with institutional fields
ALTER TABLE public.system_settings
    ADD COLUMN IF NOT EXISTS razao_social TEXT,
    ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;

-- 2) Company Fiscal Profile (emitente data for NF-e)
CREATE TABLE IF NOT EXISTS public.company_fiscal_profile (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT NOT NULL,
    inscricao_estadual TEXT,
    inscricao_municipal TEXT,
    regime_tributario TEXT,
    crt TEXT,
    cnae_principal TEXT,
    indicador_contribuinte TEXT NOT NULL DEFAULT 'contributor',
    fiscal_email TEXT,
    fiscal_phone TEXT,
    fiscal_address TEXT,
    fiscal_number TEXT,
    fiscal_complement TEXT,
    fiscal_neighborhood TEXT,
    fiscal_city TEXT,
    fiscal_state TEXT,
    fiscal_zip_code TEXT,
    fiscal_municipality_code_ibge TEXT,
    fiscal_country_code TEXT NOT NULL DEFAULT '1058',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_cnpj_format_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_cnpj_format_check
            CHECK (regexp_replace(cnpj, '\D', '', 'g') ~ '^\d{14}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_regime_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_regime_check
            CHECK (
                regime_tributario IS NULL
                OR regime_tributario IN ('simples_nacional', 'simples_excesso', 'lucro_presumido', 'lucro_real')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_crt_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_crt_check
            CHECK (crt IS NULL OR crt IN ('1', '2', '3'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_contribuinte_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_contribuinte_check
            CHECK (indicador_contribuinte IN ('contributor', 'non_contributor', 'exempt'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_uf_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_uf_check
            CHECK (fiscal_state IS NULL OR fiscal_state ~ '^[A-Z]{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_ibge_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_ibge_check
            CHECK (fiscal_municipality_code_ibge IS NULL OR fiscal_municipality_code_ibge ~ '^\d{7}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_country_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_country_check
            CHECK (fiscal_country_code ~ '^\d{4}$');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_company_fiscal_profile_updated_at ON public.company_fiscal_profile;
CREATE TRIGGER update_company_fiscal_profile_updated_at
    BEFORE UPDATE ON public.company_fiscal_profile
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Company Fiscal Environment (emission parameters)
CREATE TABLE IF NOT EXISTS public.company_fiscal_environment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ambiente TEXT NOT NULL DEFAULT 'homologacao',
    serie_padrao_nfe TEXT NOT NULL DEFAULT '1',
    proximo_numero_nfe INTEGER NOT NULL DEFAULT 1,
    tipo_emissao TEXT NOT NULL DEFAULT 'normal',
    emissao_ativa BOOLEAN NOT NULL DEFAULT false,
    parametros_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_environment_ambiente_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT company_fiscal_environment_ambiente_check
            CHECK (ambiente IN ('homologacao', 'producao'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_environment_tipo_emissao_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT company_fiscal_environment_tipo_emissao_check
            CHECK (tipo_emissao IN ('normal', 'contingencia_scan', 'contingencia_dpec', 'contingencia_fsda', 'contingencia_svcan', 'contingencia_svcrs'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_environment_serie_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT company_fiscal_environment_serie_check
            CHECK (serie_padrao_nfe ~ '^\d{1,3}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_environment_numero_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT company_fiscal_environment_numero_check
            CHECK (proximo_numero_nfe >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_environment_parametros_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT company_fiscal_environment_parametros_check
            CHECK (jsonb_typeof(parametros_jsonb) = 'object');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_company_fiscal_environment_updated_at ON public.company_fiscal_environment;
CREATE TRIGGER update_company_fiscal_environment_updated_at
    BEFORE UPDATE ON public.company_fiscal_environment
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Company Certificate Config (digital certificate management)
CREATE TABLE IF NOT EXISTS public.company_certificate_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_name TEXT,
    certificate_status TEXT NOT NULL DEFAULT 'pending',
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    certificate_serial TEXT,
    certificate_issuer TEXT,
    certificate_storage_path TEXT,
    certificate_password_hash TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    alert_days_before_expiry INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_certificate_config_status_check'
    ) THEN
        ALTER TABLE public.company_certificate_config
            ADD CONSTRAINT company_certificate_config_status_check
            CHECK (certificate_status IN ('active', 'expired', 'revoked', 'pending'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_certificate_config_alert_check'
    ) THEN
        ALTER TABLE public.company_certificate_config
            ADD CONSTRAINT company_certificate_config_alert_check
            CHECK (alert_days_before_expiry >= 1 AND alert_days_before_expiry <= 365);
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_company_certificate_config_updated_at ON public.company_certificate_config;
CREATE TRIGGER update_company_certificate_config_updated_at
    BEFORE UPDATE ON public.company_certificate_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RLS
ALTER TABLE public.company_fiscal_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_fiscal_environment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_certificate_config ENABLE ROW LEVEL SECURITY;

-- Fiscal Profile RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_profile' AND policyname = 'cfp_admin_all'
    ) THEN
        CREATE POLICY "cfp_admin_all" ON public.company_fiscal_profile FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_profile' AND policyname = 'cfp_auth_read'
    ) THEN
        CREATE POLICY "cfp_auth_read" ON public.company_fiscal_profile FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- Fiscal Environment RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_environment' AND policyname = 'cfe_admin_all'
    ) THEN
        CREATE POLICY "cfe_admin_all" ON public.company_fiscal_environment FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_fiscal_environment' AND policyname = 'cfe_auth_read'
    ) THEN
        CREATE POLICY "cfe_auth_read" ON public.company_fiscal_environment FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- Certificate Config RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_certificate_config' AND policyname = 'ccc_admin_all'
    ) THEN
        CREATE POLICY "ccc_admin_all" ON public.company_certificate_config FOR ALL
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'company_certificate_config' AND policyname = 'ccc_auth_read'
    ) THEN
        CREATE POLICY "ccc_auth_read" ON public.company_certificate_config FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 6) Storage Bucket for Certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for Certificates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Certificates Admin All'
    ) THEN
        CREATE POLICY "Certificates Admin All" ON storage.objects FOR ALL
            USING ( bucket_id = 'certificates' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') );
    END IF;
END $$;

