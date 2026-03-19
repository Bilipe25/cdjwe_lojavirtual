-- ============================================================
-- Migration 029: Representative Sales Mode Foundation
-- ============================================================

-- ==================== PROFILE ROLES ====================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'client', 'representative'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'client') IN ('admin', 'representative') THEN 'approved'
      ELSE 'pending'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_representative()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'representative'
      AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_approved_client()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('client', 'representative')
      AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== STORE CUSTOMER CODE ====================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS customer_code TEXT;

UPDATE public.stores
SET customer_code = 'CLI-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE customer_code IS NULL OR TRIM(customer_code) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_customer_code_unique
  ON public.stores(customer_code)
  WHERE customer_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_store_customer_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := uuid_generate_v4();
  END IF;

  IF COALESCE(NULLIF(TRIM(COALESCE(NEW.customer_code, '')), ''), NULL) IS NULL THEN
    NEW.customer_code := 'CLI-' || UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 8));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assign_store_customer_code_trigger ON public.stores;
CREATE TRIGGER assign_store_customer_code_trigger
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_store_customer_code();

-- ==================== ORDERS SALES METADATA ====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'customer_portal',
  ADD COLUMN IF NOT EXISTS negotiation_discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negotiation_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negotiation_surcharge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negotiation_reason TEXT;

