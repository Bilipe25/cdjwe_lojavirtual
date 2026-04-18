BEGIN;

ALTER TABLE public.order_fiscal_settings
    ADD COLUMN IF NOT EXISTS transporter_address TEXT NULL,
    ADD COLUMN IF NOT EXISTS transporter_city TEXT NULL,
    ADD COLUMN IF NOT EXISTS transporter_state TEXT NULL,
    ADD COLUMN IF NOT EXISTS transporter_ie TEXT NULL;

ALTER TABLE public.order_fiscal_settings
    DROP CONSTRAINT IF EXISTS order_fiscal_settings_vehicle_uf_check;

ALTER TABLE public.order_fiscal_settings
    ADD CONSTRAINT order_fiscal_settings_vehicle_uf_check CHECK (
        vehicle_uf IS NULL OR vehicle_uf ~ '^[A-Z]{2}$'
    );

ALTER TABLE public.order_fiscal_settings
    ADD CONSTRAINT order_fiscal_settings_transporter_state_check CHECK (
        transporter_state IS NULL OR transporter_state ~ '^[A-Z]{2}$'
    );

COMMIT;
