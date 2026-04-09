-- ============================================================
-- Migration 092: Company fiscal hardening for certificate,
-- readiness gating and page responsibility split.
-- ============================================================

ALTER TABLE public.company_certificate_config
    ADD COLUMN IF NOT EXISTS uploaded_file_name TEXT,
    ADD COLUMN IF NOT EXISTS certificate_fingerprint_sha256 TEXT,
    ADD COLUMN IF NOT EXISTS certificate_password_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS validation_notes TEXT,
    ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_certificate_config_validity_range_check'
    ) THEN
        ALTER TABLE public.company_certificate_config
            ADD CONSTRAINT company_certificate_config_validity_range_check
            CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'company_certificate_config'
          AND policyname = 'ccc_auth_read'
    ) THEN
        DROP POLICY "ccc_auth_read" ON public.company_certificate_config;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'company_certificate_config'
          AND policyname = 'ccc_admin_read'
    ) THEN
        CREATE POLICY "ccc_admin_read" ON public.company_certificate_config
            FOR SELECT
            USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'company_fiscal_profile_singleton_idx'
    ) AND (SELECT COUNT(*) FROM public.company_fiscal_profile) <= 1 THEN
        CREATE UNIQUE INDEX company_fiscal_profile_singleton_idx
            ON public.company_fiscal_profile ((true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'company_fiscal_environment_singleton_idx'
    ) AND (SELECT COUNT(*) FROM public.company_fiscal_environment) <= 1 THEN
        CREATE UNIQUE INDEX company_fiscal_environment_singleton_idx
            ON public.company_fiscal_environment ((true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'company_certificate_config_singleton_idx'
    ) AND (SELECT COUNT(*) FROM public.company_certificate_config) <= 1 THEN
        CREATE UNIQUE INDEX company_certificate_config_singleton_idx
            ON public.company_certificate_config ((true));
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'emitter_federal_tax_config'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'emitter_federal_tax_config_singleton_idx'
    ) AND (SELECT COUNT(*) FROM public.emitter_federal_tax_config) <= 1 THEN
        CREATE UNIQUE INDEX emitter_federal_tax_config_singleton_idx
            ON public.emitter_federal_tax_config ((true));
    END IF;
END $$;
