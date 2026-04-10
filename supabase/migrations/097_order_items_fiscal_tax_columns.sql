-- ============================================================
-- Migration 097: Order Items — Fiscal Tax Calculation Columns
-- Adds all tax breakdown columns needed by the Motor Fiscal
-- ============================================================

-- 1) order_items — fiscal values
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS fiscal_unit_value NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_value NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_discount_value NUMERIC(15,4) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fiscal_freight_value NUMERIC(15,4) DEFAULT 0;

-- 2) order_items — ICMS
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS icms_cst TEXT,
    ADD COLUMN IF NOT EXISTS icms_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS icms_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS icms_value NUMERIC(15,4);

-- 3) order_items — ICMS ST
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS icms_st_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS icms_st_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS icms_st_value NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS icms_st_mva NUMERIC(7,4);

-- 4) order_items — FCP
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS fcp_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fcp_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS fcp_value NUMERIC(15,4);

-- 5) order_items — PIS
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS pis_cst TEXT,
    ADD COLUMN IF NOT EXISTS pis_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS pis_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS pis_value NUMERIC(15,4);

-- 6) order_items — COFINS
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS cofins_cst TEXT,
    ADD COLUMN IF NOT EXISTS cofins_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS cofins_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS cofins_value NUMERIC(15,4);

-- 7) order_items — IPI
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS ipi_cst TEXT,
    ADD COLUMN IF NOT EXISTS ipi_base NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS ipi_rate NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS ipi_value NUMERIC(15,4);

-- 8) order_items — total tributos
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS total_tributos NUMERIC(15,4);

-- 9) orders — fiscal totals
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS fiscal_total_produtos NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_icms NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_st NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_fcp NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_pis NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_cofins NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_ipi NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_tributos NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_desconto NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_total_frete NUMERIC(15,4),
    ADD COLUMN IF NOT EXISTS fiscal_calculated_at TIMESTAMPTZ;

-- 10) Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_icms_cst_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_icms_cst_check
            CHECK (icms_cst IS NULL OR icms_cst ~ '^\d{2,3}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_pis_cst_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_pis_cst_check
            CHECK (pis_cst IS NULL OR pis_cst ~ '^\d{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_cofins_cst_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_cofins_cst_check
            CHECK (cofins_cst IS NULL OR cofins_cst ~ '^\d{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_ipi_cst_check'
    ) THEN
        ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_ipi_cst_check
            CHECK (ipi_cst IS NULL OR ipi_cst ~ '^\d{2}$');
    END IF;
END $$;

-- 11) Indexes for fiscal queries
CREATE INDEX IF NOT EXISTS idx_orders_fiscal_calculated_at
    ON public.orders(fiscal_calculated_at)
    WHERE fiscal_calculated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_fiscal_ready_true
    ON public.orders(fiscal_ready)
    WHERE fiscal_ready = true;
