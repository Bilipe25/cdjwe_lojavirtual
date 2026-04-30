-- ============================================================
-- Migration 122: Order type for pre-sale and ready delivery
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type TEXT;

UPDATE public.orders
   SET order_type = 'PRE_VENDA'
 WHERE order_type IS NULL
    OR BTRIM(order_type) = ''
    OR order_type NOT IN ('PRE_VENDA', 'PRONTA_ENTREGA');

ALTER TABLE public.orders
  ALTER COLUMN order_type SET DEFAULT 'PRE_VENDA',
  ALTER COLUMN order_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_type_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_type_check
      CHECK (order_type IN ('PRE_VENDA', 'PRONTA_ENTREGA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON public.orders(order_type);

COMMENT ON COLUMN public.orders.order_type IS
  'Commercial delivery flow: PRE_VENDA requires delivery address for new writes; PRONTA_ENTREGA allows orders without delivery address.';

CREATE OR REPLACE FUNCTION public.enforce_order_type_delivery_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.order_type := COALESCE(NULLIF(UPPER(BTRIM(COALESCE(NEW.order_type, ''))), ''), 'PRE_VENDA');

  IF NEW.order_type NOT IN ('PRE_VENDA', 'PRONTA_ENTREGA') THEN
    RAISE EXCEPTION 'Tipo de pedido invalido.';
  END IF;

  IF NEW.order_type = 'PRE_VENDA'
     AND NEW.shipping_address_id IS NULL
     AND NULLIF(BTRIM(COALESCE(NEW.shipping_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Pedidos pre-venda exigem endereco de entrega.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_type_delivery_address ON public.orders;
CREATE TRIGGER trg_enforce_order_type_delivery_address
  BEFORE INSERT OR UPDATE OF order_type, shipping_address, shipping_address_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_type_delivery_address();

-- -----------------------------
-- Representative checkout atomic
-- -----------------------------
DROP FUNCTION IF EXISTS public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
);

DROP FUNCTION IF EXISTS public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
);

DROP FUNCTION IF EXISTS public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
);

DROP FUNCTION IF EXISTS public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.representative_create_order_atomic(
  p_store_id UUID,
  p_price_table_id UUID DEFAULT NULL,
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
  p_payment_discount_amount NUMERIC DEFAULT NULL,
  p_negotiation_discount_percentage NUMERIC DEFAULT NULL,
  p_negotiation_discount_amount NUMERIC DEFAULT NULL,
  p_negotiation_surcharge_amount NUMERIC DEFAULT NULL,
  p_total NUMERIC DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_negotiation_reason TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL,
  p_created_note TEXT DEFAULT NULL,
  p_source_quote_id UUID DEFAULT NULL,
  p_order_type TEXT DEFAULT 'PRE_VENDA'
)
RETURNS TABLE(order_id UUID, order_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_actor_role TEXT;
  v_actor_status TEXT;
  v_store_owner UUID;
  v_store_representative UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_items_count INTEGER;
  v_rule_payment_method_condition_id UUID;
  v_linked_payment_method_id UUID;
  v_linked_payment_condition_id UUID;
  v_linked_payment_method_code TEXT;
  v_linked_payment_method_name TEXT;
  v_linked_payment_condition_name TEXT;
  v_linked_payment_condition_description TEXT;
  v_linked_payment_installments INTEGER;
  v_order_type TEXT;
BEGIN
  v_auth_user := auth.uid();
  v_order_type := COALESCE(NULLIF(UPPER(BTRIM(COALESCE(p_order_type, ''))), ''), 'PRE_VENDA');

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF v_order_type NOT IN ('PRE_VENDA', 'PRONTA_ENTREGA') THEN
    RAISE EXCEPTION 'Tipo de pedido invalido.';
  END IF;

  IF v_order_type = 'PRE_VENDA'
     AND NULLIF(BTRIM(COALESCE(p_shipping_address, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Pedidos pre-venda exigem endereco de entrega.';
  END IF;

  SELECT p.role, p.status
    INTO v_actor_role, v_actor_status
    FROM public.profiles AS p
   WHERE p.id = v_auth_user;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'representative') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF v_actor_role = 'representative' AND v_actor_status <> 'approved' THEN
    RAISE EXCEPTION 'Representante sem aprovacao para operar.';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Cliente obrigatorio.';
  END IF;

  IF p_subtotal IS NULL OR p_total IS NULL THEN
    RAISE EXCEPTION 'Subtotal e total sao obrigatorios.';
  END IF;

  IF p_subtotal < 0
     OR COALESCE(p_payment_discount_amount, 0) < 0
     OR COALESCE(p_negotiation_discount_percentage, 0) < 0
     OR COALESCE(p_negotiation_discount_amount, 0) < 0
     OR COALESCE(p_negotiation_surcharge_amount, 0) < 0
     OR p_total < 0 THEN
    RAISE EXCEPTION 'Valores monetarios nao podem ser negativos.';
  END IF;

  IF COALESCE(p_payment_discount_percentage, 0) < 0 OR COALESCE(p_payment_surcharge_percentage, 0) < 0 THEN
    RAISE EXCEPTION 'Percentuais de pagamento nao podem ser negativos.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do pedido sao obrigatorios.';
  END IF;

  SELECT s.profile_id, s.representative_id
    INTO v_store_owner, v_store_representative
    FROM public.stores AS s
   WHERE s.id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  IF v_actor_role = 'representative' AND v_store_representative <> v_auth_user THEN
    RAISE EXCEPTION 'Este cliente nao esta vinculado ao representante autenticado.';
  END IF;

  IF p_payment_rule_id IS NOT NULL THEN
    SELECT r.payment_method_condition_id
      INTO v_rule_payment_method_condition_id
      FROM public.price_table_payment_rules AS r
     WHERE r.id = p_payment_rule_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Regra de pagamento nao encontrada.';
    END IF;

    IF p_payment_method_condition_id IS NOT NULL
       AND v_rule_payment_method_condition_id IS NOT NULL
       AND p_payment_method_condition_id <> v_rule_payment_method_condition_id THEN
      RAISE EXCEPTION 'A regra de pagamento nao corresponde ao meio/condicao selecionado.';
    END IF;
  END IF;

  IF p_payment_method_condition_id IS NOT NULL THEN
    SELECT
      pmc.payment_method_id,
      pmc.payment_condition_id,
      pm.code,
      pm.name,
      pc.name,
      pc.description,
      pc.installments
      INTO
        v_linked_payment_method_id,
        v_linked_payment_condition_id,
        v_linked_payment_method_code,
        v_linked_payment_method_name,
        v_linked_payment_condition_name,
        v_linked_payment_condition_description,
        v_linked_payment_installments
    FROM public.payment_method_conditions AS pmc
    JOIN public.payment_methods AS pm
      ON pm.id = pmc.payment_method_id
    JOIN public.payment_conditions AS pc
      ON pc.id = pmc.payment_condition_id
   WHERE pmc.id = p_payment_method_condition_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vinculo entre meio e condicao de pagamento nao encontrado.';
    END IF;

    IF p_payment_method_id IS NOT NULL AND p_payment_method_id <> v_linked_payment_method_id THEN
      RAISE EXCEPTION 'payment_method_id nao corresponde ao vinculo informado.';
    END IF;

    IF p_payment_condition_id IS NOT NULL AND p_payment_condition_id <> v_linked_payment_condition_id THEN
      RAISE EXCEPTION 'payment_condition_id nao corresponde ao vinculo informado.';
    END IF;

    p_payment_method_id := COALESCE(p_payment_method_id, v_linked_payment_method_id);
    p_payment_condition_id := COALESCE(p_payment_condition_id, v_linked_payment_condition_id);
    p_payment_method_code := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_code, '')), ''), v_linked_payment_method_code);
    p_payment_method_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''), v_linked_payment_method_name);
    p_payment_condition_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''), v_linked_payment_condition_name);
    p_payment_condition_description := COALESCE(p_payment_condition_description, v_linked_payment_condition_description);
    p_payment_installments := COALESCE(p_payment_installments, v_linked_payment_installments);
  ELSE
    IF p_payment_method_id IS NOT NULL THEN
      SELECT pm.code, pm.name
        INTO v_linked_payment_method_code, v_linked_payment_method_name
        FROM public.payment_methods AS pm
       WHERE pm.id = p_payment_method_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Meio de pagamento nao encontrado.';
      END IF;

      p_payment_method_code := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_code, '')), ''), v_linked_payment_method_code);
      p_payment_method_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''), v_linked_payment_method_name);
    END IF;

    IF p_payment_condition_id IS NOT NULL THEN
      SELECT pc.name, pc.description, pc.installments
        INTO v_linked_payment_condition_name, v_linked_payment_condition_description, v_linked_payment_installments
        FROM public.payment_conditions AS pc
       WHERE pc.id = p_payment_condition_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Condicao de pagamento nao encontrada.';
      END IF;

      p_payment_condition_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''), v_linked_payment_condition_name);
      p_payment_condition_description := COALESCE(p_payment_condition_description, v_linked_payment_condition_description);
      p_payment_installments := COALESCE(p_payment_installments, v_linked_payment_installments);
    END IF;
  END IF;

  INSERT INTO public.orders AS o (
    store_id,
    profile_id,
    created_by_profile_id,
    sales_channel,
    order_type,
    status,
    payment_status,
    payment_method_id,
    payment_condition_id,
    payment_rule_id,
    payment_method_condition_id,
    payment_method_code,
    payment_method_name,
    payment_condition_name,
    payment_condition_description,
    payment_installments,
    payment_discount_percentage,
    payment_surcharge_percentage,
    negotiation_discount_percentage,
    negotiation_discount_amount,
    negotiation_surcharge_amount,
    subtotal,
    discount_amount,
    total,
    shipping_address,
    notes,
    negotiation_reason
  )
  VALUES (
    p_store_id,
    v_store_owner,
    v_auth_user,
    'representative',
    v_order_type,
    'pending',
    'pending',
    p_payment_method_id,
    p_payment_condition_id,
    p_payment_rule_id,
    p_payment_method_condition_id,
    NULLIF(TRIM(COALESCE(p_payment_method_code, '')), ''),
    NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_payment_condition_description, '')), ''),
    p_payment_installments,
    COALESCE(p_payment_discount_percentage, 0),
    COALESCE(p_payment_surcharge_percentage, 0),
    COALESCE(p_negotiation_discount_percentage, 0),
    COALESCE(p_negotiation_discount_amount, 0),
    COALESCE(p_negotiation_surcharge_amount, 0),
    p_subtotal,
    COALESCE(p_payment_discount_amount, 0) + COALESCE(p_negotiation_discount_amount, 0),
    p_total,
    CASE WHEN v_order_type = 'PRONTA_ENTREGA' THEN NULL ELSE p_shipping_address END,
    p_notes,
    p_negotiation_reason
  )
  RETURNING o.id, o.order_number
    INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (
    order_id,
    product_variant_id,
    size_option_id,
    product_name,
    fabric_name,
    color_name,
    size,
    size_name,
    quantity,
    unit_price,
    product_price,
    size_price,
    variation_price,
    final_price,
    subtotal
  )
  SELECT
    v_order_id,
    item.product_variant_id,
    item.size_option_id,
    item.product_name,
    item.fabric_name,
    item.color_name,
    item.size,
    COALESCE(item.size_name, item.size),
    item.quantity,
    item.unit_price,
    item.product_price,
    item.size_price,
    item.variation_price,
    item.final_price,
    item.subtotal
  FROM jsonb_to_recordset(p_items) AS item(
    product_variant_id UUID,
    size_option_id UUID,
    product_name TEXT,
    fabric_name TEXT,
    color_name TEXT,
    size TEXT,
    size_name TEXT,
    quantity INTEGER,
    unit_price NUMERIC,
    product_price NUMERIC,
    size_price NUMERIC,
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
    COALESCE(NULLIF(TRIM(COALESCE(p_created_note, '')), ''), 'Pedido criado pelo representante.'),
    v_auth_user
  );

  IF p_source_quote_id IS NOT NULL THEN
    UPDATE public.sales_quotes
       SET status = 'converted',
           converted_order_id = v_order_id,
           updated_at = NOW()
     WHERE id = p_source_quote_id;
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

