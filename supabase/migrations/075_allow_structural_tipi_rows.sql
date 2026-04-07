-- Migration 075: allow official hierarchical TIPI rows (2-8 digits) to be persisted

ALTER TABLE public.fiscal_tipi_entries
    DROP CONSTRAINT IF EXISTS fiscal_tipi_entries_ncm_check;

ALTER TABLE public.fiscal_tipi_entries
    ADD CONSTRAINT fiscal_tipi_entries_ncm_check
    CHECK (ncm_code ~ '^\d{2,8}$');
