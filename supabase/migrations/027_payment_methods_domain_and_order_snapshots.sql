-- ============================================================
-- Migration 027: Payment Methods Domain + Order Payment Snapshot
-- ============================================================

-- ==================== PAYMENT CONDITIONS HARDENING ====================
ALTER TABLE public.payment_conditions
  ADD COLUMN IF NOT EXISTS min_installment_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_order_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.payment_conditions
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_conditions_non_negative_check') THEN
    ALTER TABLE public.payment_conditions
      ADD CONSTRAINT payment_conditions_non_negative_check CHECK (
        installments >= 1
        AND discount_percentage >= 0
        AND surcharge_percentage >= 0
        AND min_installment_value >= 0
        AND min_order_value >= 0
        AND (max_order_value IS NULL OR max_order_value >= 0)
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_payment_conditions_updated_at ON public.payment_conditions;
CREATE TRIGGER update_payment_conditions_updated_at
  BEFORE UPDATE ON public.payment_conditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payment_conditions_active_sort
  ON public.payment_conditions(is_active, sort_order);

-- ==================== PAYMENT METHODS ====================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_methods_sort_order_check') THEN
    ALTER TABLE public.payment_methods
      ADD CONSTRAINT payment_methods_sort_order_check CHECK (sort_order >= 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payment_methods_active_sort
  ON public.payment_methods(is_active, sort_order);

INSERT INTO public.payment_methods (code, name, description, icon, sort_order)
VALUES
  ('pix', 'PIX', 'Pagamento instantaneo via PIX.', 'qr-code', 1),
  ('boleto', 'Boleto', 'Faturamento via boleto bancario.', 'banknote', 2),
  ('credit_card', 'Cartao de Credito', 'Pagamento em cartao de credito.', 'credit-card', 3),
  ('debit_card', 'Cartao de Debito', 'Pagamento em cartao de debito.', 'wallet', 4),
  ('bank_transfer', 'Transferencia', 'Transferencia bancaria.', 'smartphone', 5),
  ('cash', 'Dinheiro', 'Pagamento em dinheiro.', 'banknote', 6)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can view active payment methods') THEN
    CREATE POLICY "Authenticated users can view active payment methods"
      ON public.payment_methods FOR SELECT
      USING (is_active = true AND auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage payment methods') THEN
    CREATE POLICY "Admins can manage payment methods"
      ON public.payment_methods FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- ==================== PAYMENT METHOD CONDITIONS ====================
CREATE TABLE IF NOT EXISTS public.payment_method_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id) ON DELETE CASCADE,
  payment_condition_id UUID NOT NULL REFERENCES public.payment_conditions(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_method_id, payment_condition_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_method_conditions_sort_order_check') THEN
    ALTER TABLE public.payment_method_conditions
      ADD CONSTRAINT payment_method_conditions_sort_order_check CHECK (sort_order >= 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_payment_method_conditions_updated_at ON public.payment_method_conditions;
CREATE TRIGGER update_payment_method_conditions_updated_at
  BEFORE UPDATE ON public.payment_method_conditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payment_method_conditions_method_active_sort
  ON public.payment_method_conditions(payment_method_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_payment_method_conditions_condition_id
  ON public.payment_method_conditions(payment_condition_id);

ALTER TABLE public.payment_method_conditions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can view active payment method conditions') THEN
    CREATE POLICY "Authenticated users can view active payment method conditions"
      ON public.payment_method_conditions FOR SELECT
      USING (
        is_active = true
        AND auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.payment_methods pm
          WHERE pm.id = payment_method_conditions.payment_method_id
            AND pm.is_active = true
        )
        AND EXISTS (
          SELECT 1
          FROM public.payment_conditions pc
          WHERE pc.id = payment_method_conditions.payment_condition_id
            AND pc.is_active = true
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage payment method conditions') THEN
    CREATE POLICY "Admins can manage payment method conditions"
      ON public.payment_method_conditions FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

INSERT INTO public.payment_method_conditions (
  payment_method_id,
  payment_condition_id,
  is_active,
  sort_order
)
SELECT
  pm.id,
  pc.id,
  true,
  pc.sort_order
FROM public.payment_methods pm
JOIN public.payment_conditions pc
  ON (
    (pm.code = 'pix' AND LOWER(pc.name) LIKE '%vista%')
    OR (pm.code = 'boleto' AND (
      LOWER(pc.name) LIKE '%30 dias%'
      OR LOWER(pc.name) LIKE '%30/60%'
      OR LOWER(pc.name) LIKE '%30/60/90%'
    ))
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.payment_method_conditions pmc
  WHERE pmc.payment_method_id = pm.id
    AND pmc.payment_condition_id = pc.id
);

-- ==================== PRICE TABLE PAYMENT RULES EVOLUTION ====================
ALTER TABLE public.price_table_payment_rules
  ADD COLUMN IF NOT EXISTS payment_method_condition_id UUID,
  ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_table_payment_rules_payment_method_condition_fkey') THEN
    ALTER TABLE public.price_table_payment_rules
      ADD CONSTRAINT price_table_payment_rules_payment_method_condition_fkey
      FOREIGN KEY (payment_method_condition_id)
      REFERENCES public.payment_method_conditions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_table_payment_rules_non_negative_check') THEN
    ALTER TABLE public.price_table_payment_rules
      ADD CONSTRAINT price_table_payment_rules_non_negative_check CHECK (
        min_order_value >= 0
        AND (max_order_value IS NULL OR max_order_value >= 0)
        AND number_of_installments >= 1
        AND discount_percentage >= 0
        AND surcharge_percentage >= 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_price_table_payment_rules_method_condition
  ON public.price_table_payment_rules(payment_method_condition_id);

CREATE INDEX IF NOT EXISTS idx_price_table_payment_rules_active_table
  ON public.price_table_payment_rules(price_table_id, is_active);

-- ==================== ORDERS PAYMENT SNAPSHOT ====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_id UUID,
  ADD COLUMN IF NOT EXISTS payment_method_condition_id UUID,
  ADD COLUMN IF NOT EXISTS payment_method_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_condition_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_condition_description TEXT,
  ADD COLUMN IF NOT EXISTS payment_installments INTEGER,
  ADD COLUMN IF NOT EXISTS payment_discount_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS payment_surcharge_percentage NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_id_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_id_fkey
      FOREIGN KEY (payment_method_id)
      REFERENCES public.payment_methods(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_condition_id_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_condition_id_fkey
      FOREIGN KEY (payment_method_condition_id)
      REFERENCES public.payment_method_conditions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_snapshot_non_negative_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_snapshot_non_negative_check CHECK (
        (payment_installments IS NULL OR payment_installments >= 1)
        AND (payment_discount_percentage IS NULL OR payment_discount_percentage >= 0)
        AND (payment_surcharge_percentage IS NULL OR payment_surcharge_percentage >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method_id
  ON public.orders(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_orders_payment_method_condition_id
  ON public.orders(payment_method_condition_id);
