-- ============================================================
-- Migration 094: Real A1 parsing metadata support
-- ============================================================

ALTER TABLE public.company_certificate_config
    ADD COLUMN IF NOT EXISTS certificate_subject TEXT,
    ADD COLUMN IF NOT EXISTS certificate_thumbprint TEXT,
    ADD COLUMN IF NOT EXISTS metadata_source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_certificate_config_metadata_source_check'
    ) THEN
        ALTER TABLE public.company_certificate_config
            ADD CONSTRAINT company_certificate_config_metadata_source_check
            CHECK (metadata_source IN ('manual', 'parsed_a1'));
    END IF;
END $$;
