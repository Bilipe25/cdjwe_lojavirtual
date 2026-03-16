-- ============================================================
-- Migration 012: System Settings Extended Fields
-- - Add social/about/catalog notice fields used by Admin Settings page
-- ============================================================

ALTER TABLE public.system_settings
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS instagram TEXT,
    ADD COLUMN IF NOT EXISTS facebook TEXT,
    ADD COLUMN IF NOT EXISTS about_title TEXT,
    ADD COLUMN IF NOT EXISTS about_text TEXT,
    ADD COLUMN IF NOT EXISTS about_image_url TEXT,
    ADD COLUMN IF NOT EXISTS catalog_notice TEXT,
    ADD COLUMN IF NOT EXISTS catalog_notice_type TEXT DEFAULT 'info';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'system_settings_catalog_notice_type_check'
          AND conrelid = 'public.system_settings'::regclass
    ) THEN
        ALTER TABLE public.system_settings
            DROP CONSTRAINT system_settings_catalog_notice_type_check;
    END IF;
END $$;

ALTER TABLE public.system_settings
    ADD CONSTRAINT system_settings_catalog_notice_type_check
    CHECK (
        catalog_notice_type IS NULL
        OR catalog_notice_type IN ('info', 'promotion', 'attention', 'message')
    );

UPDATE public.system_settings
SET catalog_notice_type = 'info'
WHERE catalog_notice_type IS NULL;
