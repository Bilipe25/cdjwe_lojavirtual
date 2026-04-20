BEGIN;

ALTER TABLE public.order_fiscal_settings
    ADD COLUMN IF NOT EXISTS fiscal_observation TEXT NULL;

COMMIT;