UPDATE public.orders
SET created_by_profile_id = COALESCE(created_by_profile_id, profile_id)
WHERE created_by_profile_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_sales_channel_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_sales_channel_check
      CHECK (sales_channel IN ('customer_portal', 'representative'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_negotiation_non_negative_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_negotiation_non_negative_check
      CHECK (
        negotiation_discount_percentage >= 0
        AND negotiation_discount_amount >= 0
        AND negotiation_surcharge_amount >= 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_created_by_profile_id
  ON public.orders(created_by_profile_id);

CREATE INDEX IF NOT EXISTS idx_orders_sales_channel
  ON public.orders(sales_channel);

-- ==================== SALES QUOTES ====================
CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  customer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  price_table_id UUID REFERENCES public.price_tables(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_condition_id UUID REFERENCES public.payment_conditions(id) ON DELETE SET NULL,
  payment_rule_id UUID REFERENCES public.price_table_payment_rules(id) ON DELETE SET NULL,
  payment_method_condition_id UUID REFERENCES public.payment_method_conditions(id) ON DELETE SET NULL,
  payment_method_code TEXT,
  payment_method_name TEXT,
  payment_condition_name TEXT,
  payment_condition_description TEXT,
  payment_installments INTEGER,
  payment_discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  payment_surcharge_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  negotiation_discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  negotiation_discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  negotiation_surcharge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  shipping_address TEXT,
  negotiation_reason TEXT,
  converted_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_name_snapshot TEXT,
  customer_code_snapshot TEXT,
  company_name_snapshot TEXT,
  price_table_name_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_quotes_status_check') THEN
    ALTER TABLE public.sales_quotes
      ADD CONSTRAINT sales_quotes_status_check
      CHECK (status IN ('draft', 'sent', 'approved', 'converted', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_quotes_non_negative_check') THEN
    ALTER TABLE public.sales_quotes
      ADD CONSTRAINT sales_quotes_non_negative_check
      CHECK (
        subtotal >= 0
        AND payment_discount_amount >= 0
        AND payment_discount_percentage >= 0
        AND payment_surcharge_percentage >= 0
        AND negotiation_discount_percentage >= 0
        AND negotiation_discount_amount >= 0
        AND negotiation_surcharge_amount >= 0
        AND total >= 0
        AND (payment_installments IS NULL OR payment_installments >= 1)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_representative_id
  ON public.sales_quotes(representative_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_store_id
  ON public.sales_quotes(store_id);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_status
  ON public.sales_quotes(status);

CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM public.sales_quotes;

  NEW.quote_number := 'ORC' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_sales_quote_number ON public.sales_quotes;
CREATE TRIGGER set_sales_quote_number
  BEFORE INSERT ON public.sales_quotes
  FOR EACH ROW
  WHEN (NEW.quote_number IS NULL OR NEW.quote_number = '')
  EXECUTE FUNCTION public.generate_quote_number();

DROP TRIGGER IF EXISTS update_sales_quotes_updated_at ON public.sales_quotes;
CREATE TRIGGER update_sales_quotes_updated_at
  BEFORE UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== SALES QUOTE ITEMS ====================
CREATE TABLE IF NOT EXISTS public.sales_quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  size_option_id UUID REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  fabric_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  size TEXT,
  size_name TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  product_price NUMERIC(10,2),
  size_price NUMERIC(10,2),
  variation_price NUMERIC(10,2),
  final_price NUMERIC(10,2),
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote_id
  ON public.sales_quote_items(quote_id);

-- ==================== SALES VISITS ====================
CREATE TABLE IF NOT EXISTS public.sales_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  customer_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  result_summary TEXT,
  next_step TEXT,
  outcome TEXT NOT NULL DEFAULT 'planned',
  generated_quote_id UUID REFERENCES public.sales_quotes(id) ON DELETE SET NULL,
  generated_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_visits_outcome_check') THEN
    ALTER TABLE public.sales_visits
      ADD CONSTRAINT sales_visits_outcome_check
      CHECK (outcome IN ('planned', 'completed', 'follow_up', 'converted_quote', 'converted_order'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_visits_representative_id
  ON public.sales_visits(representative_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_visits_store_id
  ON public.sales_visits(store_id);

DROP TRIGGER IF EXISTS update_sales_visits_updated_at ON public.sales_visits;
CREATE TRIGGER update_sales_visits_updated_at
  BEFORE UPDATE ON public.sales_visits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS ====================
ALTER TABLE public.sales_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Representatives can view assigned customer profiles" ON public.profiles;
CREATE POLICY "Representatives can view assigned customer profiles"
  ON public.profiles FOR SELECT
  USING (
    public.is_representative()
    AND role = 'client'
    AND id IN (
      SELECT s.profile_id
      FROM public.stores AS s
      WHERE s.representative_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Representatives can view assigned stores" ON public.stores;
CREATE POLICY "Representatives can view assigned stores"
  ON public.stores FOR SELECT
  USING (
    representative_id = auth.uid()
    AND public.is_representative()
  );

DROP POLICY IF EXISTS "Representatives can view assigned store price tables" ON public.store_price_tables;
CREATE POLICY "Representatives can view assigned store price tables"
  ON public.store_price_tables FOR SELECT
  USING (
    store_id IN (
      SELECT s.id
      FROM public.stores AS s
      WHERE s.representative_id = auth.uid()
    )
    AND public.is_representative()
  );

DROP POLICY IF EXISTS "store_addresses_representative_select" ON public.store_addresses;
CREATE POLICY "store_addresses_representative_select"
  ON public.store_addresses FOR SELECT
  USING (
    store_id IN (
      SELECT s.id
      FROM public.stores AS s
      WHERE s.representative_id = auth.uid()
    )
    AND public.is_representative()
  );

DROP POLICY IF EXISTS "Representatives can view assigned orders" ON public.orders;
CREATE POLICY "Representatives can view assigned orders"
  ON public.orders FOR SELECT
  USING (
    public.is_representative()
    AND (
      created_by_profile_id = auth.uid()
      OR store_id IN (
        SELECT s.id
        FROM public.stores AS s
        WHERE s.representative_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Representatives can view assigned order items" ON public.order_items;
CREATE POLICY "Representatives can view assigned order items"
  ON public.order_items FOR SELECT
  USING (
    order_id IN (
      SELECT o.id
      FROM public.orders AS o
      WHERE public.is_representative()
        AND (
          o.created_by_profile_id = auth.uid()
          OR o.store_id IN (
            SELECT s.id
            FROM public.stores AS s
            WHERE s.representative_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Representatives can view assigned order history" ON public.order_status_history;
CREATE POLICY "Representatives can view assigned order history"
  ON public.order_status_history FOR SELECT
  USING (
    order_id IN (
      SELECT o.id
      FROM public.orders AS o
      WHERE public.is_representative()
        AND (
          o.created_by_profile_id = auth.uid()
          OR o.store_id IN (
            SELECT s.id
            FROM public.stores AS s
            WHERE s.representative_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Representatives can manage own sales quotes" ON public.sales_quotes;
CREATE POLICY "Representatives can manage own sales quotes"
  ON public.sales_quotes FOR ALL
  USING (representative_id = auth.uid() OR public.is_admin())
  WITH CHECK (representative_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Representatives can manage own sales quote items" ON public.sales_quote_items;
CREATE POLICY "Representatives can manage own sales quote items"
  ON public.sales_quote_items FOR ALL
  USING (
    quote_id IN (
      SELECT q.id
      FROM public.sales_quotes AS q
      WHERE q.representative_id = auth.uid() OR public.is_admin()
    )
  )
  WITH CHECK (
    quote_id IN (
      SELECT q.id
      FROM public.sales_quotes AS q
      WHERE q.representative_id = auth.uid() OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Representatives can manage own visits" ON public.sales_visits;
CREATE POLICY "Representatives can manage own visits"
  ON public.sales_visits FOR ALL
  USING (representative_id = auth.uid() OR public.is_admin())
  WITH CHECK (representative_id = auth.uid() OR public.is_admin());
