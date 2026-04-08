-- ============================================================
-- Migration 013: Catalog Notice Rich Text
-- - Adds HTML storage for the professional catalog notice editor
-- ============================================================

ALTER TABLE public.system_settings
    ADD COLUMN IF NOT EXISTS catalog_notice_html TEXT;
