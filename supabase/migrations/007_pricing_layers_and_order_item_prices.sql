-- ============================================================
-- Migration 007: Pricing Layers, Order Item Price Snapshotting
-- ============================================================

-- ==================== ORDER ITEMS PRICE SNAPSHOT ====================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS variation_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS final_price NUMERIC(10,2);

-- Backfill existing rows (best-effort using current unit_price)
UPDATE public.order_items
SET
  product_price = COALESCE(product_price, unit_price),
  variation_price = COALESCE(variation_price, unit_price),
  final_price = COALESCE(final_price, unit_price)
WHERE product_price IS NULL OR variation_price IS NULL OR final_price IS NULL;

-- ==================== PRICE VALIDATIONS ====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_base_price_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_base_price_check CHECK (base_price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_price_override_check') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_price_override_check CHECK (price_override IS NULL OR price_override >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_table_items_custom_price_check') THEN
    ALTER TABLE public.price_table_items
      ADD CONSTRAINT price_table_items_custom_price_check CHECK (custom_price >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_price_snapshot_check') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_price_snapshot_check CHECK (
        (product_price IS NULL OR product_price >= 0)
        AND (variation_price IS NULL OR variation_price >= 0)
        AND (final_price IS NULL OR final_price >= 0)
      );
  END IF;
END $$;

-- ==================== FABRIC/COLOR INTEGRITY ====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fabric_colors_id_fabric_id_unique') THEN
    ALTER TABLE public.fabric_colors
      ADD CONSTRAINT fabric_colors_id_fabric_id_unique UNIQUE (id, fabric_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_fabric_color_fk') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_fabric_color_fk
      FOREIGN KEY (fabric_color_id, fabric_id)
      REFERENCES public.fabric_colors (id, fabric_id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

-- ==================== PRICE TABLE PAYMENT RULES ====================
CREATE TABLE IF NOT EXISTS public.price_table_payment_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_order_value NUMERIC(10,2),
  number_of_installments INTEGER NOT NULL DEFAULT 1,
  installment_days TEXT,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_table_payment_rules_table_id
  ON public.price_table_payment_rules(price_table_id);

DROP TRIGGER IF EXISTS update_price_table_payment_rules_updated_at ON public.price_table_payment_rules;
CREATE TRIGGER update_price_table_payment_rules_updated_at
  BEFORE UPDATE ON public.price_table_payment_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.price_table_payment_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage price table payment rules') THEN
    CREATE POLICY "Admins can manage price table payment rules"
      ON public.price_table_payment_rules FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- ==================== RLS FOR PRICE TABLE ITEMS (CLIENT READ) ====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own price table items') THEN
    CREATE POLICY "Users can view own price table items"
      ON public.price_table_items FOR SELECT
      USING (
        public.is_admin() OR
        price_table_id IN (
          SELECT pt.price_table_id FROM public.store_price_tables pt
          JOIN public.stores s ON s.id = pt.store_id
          WHERE s.profile_id = auth.uid()
        )
      );
  END IF;
END $$;
