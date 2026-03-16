-- ============================================================
-- Migration 013: Orders P0 - Atomicity, Security, Schema Drift
-- ============================================================

-- 1) Schema drift fix: orders.payment_rule_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'orders'
       AND column_name = 'payment_rule_id'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN payment_rule_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'price_table_payment_rules'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'orders_payment_rule_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_rule_id_fkey
      FOREIGN KEY (payment_rule_id)
      REFERENCES public.price_table_payment_rules(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_rule_id
  ON public.orders(payment_rule_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created_desc
  ON public.order_status_history(order_id, created_at DESC);

-- 2) Atomic client checkout write (order + items + status history)
CREATE OR REPLACE FUNCTION public.client_create_order_atomic(
  p_store_id UUID,
  p_profile_id UUID,
  p_payment_condition_id UUID,
  p_payment_rule_id UUID,
  p_subtotal NUMERIC,
  p_discount_amount NUMERIC,
  p_total NUMERIC,
  p_shipping_address TEXT,
  p_notes TEXT,
  p_items JSONB,
  p_created_note TEXT DEFAULT NULL
)
RETURNS TABLE(order_id UUID, order_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_store_owner UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_items_count INTEGER;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF p_store_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'store_id e profile_id sao obrigatorios.';
  END IF;

  IF p_subtotal IS NULL OR p_total IS NULL THEN
    RAISE EXCEPTION 'subtotal e total sao obrigatorios.';
  END IF;

  IF p_subtotal < 0 OR COALESCE(p_discount_amount, 0) < 0 OR p_total < 0 THEN
    RAISE EXCEPTION 'Valores monetarios nao podem ser negativos.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do pedido sao obrigatorios.';
  END IF;

  IF v_auth_user <> p_profile_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT profile_id
    INTO v_store_owner
    FROM public.stores
   WHERE id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Loja nao encontrada.';
  END IF;

  IF v_store_owner <> p_profile_id THEN
    RAISE EXCEPTION 'Loja nao pertence ao perfil informado.';
  END IF;

  INSERT INTO public.orders (
    store_id,
    profile_id,
    status,
    payment_status,
    payment_condition_id,
    payment_rule_id,
    subtotal,
    discount_amount,
    total,
    shipping_address,
    notes
  )
  VALUES (
    p_store_id,
    p_profile_id,
    'pending',
    'pending',
    p_payment_condition_id,
    p_payment_rule_id,
    p_subtotal,
    COALESCE(p_discount_amount, 0),
    p_total,
    p_shipping_address,
    p_notes
  )
  RETURNING id, order_number
    INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (
    order_id,
    product_variant_id,
    product_name,
    fabric_name,
    color_name,
    size,
    quantity,
    unit_price,
    product_price,
    variation_price,
    final_price,
    subtotal
  )
  SELECT
    v_order_id,
    item.product_variant_id,
    item.product_name,
    item.fabric_name,
    item.color_name,
    item.size,
    item.quantity,
    item.unit_price,
    item.product_price,
    item.variation_price,
    item.final_price,
    item.subtotal
  FROM jsonb_to_recordset(p_items) AS item(
    product_variant_id UUID,
    product_name TEXT,
    fabric_name TEXT,
    color_name TEXT,
    size TEXT,
    quantity INTEGER,
    unit_price NUMERIC,
    product_price NUMERIC,
    variation_price NUMERIC,
    final_price NUMERIC,
    subtotal NUMERIC
  );

  GET DIAGNOSTICS v_items_count = ROW_COUNT;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'Nenhum item valido foi inserido.';
  END IF;

  INSERT INTO public.order_status_history (
    order_id,
    status,
    notes,
    changed_by
  )
  VALUES (
    v_order_id,
    'pending',
    COALESCE(NULLIF(TRIM(COALESCE(p_created_note, '')), ''), 'Pedido criado via checkout.'),
    p_profile_id
  );

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.client_create_order_atomic(
  UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.client_create_order_atomic(
  UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT
) TO authenticated, service_role;

-- 3) Atomic and secure admin delete (with DB-level admin guard)
CREATE OR REPLACE FUNCTION public.admin_delete_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_deleted_order UUID;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
  END IF;

  DELETE FROM public.orders
   WHERE id = p_order_id
   RETURNING id INTO v_deleted_order;

  IF v_deleted_order IS NULL THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(UUID) TO authenticated, service_role;
