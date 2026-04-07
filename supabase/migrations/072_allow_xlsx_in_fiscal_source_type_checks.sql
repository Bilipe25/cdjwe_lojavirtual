-- Migration 072: allow XLSX as official fiscal import source
-- The application now supports CSV + XLSX for preview/import/version history.
-- Existing constraints still allow only csv/manual/api, which blocks new XLSX flows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fiscal_import_batches_source_type_check'
  ) THEN
    ALTER TABLE public.fiscal_import_batches
      DROP CONSTRAINT fiscal_import_batches_source_type_check;
  END IF;

  ALTER TABLE public.fiscal_import_batches
    ADD CONSTRAINT fiscal_import_batches_source_type_check
    CHECK (source_type IN ('csv', 'xlsx', 'manual', 'api'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fiscal_reference_versions_source_type_check'
  ) THEN
    ALTER TABLE public.fiscal_reference_versions
      DROP CONSTRAINT fiscal_reference_versions_source_type_check;
  END IF;

  ALTER TABLE public.fiscal_reference_versions
    ADD CONSTRAINT fiscal_reference_versions_source_type_check
    CHECK (source_type IN ('csv', 'xlsx', 'manual', 'api'));
END $$;
