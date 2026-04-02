-- ============================================================
-- Migration 061: Marketing Coupons Enterprise (Admin + Checkout)
-- Goals:
-- - Enterprise coupon schema and scope modeling
-- - Coupon usage ledger with reservation/release lifecycle
-- - Server-side coupon validation/source-of-truth for checkout
-- - Atomic integration with client checkout RPCs (legacy + v2)
-- ============================================================

-- ==================== DISCOUNT COUPONS EVOLUTION ====================

ALTER TABLE public.discount_coupons
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS max_uses_per_customer INTEGER,
  ADD COLUMN IF NOT EXISTS is_cumulative BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.discount_coupons
   SET name = COALESCE(NULLIF(TRIM(name), ''), COALESCE(NULLIF(TRIM(description), ''), code))
 WHERE name IS NULL OR TRIM(name) = '';

UPDATE public.discount_coupons
   SET code = UPPER(TRIM(code))
 WHERE code IS NOT NULL;

UPDATE public.discount_coupons
   SET updated_at = COALESCE(updated_at, created_at, NOW())
 WHERE updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'discount_coupons_validity_range_check'
  ) THEN
    ALTER TABLE public.discount_coupons
      ADD CONSTRAINT discount_coupons_validity_range_check
      CHECK (valid_until IS NULL OR valid_until >= valid_from);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'discount_coupons_values_non_negative_check'
  ) THEN
    ALTER TABLE public.discount_coupons
      ADD CONSTRAINT discount_coupons_values_non_negative_check
      CHECK (
        discount_value >= 0
        AND (min_order_amount IS NULL OR min_order_amount >= 0)
        AND (max_discount_amount IS NULL OR max_discount_amount >= 0)
        AND (max_uses IS NULL OR max_uses >= 0)
        AND (current_uses >= 0)
        AND (max_uses_per_customer IS NULL OR max_uses_per_customer >= 0)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'discount_coupons_percentage_limit_check'
  ) THEN
    ALTER TABLE public.discount_coupons
      ADD CONSTRAINT discount_coupons_percentage_limit_check
      CHECK (
        (discount_type = 'percentage' AND discount_value <= 100)
        OR discount_type = 'fixed'
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_discount_coupons_updated_at ON public.discount_coupons;
CREATE TRIGGER update_discount_coupons_updated_at
  BEFORE UPDATE ON public.discount_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_discount_coupons_active_dates
  ON public.discount_coupons(is_active, valid_from, valid_until);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_discount_type_created_at
  ON public.discount_coupons(discount_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_created_at
  ON public.discount_coupons(created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_coupon_code_input(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN UPPER(TRIM(COALESCE(p_code, '')));
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_normalize_discount_coupon_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.code := public.normalize_coupon_code_input(NEW.code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_discount_coupon_code ON public.discount_coupons;
CREATE TRIGGER trg_normalize_discount_coupon_code
  BEFORE INSERT OR UPDATE OF code ON public.discount_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_normalize_discount_coupon_code();

CREATE TABLE IF NOT EXISTS public.coupon_customer_type_scopes (
  coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  customer_type_id UUID NOT NULL REFERENCES public.customer_types(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, customer_type_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_price_table_scopes (
  coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, price_table_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_product_scopes (
  coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_category_scopes (
  coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_customer_type_scopes_customer_type_id
  ON public.coupon_customer_type_scopes(customer_type_id);

CREATE INDEX IF NOT EXISTS idx_coupon_price_table_scopes_price_table_id
  ON public.coupon_price_table_scopes(price_table_id);

CREATE INDEX IF NOT EXISTS idx_coupon_product_scopes_product_id
  ON public.coupon_product_scopes(product_id);

CREATE INDEX IF NOT EXISTS idx_coupon_category_scopes_category_id
  ON public.coupon_category_scopes(category_id);

ALTER TABLE public.coupon_customer_type_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_price_table_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_product_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_category_scopes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'coupon_customer_type_scopes'
       AND policyname = 'Admins can manage coupon customer type scopes'
  ) THEN
    CREATE POLICY "Admins can manage coupon customer type scopes"
      ON public.coupon_customer_type_scopes
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
       AND tablename = 'coupon_price_table_scopes'
       AND policyname = 'Admins can manage coupon price table scopes'
  ) THEN
    CREATE POLICY "Admins can manage coupon price table scopes"
      ON public.coupon_price_table_scopes
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
       AND tablename = 'coupon_product_scopes'
       AND policyname = 'Admins can manage coupon product scopes'
  ) THEN
    CREATE POLICY "Admins can manage coupon product scopes"
      ON public.coupon_product_scopes
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
       AND tablename = 'coupon_category_scopes'
       AND policyname = 'Admins can manage coupon category scopes'
  ) THEN
    CREATE POLICY "Admins can manage coupon category scopes"
      ON public.coupon_category_scopes
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ==================== COUPON USAGE LEDGER ====================

CREATE TABLE IF NOT EXISTS public.coupon_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID NOT NULL REFERENCES public.discount_coupons(id) ON DELETE RESTRICT,
  order_id UUID UNIQUE REFERENCES public.orders(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  coupon_code_snapshot TEXT NOT NULL,
  coupon_discount_type_snapshot TEXT NOT NULL CHECK (coupon_discount_type_snapshot IN ('percentage', 'fixed')),
  coupon_discount_value_snapshot NUMERIC(10,2) NOT NULL CHECK (coupon_discount_value_snapshot >= 0),
  discount_amount NUMERIC(12,2) NOT NULL CHECK (discount_amount >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'released')),
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon_status
  ON public.coupon_usages(coupon_id, status);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_profile_coupon_status
  ON public.coupon_usages(profile_id, coupon_id, status);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_order_id
  ON public.coupon_usages(order_id);

CREATE INDEX IF NOT EXISTS idx_coupon_usages_created_at
  ON public.coupon_usages(created_at DESC);

ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'coupon_usages'
       AND policyname = 'Users can view own coupon usages'
  ) THEN
    CREATE POLICY "Users can view own coupon usages"
      ON public.coupon_usages
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'coupon_usages'
       AND policyname = 'Admins can manage all coupon usages'
  ) THEN
    CREATE POLICY "Admins can manage all coupon usages"
      ON public.coupon_usages
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ==================== ORDERS COUPON SNAPSHOT ====================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id UUID,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS coupon_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS coupon_discount_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS coupon_discount_amount NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_coupon_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_coupon_id_fkey
      FOREIGN KEY (coupon_id)
      REFERENCES public.discount_coupons(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_coupon_discount_type_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_coupon_discount_type_check
      CHECK (
        coupon_discount_type IS NULL
        OR coupon_discount_type IN ('percentage', 'fixed')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_coupon_snapshot_non_negative_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_coupon_snapshot_non_negative_check
      CHECK (
        (coupon_discount_value IS NULL OR coupon_discount_value >= 0)
        AND (coupon_discount_amount IS NULL OR coupon_discount_amount >= 0)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders(coupon_id);

-- ==================== COUPON LEDGER MAINTENANCE ====================

CREATE OR REPLACE FUNCTION public.sync_coupon_current_uses(p_coupon_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_uses INTEGER;
BEGIN
  IF p_coupon_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_current_uses
    FROM public.coupon_usages
   WHERE coupon_id = p_coupon_id
     AND status = 'reserved';

  UPDATE public.discount_coupons
     SET current_uses = COALESCE(v_current_uses, 0),
         updated_at = NOW()
   WHERE id = p_coupon_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_coupon_current_uses()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_coupon_current_uses(NEW.coupon_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.sync_coupon_current_uses(NEW.coupon_id);
    IF OLD.coupon_id IS DISTINCT FROM NEW.coupon_id THEN
      PERFORM public.sync_coupon_current_uses(OLD.coupon_id);
    END IF;
    RETURN NEW;
  ELSE
    PERFORM public.sync_coupon_current_uses(OLD.coupon_id);
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coupon_current_uses ON public.coupon_usages;
CREATE TRIGGER trg_sync_coupon_current_uses
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_usages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_coupon_current_uses();

-- ==================== COUPON EVALUATION ====================

CREATE OR REPLACE FUNCTION public.coupon_compute_eligible_subtotal(
  p_coupon_id UUID,
  p_items JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_product_scope BOOLEAN;
  v_has_category_scope BOOLEAN;
  v_eligible NUMERIC(12,2);
BEGIN
  IF p_coupon_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN 0;
  END IF;

  SELECT EXISTS(
           SELECT 1
             FROM public.coupon_product_scopes cps
            WHERE cps.coupon_id = p_coupon_id
         )
    INTO v_has_product_scope;

  SELECT EXISTS(
           SELECT 1
             FROM public.coupon_category_scopes ccs
            WHERE ccs.coupon_id = p_coupon_id
         )
    INTO v_has_category_scope;

  WITH item_rows AS (
    SELECT
      CASE
        WHEN (value->>'product_variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (value->>'product_variant_id')::UUID
        ELSE NULL
      END AS product_variant_id,
      CASE
        WHEN COALESCE(value->>'subtotal', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (value->>'subtotal')::NUMERIC
        ELSE 0
      END AS subtotal
    FROM jsonb_array_elements(p_items) AS value
  )
  SELECT COALESCE(
           SUM(
             CASE
               WHEN (NOT v_has_product_scope AND NOT v_has_category_scope) THEN GREATEST(0, i.subtotal)
               WHEN (NOT v_has_product_scope OR EXISTS (
                       SELECT 1
                         FROM public.coupon_product_scopes cps
                        WHERE cps.coupon_id = p_coupon_id
                          AND cps.product_id = p.id
                     ))
                    AND (NOT v_has_category_scope OR EXISTS (
                       SELECT 1
                         FROM public.coupon_category_scopes ccs
                        WHERE ccs.coupon_id = p_coupon_id
                          AND ccs.category_id = p.category_id
                     ))
                 THEN GREATEST(0, i.subtotal)
               ELSE 0
             END
           ),
           0
         )
    INTO v_eligible
    FROM item_rows i
    LEFT JOIN public.product_variants pv
      ON pv.id = i.product_variant_id
    LEFT JOIN public.products p
      ON p.id = pv.product_id;

  RETURN COALESCE(v_eligible, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_coupon_for_checkout(
  p_coupon_code TEXT,
  p_store_id UUID,
  p_profile_id UUID,
  p_items JSONB,
  p_subtotal NUMERIC,
  p_effective_price_table_id UUID DEFAULT NULL,
  p_reference_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  coupon_id UUID,
  coupon_code TEXT,
  coupon_name TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  max_discount_amount NUMERIC,
  is_cumulative BOOLEAN,
  eligible_subtotal NUMERIC,
  discount_amount NUMERIC,
  payment_discount_blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_store_owner UUID;
  v_store_customer_type UUID;
  v_normalized_code TEXT;
  v_coupon public.discount_coupons%ROWTYPE;
  v_now TIMESTAMPTZ := COALESCE(p_reference_at, NOW());
  v_eligible NUMERIC(12,2) := 0;
  v_discount NUMERIC(12,2) := 0;
  v_total_reserved INTEGER := 0;
  v_customer_reserved INTEGER := 0;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF p_store_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'store_id e profile_id sao obrigatorios para validar cupom.';
  END IF;

  IF v_auth_user <> p_profile_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT s.profile_id, s.customer_type_id
    INTO v_store_owner, v_store_customer_type
    FROM public.stores s
   WHERE s.id = p_store_id
   LIMIT 1;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Loja nao encontrada.';
  END IF;

  IF v_store_owner <> p_profile_id THEN
    RAISE EXCEPTION 'Loja nao pertence ao perfil informado.';
  END IF;

  IF p_subtotal IS NULL OR p_subtotal <= 0 THEN
    RAISE EXCEPTION 'Subtotal invalido para validar cupom.';
  END IF;

  v_normalized_code := public.normalize_coupon_code_input(p_coupon_code);
  IF v_normalized_code = '' THEN
    RAISE EXCEPTION 'Codigo de cupom obrigatorio.';
  END IF;

  SELECT *
    INTO v_coupon
    FROM public.discount_coupons
   WHERE code = v_normalized_code
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom nao encontrado.';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'Cupom inativo.';
  END IF;

  IF v_now < v_coupon.valid_from THEN
    RAISE EXCEPTION 'Cupom ainda nao esta vigente.';
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND v_now > v_coupon.valid_until THEN
    RAISE EXCEPTION 'Cupom expirado.';
  END IF;

  IF v_coupon.min_order_amount IS NOT NULL AND p_subtotal < v_coupon.min_order_amount THEN
    RAISE EXCEPTION 'Pedido abaixo do valor minimo para este cupom.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.coupon_customer_type_scopes cts
     WHERE cts.coupon_id = v_coupon.id
  ) THEN
    IF v_store_customer_type IS NULL OR NOT EXISTS (
      SELECT 1
        FROM public.coupon_customer_type_scopes cts
       WHERE cts.coupon_id = v_coupon.id
         AND cts.customer_type_id = v_store_customer_type
    ) THEN
      RAISE EXCEPTION 'Cupom nao disponivel para o tipo de cliente desta loja.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.coupon_price_table_scopes pts
     WHERE pts.coupon_id = v_coupon.id
  ) THEN
    IF p_effective_price_table_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM public.coupon_price_table_scopes pts
       WHERE pts.coupon_id = v_coupon.id
         AND pts.price_table_id = p_effective_price_table_id
    ) THEN
      RAISE EXCEPTION 'Cupom nao disponivel para a tabela de preco ativa desta loja.';
    END IF;
  END IF;

  v_eligible := public.coupon_compute_eligible_subtotal(v_coupon.id, p_items);
  IF v_eligible <= 0 THEN
    RAISE EXCEPTION 'Cupom nao se aplica aos itens do pedido.';
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := v_eligible * (COALESCE(v_coupon.discount_value, 0) / 100);
  ELSE
    v_discount := COALESCE(v_coupon.discount_value, 0);
  END IF;

  IF v_coupon.max_discount_amount IS NOT NULL THEN
    v_discount := LEAST(v_discount, v_coupon.max_discount_amount);
  END IF;

  v_discount := GREATEST(0, LEAST(v_discount, v_eligible, p_subtotal));
  IF v_discount <= 0 THEN
    RAISE EXCEPTION 'Cupom nao gerou desconto valido para este pedido.';
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_total_reserved
    FROM public.coupon_usages cu
   WHERE cu.coupon_id = v_coupon.id
     AND cu.status = 'reserved';

  IF v_coupon.max_uses IS NOT NULL AND v_total_reserved >= v_coupon.max_uses THEN
    RAISE EXCEPTION 'Cupom atingiu o limite total de usos.';
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_customer_reserved
    FROM public.coupon_usages cu
   WHERE cu.coupon_id = v_coupon.id
     AND cu.profile_id = p_profile_id
     AND cu.status = 'reserved';

  IF v_coupon.max_uses_per_customer IS NOT NULL
     AND v_customer_reserved >= v_coupon.max_uses_per_customer THEN
    RAISE EXCEPTION 'Cupom atingiu o limite de uso por cliente.';
  END IF;

  RETURN QUERY
  SELECT
    v_coupon.id,
    v_coupon.code,
    v_coupon.name,
    v_coupon.discount_type,
    v_coupon.discount_value,
    v_coupon.max_discount_amount,
    v_coupon.is_cumulative,
    v_eligible,
    v_discount,
    (NOT v_coupon.is_cumulative);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_coupon_usage_for_order(
  p_order_id UUID,
  p_coupon_id UUID,
  p_store_id UUID,
  p_profile_id UUID,
  p_coupon_code_snapshot TEXT,
  p_coupon_discount_type_snapshot TEXT,
  p_coupon_discount_value_snapshot NUMERIC,
  p_discount_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.discount_coupons%ROWTYPE;
  v_total_reserved INTEGER := 0;
  v_customer_reserved INTEGER := 0;
  v_existing_usage UUID;
  v_usage_id UUID;
BEGIN
  IF p_order_id IS NULL OR p_coupon_id IS NULL OR p_store_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'Dados incompletos para reservar uso do cupom.';
  END IF;

  IF COALESCE(p_discount_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor de desconto invalido para reservar uso do cupom.';
  END IF;

  SELECT id
    INTO v_existing_usage
    FROM public.coupon_usages
   WHERE order_id = p_order_id
   LIMIT 1;

  IF v_existing_usage IS NOT NULL THEN
    RETURN v_existing_usage;
  END IF;

  SELECT *
    INTO v_coupon
    FROM public.discount_coupons
   WHERE id = p_coupon_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom nao encontrado para reserva de uso.';
  END IF;

  IF NOT v_coupon.is_active THEN
    RAISE EXCEPTION 'Cupom inativo no momento da reserva.';
  END IF;

  IF NOW() < v_coupon.valid_from THEN
    RAISE EXCEPTION 'Cupom ainda nao vigente no momento da reserva.';
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND NOW() > v_coupon.valid_until THEN
    RAISE EXCEPTION 'Cupom expirado no momento da reserva.';
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_total_reserved
    FROM public.coupon_usages cu
   WHERE cu.coupon_id = p_coupon_id
     AND cu.status = 'reserved';

  IF v_coupon.max_uses IS NOT NULL AND v_total_reserved >= v_coupon.max_uses THEN
    RAISE EXCEPTION 'Nao ha mais usos disponiveis para este cupom.';
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_customer_reserved
    FROM public.coupon_usages cu
   WHERE cu.coupon_id = p_coupon_id
     AND cu.profile_id = p_profile_id
     AND cu.status = 'reserved';

  IF v_coupon.max_uses_per_customer IS NOT NULL
     AND v_customer_reserved >= v_coupon.max_uses_per_customer THEN
    RAISE EXCEPTION 'Cliente atingiu o limite de uso deste cupom.';
  END IF;

  BEGIN
    INSERT INTO public.coupon_usages (
      coupon_id,
      order_id,
      profile_id,
      store_id,
      coupon_code_snapshot,
      coupon_discount_type_snapshot,
      coupon_discount_value_snapshot,
      discount_amount,
      status
    )
    VALUES (
      p_coupon_id,
      p_order_id,
      p_profile_id,
      p_store_id,
      public.normalize_coupon_code_input(p_coupon_code_snapshot),
      p_coupon_discount_type_snapshot,
      p_coupon_discount_value_snapshot,
      p_discount_amount,
      'reserved'
    )
    RETURNING id INTO v_usage_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id
        INTO v_usage_id
        FROM public.coupon_usages
       WHERE order_id = p_order_id
       LIMIT 1;

      IF v_usage_id IS NULL THEN
        RAISE EXCEPTION 'Conflito ao reservar uso do cupom para o pedido.';
      END IF;
  END;

  RETURN v_usage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_coupon_usage_for_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_detach_order BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected INTEGER := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.coupon_usages cu
     SET status = 'released',
         released_at = NOW(),
         release_reason = COALESCE(NULLIF(TRIM(COALESCE(p_reason, '')), ''), 'order_released'),
         order_id = CASE WHEN p_detach_order THEN NULL ELSE cu.order_id END
   WHERE cu.order_id = p_order_id
     AND cu.status = 'reserved';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_release_coupon_on_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.release_coupon_usage_for_order(NEW.id, 'order_cancelled', FALSE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_coupon_on_order_cancel ON public.orders;
CREATE TRIGGER trg_release_coupon_on_order_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_release_coupon_on_order_cancel();

CREATE OR REPLACE FUNCTION public.trg_release_coupon_on_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.release_coupon_usage_for_order(OLD.id, 'order_deleted', TRUE);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_coupon_on_order_delete ON public.orders;
CREATE TRIGGER trg_release_coupon_on_order_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_release_coupon_on_order_delete();

-- ==================== ADMIN UPSERT (ATOMIC SCOPES) ====================

CREATE OR REPLACE FUNCTION public.admin_upsert_coupon(
  p_coupon_id UUID DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_discount_type TEXT DEFAULT NULL,
  p_discount_value NUMERIC DEFAULT NULL,
  p_min_order_amount NUMERIC DEFAULT NULL,
  p_max_discount_amount NUMERIC DEFAULT NULL,
  p_max_uses INTEGER DEFAULT NULL,
  p_max_uses_per_customer INTEGER DEFAULT NULL,
  p_is_cumulative BOOLEAN DEFAULT TRUE,
  p_valid_from TIMESTAMPTZ DEFAULT NOW(),
  p_valid_until TIMESTAMPTZ DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_customer_type_scope_ids UUID[] DEFAULT NULL,
  p_price_table_scope_ids UUID[] DEFAULT NULL,
  p_product_scope_ids UUID[] DEFAULT NULL,
  p_category_scope_ids UUID[] DEFAULT NULL,
  p_actor_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
  v_actor UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  v_actor := COALESCE(p_actor_profile_id, auth.uid());
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Ator invalido para operacao de cupom.';
  END IF;

  IF p_coupon_id IS NULL THEN
    INSERT INTO public.discount_coupons (
      code,
      name,
      description,
      discount_type,
      discount_value,
      min_order_amount,
      max_discount_amount,
      max_uses,
      max_uses_per_customer,
      is_cumulative,
      valid_from,
      valid_until,
      is_active,
      created_by,
      updated_by
    )
    VALUES (
      p_code,
      p_name,
      p_description,
      p_discount_type,
      p_discount_value,
      p_min_order_amount,
      p_max_discount_amount,
      p_max_uses,
      p_max_uses_per_customer,
      COALESCE(p_is_cumulative, TRUE),
      COALESCE(p_valid_from, NOW()),
      p_valid_until,
      COALESCE(p_is_active, TRUE),
      v_actor,
      v_actor
    )
    RETURNING id INTO v_coupon_id;
  ELSE
    UPDATE public.discount_coupons
       SET code = COALESCE(p_code, code),
           name = COALESCE(p_name, name),
           description = p_description,
           discount_type = COALESCE(p_discount_type, discount_type),
           discount_value = COALESCE(p_discount_value, discount_value),
           min_order_amount = p_min_order_amount,
           max_discount_amount = p_max_discount_amount,
           max_uses = p_max_uses,
           max_uses_per_customer = p_max_uses_per_customer,
           is_cumulative = COALESCE(p_is_cumulative, is_cumulative),
           valid_from = COALESCE(p_valid_from, valid_from),
           valid_until = p_valid_until,
           is_active = COALESCE(p_is_active, is_active),
           updated_by = v_actor,
           updated_at = NOW()
     WHERE id = p_coupon_id
     RETURNING id INTO v_coupon_id;

    IF v_coupon_id IS NULL THEN
      RAISE EXCEPTION 'Cupom nao encontrado para atualizacao.';
    END IF;
  END IF;

  DELETE FROM public.coupon_customer_type_scopes WHERE coupon_id = v_coupon_id;
  IF p_customer_type_scope_ids IS NOT NULL AND COALESCE(array_length(p_customer_type_scope_ids, 1), 0) > 0 THEN
    INSERT INTO public.coupon_customer_type_scopes (coupon_id, customer_type_id)
    SELECT v_coupon_id, scope_id
      FROM (
        SELECT DISTINCT UNNEST(p_customer_type_scope_ids) AS scope_id
      ) AS scoped
     WHERE scope_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.coupon_price_table_scopes WHERE coupon_id = v_coupon_id;
  IF p_price_table_scope_ids IS NOT NULL AND COALESCE(array_length(p_price_table_scope_ids, 1), 0) > 0 THEN
    INSERT INTO public.coupon_price_table_scopes (coupon_id, price_table_id)
    SELECT v_coupon_id, scope_id
      FROM (
        SELECT DISTINCT UNNEST(p_price_table_scope_ids) AS scope_id
      ) AS scoped
     WHERE scope_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.coupon_product_scopes WHERE coupon_id = v_coupon_id;
  IF p_product_scope_ids IS NOT NULL AND COALESCE(array_length(p_product_scope_ids, 1), 0) > 0 THEN
    INSERT INTO public.coupon_product_scopes (coupon_id, product_id)
    SELECT v_coupon_id, scope_id
      FROM (
        SELECT DISTINCT UNNEST(p_product_scope_ids) AS scope_id
      ) AS scoped
     WHERE scope_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.coupon_category_scopes WHERE coupon_id = v_coupon_id;
  IF p_category_scope_ids IS NOT NULL AND COALESCE(array_length(p_category_scope_ids, 1), 0) > 0 THEN
    INSERT INTO public.coupon_category_scopes (coupon_id, category_id)
    SELECT v_coupon_id, scope_id
      FROM (
        SELECT DISTINCT UNNEST(p_category_scope_ids) AS scope_id
      ) AS scoped
     WHERE scope_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_coupon_id;
END;
$$;

-- ==================== CHECKOUT PREVIEW (SERVER ACTION SUPPORT) ====================

CREATE OR REPLACE FUNCTION public.client_preview_coupon_for_order(
  p_store_id UUID,
  p_profile_id UUID,
  p_coupon_code TEXT,
  p_items JSONB
)
RETURNS TABLE (
  coupon_id UUID,
  coupon_code TEXT,
  coupon_name TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  max_discount_amount NUMERIC,
  is_cumulative BOOLEAN,
  subtotal NUMERIC,
  eligible_subtotal NUMERIC,
  discount_amount NUMERIC,
  payment_discount_blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_store_owner UUID;
  v_effective_price_table_id UUID;
  v_item JSONB;
  v_index INTEGER := 0;
  v_variant_id UUID;
  v_size_option_id UUID;
  v_quantity INTEGER;
  v_item_snapshot RECORD;
  v_items_snapshot JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  v_eval RECORD;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF p_store_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'store_id e profile_id sao obrigatorios.';
  END IF;

  IF v_auth_user <> p_profile_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT s.profile_id
    INTO v_store_owner
    FROM public.stores s
   WHERE s.id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Loja nao encontrada.';
  END IF;

  IF v_store_owner <> p_profile_id THEN
    RAISE EXCEPTION 'Loja nao pertence ao perfil informado.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do pedido sao obrigatorios.';
  END IF;

  v_effective_price_table_id := public.resolve_effective_price_table_for_store(p_store_id, NULL);

  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(p_items)
  LOOP
    v_index := v_index + 1;

    BEGIN
      v_variant_id := NULLIF(TRIM(COALESCE(v_item->>'product_variant_id', '')), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item % com product_variant_id invalido.', v_index;
    END;

    BEGIN
      v_quantity := COALESCE(NULLIF(TRIM(COALESCE(v_item->>'quantity', '')), ''), '0')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item % com quantity invalido.', v_index;
    END;

    IF NULLIF(TRIM(COALESCE(v_item->>'size_option_id', '')), '') IS NOT NULL THEN
      BEGIN
        v_size_option_id := NULLIF(TRIM(COALESCE(v_item->>'size_option_id', '')), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Item % com size_option_id invalido.', v_index;
      END;
    ELSE
      v_size_option_id := NULL;
    END IF;

    SELECT *
      INTO v_item_snapshot
      FROM public.checkout_resolve_item_snapshot_v2(
        v_variant_id,
        v_size_option_id,
        v_quantity,
        v_effective_price_table_id
      );

    v_subtotal := v_subtotal + COALESCE(v_item_snapshot.subtotal, 0);
    v_items_snapshot := v_items_snapshot || jsonb_build_array(
      jsonb_build_object(
        'product_variant_id', v_item_snapshot.product_variant_id,
        'subtotal', v_item_snapshot.subtotal
      )
    );
  END LOOP;

  IF v_index = 0 THEN
    RAISE EXCEPTION 'Nenhum item valido foi informado.';
  END IF;

  SELECT *
    INTO v_eval
    FROM public.validate_coupon_for_checkout(
      p_coupon_code,
      p_store_id,
      p_profile_id,
      v_items_snapshot,
      v_subtotal,
      v_effective_price_table_id,
      NOW()
    )
   LIMIT 1;

  RETURN QUERY
  SELECT
    v_eval.coupon_id,
    v_eval.coupon_code,
    v_eval.coupon_name,
    v_eval.discount_type,
    v_eval.discount_value,
    v_eval.max_discount_amount,
    v_eval.is_cumulative,
    v_subtotal,
    v_eval.eligible_subtotal,
    v_eval.discount_amount,
    v_eval.payment_discount_blocked;
END;
$$;

-- ==================== ORDER COUPON APPLIER ====================

CREATE OR REPLACE FUNCTION public.apply_coupon_to_order_snapshot(
  p_order_id UUID,
  p_store_id UUID,
  p_profile_id UUID,
  p_coupon_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_effective_price_table_id UUID;
  v_items_snapshot JSONB := '[]'::jsonb;
  v_eval RECORD;
  v_base_after_coupon NUMERIC(12,2);
  v_payment_discount_pct_effective NUMERIC(8,4);
  v_payment_discount_amount NUMERIC(12,2);
  v_after_payment_discount NUMERIC(12,2);
  v_payment_surcharge_amount NUMERIC(12,2);
  v_total NUMERIC(12,2);
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio para aplicar cupom no pedido.';
  END IF;

  SELECT
    o.id,
    o.store_id,
    o.profile_id,
    o.subtotal,
    COALESCE(o.payment_discount_percentage, 0) AS payment_discount_percentage,
    COALESCE(o.payment_surcharge_percentage, 0) AS payment_surcharge_percentage,
    o.coupon_id
    INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado para aplicar cupom.';
  END IF;

  IF v_order.store_id <> p_store_id OR v_order.profile_id <> p_profile_id THEN
    RAISE EXCEPTION 'Pedido nao pertence ao contexto informado para aplicacao de cupom.';
  END IF;

  IF v_order.coupon_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pedido ja possui cupom aplicado.';
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'product_variant_id', oi.product_variant_id,
               'subtotal', oi.subtotal
             )
           ),
           '[]'::jsonb
         )
    INTO v_items_snapshot
    FROM public.order_items oi
   WHERE oi.order_id = p_order_id;

  IF jsonb_array_length(v_items_snapshot) = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens validos para aplicar cupom.';
  END IF;

  v_effective_price_table_id := public.resolve_effective_price_table_for_store(p_store_id, NULL);

  SELECT *
    INTO v_eval
    FROM public.validate_coupon_for_checkout(
      p_coupon_code,
      p_store_id,
      p_profile_id,
      v_items_snapshot,
      v_order.subtotal,
      v_effective_price_table_id,
      NOW()
    )
   LIMIT 1;

  v_base_after_coupon := GREATEST(0, v_order.subtotal - v_eval.discount_amount);
  v_payment_discount_pct_effective := COALESCE(v_order.payment_discount_percentage, 0);

  IF v_eval.payment_discount_blocked THEN
    v_payment_discount_pct_effective := 0;
  END IF;

  v_payment_discount_amount := v_base_after_coupon * (v_payment_discount_pct_effective / 100);
  v_after_payment_discount := GREATEST(0, v_base_after_coupon - v_payment_discount_amount);
  v_payment_surcharge_amount := v_after_payment_discount * (COALESCE(v_order.payment_surcharge_percentage, 0) / 100);
  v_total := GREATEST(0, v_after_payment_discount + v_payment_surcharge_amount);

  UPDATE public.orders o
     SET coupon_id = v_eval.coupon_id,
         coupon_code = v_eval.coupon_code,
         coupon_discount_type = v_eval.discount_type,
         coupon_discount_value = v_eval.discount_value,
         coupon_discount_amount = v_eval.discount_amount,
         payment_discount_percentage = v_payment_discount_pct_effective,
         discount_amount = GREATEST(0, v_eval.discount_amount + v_payment_discount_amount),
         total = v_total,
         updated_at = NOW()
   WHERE o.id = p_order_id;

  PERFORM public.reserve_coupon_usage_for_order(
    p_order_id,
    v_eval.coupon_id,
    p_store_id,
    p_profile_id,
    v_eval.coupon_code,
    v_eval.discount_type,
    v_eval.discount_value,
    v_eval.discount_amount
  );
END;
$$;

-- ==================== CLIENT CHECKOUT RPC OVERLOADS ====================

DROP FUNCTION IF EXISTS public.client_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.client_create_order_atomic(
  p_store_id UUID,
  p_profile_id UUID,
  p_payment_method_id UUID DEFAULT NULL,
  p_payment_condition_id UUID DEFAULT NULL,
  p_payment_rule_id UUID DEFAULT NULL,
  p_payment_method_condition_id UUID DEFAULT NULL,
  p_payment_method_code TEXT DEFAULT NULL,
  p_payment_method_name TEXT DEFAULT NULL,
  p_payment_condition_name TEXT DEFAULT NULL,
  p_payment_condition_description TEXT DEFAULT NULL,
  p_payment_installments INTEGER DEFAULT NULL,
  p_payment_discount_percentage NUMERIC DEFAULT NULL,
  p_payment_surcharge_percentage NUMERIC DEFAULT NULL,
  p_subtotal NUMERIC DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT NULL,
  p_total NUMERIC DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL,
  p_created_note TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS TABLE(order_id UUID, order_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created RECORD;
  v_coupon_code_normalized TEXT;
BEGIN
  SELECT *
    INTO v_created
    FROM public.client_create_order_atomic(
      p_store_id,
      p_profile_id,
      p_payment_method_id,
      p_payment_condition_id,
      p_payment_rule_id,
      p_payment_method_condition_id,
      p_payment_method_code,
      p_payment_method_name,
      p_payment_condition_name,
      p_payment_condition_description,
      p_payment_installments,
      p_payment_discount_percentage,
      p_payment_surcharge_percentage,
      p_subtotal,
      p_discount_amount,
      p_total,
      p_shipping_address,
      p_notes,
      p_items,
      p_created_note
    )
   LIMIT 1;

  IF v_created.order_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar pedido atomico.';
  END IF;

  v_coupon_code_normalized := public.normalize_coupon_code_input(p_coupon_code);
  IF v_coupon_code_normalized <> '' THEN
    PERFORM public.apply_coupon_to_order_snapshot(
      v_created.order_id,
      p_store_id,
      p_profile_id,
      v_coupon_code_normalized
    );
  END IF;

  RETURN QUERY
  SELECT v_created.order_id, v_created.order_number;
END;
$$;

DROP FUNCTION IF EXISTS public.client_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.client_create_order_atomic_v2(
  p_store_id UUID,
  p_profile_id UUID,
  p_payment_method_id UUID DEFAULT NULL,
  p_payment_condition_id UUID DEFAULT NULL,
  p_payment_rule_id UUID DEFAULT NULL,
  p_payment_method_condition_id UUID DEFAULT NULL,
  p_payment_method_code TEXT DEFAULT NULL,
  p_payment_method_name TEXT DEFAULT NULL,
  p_payment_condition_name TEXT DEFAULT NULL,
  p_payment_condition_description TEXT DEFAULT NULL,
  p_payment_installments INTEGER DEFAULT NULL,
  p_payment_discount_percentage NUMERIC DEFAULT NULL,
  p_payment_surcharge_percentage NUMERIC DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL,
  p_created_note TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS TABLE(order_id UUID, order_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created RECORD;
  v_coupon_code_normalized TEXT;
BEGIN
  SELECT *
    INTO v_created
    FROM public.client_create_order_atomic_v2(
      p_store_id,
      p_profile_id,
      p_payment_method_id,
      p_payment_condition_id,
      p_payment_rule_id,
      p_payment_method_condition_id,
      p_payment_method_code,
      p_payment_method_name,
      p_payment_condition_name,
      p_payment_condition_description,
      p_payment_installments,
      p_payment_discount_percentage,
      p_payment_surcharge_percentage,
      p_shipping_address,
      p_notes,
      p_items,
      p_created_note
    )
   LIMIT 1;

  IF v_created.order_id IS NULL THEN
    RAISE EXCEPTION 'Falha ao criar pedido atomico v2.';
  END IF;

  v_coupon_code_normalized := public.normalize_coupon_code_input(p_coupon_code);
  IF v_coupon_code_normalized <> '' THEN
    PERFORM public.apply_coupon_to_order_snapshot(
      v_created.order_id,
      p_store_id,
      p_profile_id,
      v_coupon_code_normalized
    );
  END IF;

  RETURN QUERY
  SELECT v_created.order_id, v_created.order_number;
END;
$$;

-- ==================== PRIVILEGES ====================

REVOKE ALL ON FUNCTION public.validate_coupon_for_checkout(TEXT, UUID, UUID, JSONB, NUMERIC, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_coupon_usage_for_order(UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_coupon_usage_for_order(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_coupon(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID[], UUID[], UUID[], UUID[], UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_preview_coupon_for_order(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_coupon_to_order_snapshot(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_create_order_atomic(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_create_order_atomic_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_coupon_for_checkout(TEXT, UUID, UUID, JSONB, NUMERIC, UUID, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_coupon_usage_for_order(UUID, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon_usage_for_order(UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_coupon(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID[], UUID[], UUID[], UUID[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_preview_coupon_for_order(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_coupon_to_order_snapshot(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_create_order_atomic(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_create_order_atomic_v2(UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;

