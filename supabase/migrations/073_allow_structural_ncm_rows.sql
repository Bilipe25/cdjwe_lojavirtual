-- Migration 073: allow structural NCM rows in versioned reference entries
-- Official NCM tables contain hierarchical rows (chapter/position/subposition) in addition
-- to final 8-digit NCM codes. We want to persist those structural rows for consultation in
-- the enterprise NCM page, while keeping fiscal usage restricted in app flows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fiscal_ncm_entries_code_check'
  ) THEN
    ALTER TABLE public.fiscal_ncm_entries
      DROP CONSTRAINT fiscal_ncm_entries_code_check;
  END IF;

  ALTER TABLE public.fiscal_ncm_entries
    ADD CONSTRAINT fiscal_ncm_entries_code_check
    CHECK (code ~ '^\d{2,8}$');
END $$;
