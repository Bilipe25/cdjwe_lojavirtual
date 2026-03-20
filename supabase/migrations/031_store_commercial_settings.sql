-- ============================================================
-- Migration 031: Store Commercial Settings (Customer Overrides)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.store_commercial_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  override_price_table_id UUID REFERENCES public.price_tables(id) ON DELETE SET NULL,
  override_payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  override_payment_condition_id UUID REFERENCES public.payment_conditions(id) ON DELETE SET NULL,
  financial_profile TEXT NOT NULL DEFAULT 'no_restriction',
  max_discount_percentage NUMERIC(5,2),
  credit_limit NUMERIC(12,2),
  commercial_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_commercial_settings_financial_profile_check'
  ) THEN
    ALTER TABLE public.store_commercial_settings
      ADD CONSTRAINT store_commercial_settings_financial_profile_check
      CHECK (financial_profile IN ('no_restriction', 'cash_only', 'block_sales'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_store_commercial_settings_on_order_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings RECORD;
  v_installments INTEGER;
  v_open_exposure NUMERIC(12,2);
BEGIN
  SELECT *
    INTO v_settings
    FROM public.store_commercial_settings
   WHERE store_id = NEW.store_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_settings.financial_profile = 'block_sales' THEN
    RAISE EXCEPTION 'Este cliente esta com vendas restritas.';
  END IF;

  IF v_settings.override_payment_method_id IS NOT NULL
     AND NEW.payment_method_id IS DISTINCT FROM v_settings.override_payment_method_id THEN
    RAISE EXCEPTION 'Meio de pagamento invalido para a politica comercial do cliente.';
  END IF;

  IF v_settings.override_payment_condition_id IS NOT NULL
     AND NEW.payment_condition_id IS DISTINCT FROM v_settings.override_payment_condition_id THEN
    RAISE EXCEPTION 'Condicao de pagamento invalida para a politica comercial do cliente.';
  END IF;

  IF v_settings.financial_profile = 'cash_only' THEN
    v_installments := COALESCE(
      NEW.payment_installments,
      (
        SELECT pc.installments
          FROM public.payment_conditions AS pc
         WHERE pc.id = NEW.payment_condition_id
         LIMIT 1
      ),
      (
        SELECT pc.installments
          FROM public.payment_method_conditions AS pmc
          JOIN public.payment_conditions AS pc
            ON pc.id = pmc.payment_condition_id
         WHERE pmc.id = NEW.payment_method_condition_id
         LIMIT 1
      ),
      1
    );

    IF v_installments > 1 THEN
      RAISE EXCEPTION 'Cliente com perfil somente a vista (1 parcela).';
    END IF;
  END IF;

  IF COALESCE(v_settings.credit_limit, 0) > 0 THEN
    SELECT COALESCE(SUM(o.total), 0)
      INTO v_open_exposure
      FROM public.orders AS o
     WHERE o.store_id = NEW.store_id
       AND o.status <> 'cancelled'
       AND o.payment_status IN ('pending', 'overdue');

    IF COALESCE(v_open_exposure, 0) + COALESCE(NEW.total, 0) > v_settings.credit_limit THEN
      RAISE EXCEPTION 'Limite de credito excedido para este cliente.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_store_commercial_on_order_insert ON public.orders;
CREATE TRIGGER enforce_store_commercial_on_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_store_commercial_settings_on_order_insert();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_commercial_settings_non_negative_check'
  ) THEN
    ALTER TABLE public.store_commercial_settings
      ADD CONSTRAINT store_commercial_settings_non_negative_check
      CHECK (
        (max_discount_percentage IS NULL OR (max_discount_percentage >= 0 AND max_discount_percentage <= 100))
        AND (credit_limit IS NULL OR credit_limit >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_commercial_settings_store_id
  ON public.store_commercial_settings(store_id);

CREATE INDEX IF NOT EXISTS idx_store_commercial_settings_financial_profile
  ON public.store_commercial_settings(financial_profile);

DROP TRIGGER IF EXISTS update_store_commercial_settings_updated_at ON public.store_commercial_settings;
CREATE TRIGGER update_store_commercial_settings_updated_at
  BEFORE UPDATE ON public.store_commercial_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.store_commercial_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'store_commercial_settings'
      AND policyname = 'Admins can manage store commercial settings'
  ) THEN
    CREATE POLICY "Admins can manage store commercial settings"
      ON public.store_commercial_settings
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'store_commercial_settings'
      AND policyname = 'Store owners and representatives can view own commercial settings'
  ) THEN
    CREATE POLICY "Store owners and representatives can view own commercial settings"
      ON public.store_commercial_settings
      FOR SELECT
      USING (
        public.is_admin()
        OR store_id IN (
          SELECT s.id
          FROM public.stores AS s
          WHERE s.profile_id = auth.uid()
             OR s.representative_id = auth.uid()
        )
      );
  END IF;
END $$;