-- -----------------------------
-- Representative checkout atomic v2
-- -----------------------------
DROP FUNCTION IF EXISTS public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
);

DROP FUNCTION IF EXISTS public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.representative_create_order_atomic_v2(
  p_store_id UUID,
  p_price_table_id UUID DEFAULT NULL,
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
  p_negotiation_discount_percentage NUMERIC DEFAULT NULL,
  p_negotiation_discount_amount NUMERIC DEFAULT NULL,
  p_negotiation_surcharge_amount NUMERIC DEFAULT NULL,
  p_shipping_address TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_negotiation_reason TEXT DEFAULT NULL,
  p_items JSONB DEFAULT NULL,
  p_created_note TEXT DEFAULT NULL,
  p_source_quote_id UUID DEFAULT NULL,
  p_order_type TEXT DEFAULT 'PRE_VENDA'
)
RETURNS TABLE(order_id UUID, order_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_actor_role TEXT;
  v_actor_status TEXT;
  v_store_owner UUID;
  v_store_representative UUID;
  v_rep_settings RECORD;
  v_allowed_price_tables UUID[];
  v_effective_price_table_id UUID;
  v_item JSONB;
  v_item_index INTEGER := 0;
  v_variant_id UUID;
  v_size_option_id UUID;
  v_quantity INTEGER;
  v_item_snapshot RECORD;
  v_items_snapshot JSONB := '[]'::jsonb;
  v_subtotal NUMERIC := 0;
  v_payment RECORD;
  v_negotiation_discount_amount NUMERIC := 0;
  v_negotiation_surcharge_amount NUMERIC := 0;
  v_effective_negotiation_discount_percentage NUMERIC := 0;
  v_adjusted_subtotal NUMERIC := 0;
  v_payment_discount_amount NUMERIC := 0;
  v_after_payment_discount NUMERIC := 0;
  v_payment_surcharge_amount NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  SELECT p.role, p.status
    INTO v_actor_role, v_actor_status
    FROM public.profiles AS p
   WHERE p.id = v_auth_user;

  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'representative') THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  IF v_actor_role = 'representative' AND v_actor_status <> 'approved' THEN
    RAISE EXCEPTION 'Representante sem aprovacao para operar.';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Cliente obrigatorio.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do pedido sao obrigatorios.';
  END IF;

  SELECT s.profile_id, s.representative_id
    INTO v_store_owner, v_store_representative
    FROM public.stores AS s
   WHERE s.id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  IF v_actor_role = 'representative' AND v_store_representative <> v_auth_user THEN
    RAISE EXCEPTION 'Este cliente nao esta vinculado ao representante autenticado.';
  END IF;

  v_effective_price_table_id := public.resolve_effective_price_table_for_store(p_store_id, p_price_table_id);

  IF v_actor_role = 'representative' THEN
    SELECT
      rcs.max_discount_percentage,
      rcs.allow_free_negotiation,
      rcs.can_override_price_table
    INTO v_rep_settings
    FROM public.representative_commercial_settings AS rcs
    WHERE rcs.profile_id = v_auth_user
    LIMIT 1;

    IF v_rep_settings.can_override_price_table = false AND p_price_table_id IS NOT NULL THEN
      RAISE EXCEPTION 'Este representante nao pode trocar manualmente a tabela de precos.';
    END IF;

    SELECT ARRAY_AGG(rpt.price_table_id)
      INTO v_allowed_price_tables
      FROM public.representative_price_tables AS rpt
     WHERE rpt.representative_id = v_auth_user;

    IF COALESCE(array_length(v_allowed_price_tables, 1), 0) > 0 THEN
      IF v_effective_price_table_id IS NULL OR NOT (v_effective_price_table_id = ANY(v_allowed_price_tables)) THEN
        RAISE EXCEPTION 'A tabela de preco selecionada nao esta permitida para este representante.';
      END IF;
    END IF;
  END IF;

  FOR v_item IN
    SELECT value
      FROM jsonb_array_elements(p_items)
  LOOP
    v_item_index := v_item_index + 1;

    BEGIN
      v_variant_id := NULLIF(TRIM(COALESCE(v_item->>'product_variant_id', '')), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item % com product_variant_id invalido.', v_item_index;
    END;

    BEGIN
      v_quantity := COALESCE(NULLIF(TRIM(COALESCE(v_item->>'quantity', '')), ''), '0')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Item % com quantity invalido.', v_item_index;
    END;

    IF NULLIF(TRIM(COALESCE(v_item->>'size_option_id', '')), '') IS NOT NULL THEN
      BEGIN
        v_size_option_id := NULLIF(TRIM(COALESCE(v_item->>'size_option_id', '')), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Item % com size_option_id invalido.', v_item_index;
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
        'size_option_id', v_item_snapshot.size_option_id,
        'product_name', v_item_snapshot.product_name,
        'fabric_name', v_item_snapshot.fabric_name,
        'color_name', v_item_snapshot.color_name,
        'size', v_item_snapshot.size_name,
        'size_name', v_item_snapshot.size_name,
        'quantity', v_item_snapshot.quantity,
        'unit_price', v_item_snapshot.unit_price,
        'product_price', v_item_snapshot.product_price,
        'size_price', v_item_snapshot.size_price,
        'variation_price', v_item_snapshot.variation_price,
        'final_price', v_item_snapshot.final_price,
        'subtotal', v_item_snapshot.subtotal
      )
    );
  END LOOP;

  IF v_item_index = 0 THEN
    RAISE EXCEPTION 'Nenhum item valido foi informado.';
  END IF;

  SELECT *
    INTO v_payment
    FROM public.resolve_checkout_payment_selection_v2(
      v_subtotal,
      v_effective_price_table_id,
      p_payment_method_id,
      p_payment_condition_id,
      p_payment_rule_id,
      p_payment_method_condition_id
    )
   LIMIT 1;

  v_negotiation_discount_amount := GREATEST(0, COALESCE(p_negotiation_discount_amount, 0));

  IF v_negotiation_discount_amount = 0 AND COALESCE(p_negotiation_discount_percentage, 0) > 0 THEN
    v_negotiation_discount_amount := v_subtotal * (LEAST(100, GREATEST(0, p_negotiation_discount_percentage)) / 100);
  END IF;

  v_negotiation_discount_amount := LEAST(v_subtotal, v_negotiation_discount_amount);
  v_negotiation_surcharge_amount := GREATEST(0, COALESCE(p_negotiation_surcharge_amount, 0));

  v_effective_negotiation_discount_percentage :=
    CASE
      WHEN v_subtotal > 0 THEN (v_negotiation_discount_amount / v_subtotal) * 100
      ELSE 0
    END;

  IF v_actor_role = 'representative' AND v_rep_settings.allow_free_negotiation = false
     AND (v_negotiation_discount_amount > 0 OR v_negotiation_surcharge_amount > 0) THEN
    RAISE EXCEPTION 'Este representante nao possui permissao para negociar desconto/acrescimo manual.';
  END IF;

  IF v_actor_role = 'representative'
     AND v_rep_settings.max_discount_percentage IS NOT NULL
     AND v_effective_negotiation_discount_percentage > (v_rep_settings.max_discount_percentage + 0.0001) THEN
    RAISE EXCEPTION 'Desconto acima do limite permitido para este representante.';
  END IF;

  v_adjusted_subtotal := GREATEST(0, v_subtotal - v_negotiation_discount_amount + v_negotiation_surcharge_amount);

  v_payment_discount_amount := v_adjusted_subtotal * (COALESCE(v_payment.payment_discount_percentage, 0) / 100);
  v_after_payment_discount := GREATEST(0, v_adjusted_subtotal - v_payment_discount_amount);
  v_payment_surcharge_amount := v_after_payment_discount * (COALESCE(v_payment.payment_surcharge_percentage, 0) / 100);
  v_total := GREATEST(0, v_after_payment_discount + v_payment_surcharge_amount);

  RETURN QUERY
  SELECT *
    FROM public.representative_create_order_atomic(
      p_store_id,
      v_effective_price_table_id,
      v_payment.payment_method_id,
      v_payment.payment_condition_id,
      v_payment.payment_rule_id,
      v_payment.payment_method_condition_id,
      v_payment.payment_method_code,
      v_payment.payment_method_name,
      v_payment.payment_condition_name,
      v_payment.payment_condition_description,
      v_payment.payment_installments,
      v_payment.payment_discount_percentage,
      v_payment.payment_surcharge_percentage,
      v_subtotal,
      v_payment_discount_amount,
      v_effective_negotiation_discount_percentage,
      v_negotiation_discount_amount,
      v_negotiation_surcharge_amount,
      v_total,
      p_shipping_address,
      p_notes,
      p_negotiation_reason,
      v_items_snapshot,
      p_created_note,
      p_source_quote_id,
      p_order_type
    );
END;
$$;

REVOKE ALL ON FUNCTION public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID, TEXT
) TO authenticated, service_role;
