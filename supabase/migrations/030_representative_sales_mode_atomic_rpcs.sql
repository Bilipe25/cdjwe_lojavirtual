-- ============================================================
-- Migration 030: Representative Sales Mode Atomic RPCs
-- ============================================================

DROP FUNCTION IF EXISTS public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
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
  p_source_quote_id UUID DEFAULT NULL
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
    p_shipping_address,
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

DROP FUNCTION IF EXISTS public.representative_create_quote_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT, JSONB, TEXT
);

CREATE OR REPLACE FUNCTION public.representative_create_quote_atomic(
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
  p_status TEXT DEFAULT 'draft'
)
RETURNS TABLE(quote_id UUID, quote_number TEXT)
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
  v_customer_name TEXT;
  v_customer_code TEXT;
  v_company_name TEXT;
  v_price_table_name TEXT;
  v_quote_id UUID;
  v_quote_number TEXT;
  v_items_count INTEGER;
  v_rule_payment_method_condition_id UUID;
  v_linked_payment_method_id UUID;
  v_linked_payment_condition_id UUID;
  v_linked_payment_method_code TEXT;
  v_linked_payment_method_name TEXT;
  v_linked_payment_condition_name TEXT;
  v_linked_payment_condition_description TEXT;
  v_linked_payment_installments INTEGER;
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

  IF p_status NOT IN ('draft', 'sent', 'approved', 'cancelled') THEN
    RAISE EXCEPTION 'Status de orcamento invalido.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do orcamento sao obrigatorios.';
  END IF;

  SELECT s.profile_id, s.representative_id, s.customer_code, s.company_name, p.full_name
    INTO v_store_owner, v_store_representative, v_customer_code, v_company_name, v_customer_name
    FROM public.stores AS s
    JOIN public.profiles AS p
      ON p.id = s.profile_id
   WHERE s.id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado.';
  END IF;

  IF v_actor_role = 'representative' AND v_store_representative <> v_auth_user THEN
    RAISE EXCEPTION 'Este cliente nao esta vinculado ao representante autenticado.';
  END IF;

  IF p_price_table_id IS NOT NULL THEN
    SELECT pt.name
      INTO v_price_table_name
      FROM public.price_tables AS pt
     WHERE pt.id = p_price_table_id;
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

    p_payment_method_id := COALESCE(p_payment_method_id, v_linked_payment_method_id);
    p_payment_condition_id := COALESCE(p_payment_condition_id, v_linked_payment_condition_id);
    p_payment_method_code := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_code, '')), ''), v_linked_payment_method_code);
    p_payment_method_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''), v_linked_payment_method_name);
    p_payment_condition_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''), v_linked_payment_condition_name);
    p_payment_condition_description := COALESCE(p_payment_condition_description, v_linked_payment_condition_description);
    p_payment_installments := COALESCE(p_payment_installments, v_linked_payment_installments);
  END IF;

  INSERT INTO public.sales_quotes AS q (
    store_id,
    customer_profile_id,
    representative_id,
    price_table_id,
    status,
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
    subtotal,
    payment_discount_amount,
    negotiation_discount_percentage,
    negotiation_discount_amount,
    negotiation_surcharge_amount,
    total,
    notes,
    shipping_address,
    negotiation_reason,
    customer_name_snapshot,
    customer_code_snapshot,
    company_name_snapshot,
    price_table_name_snapshot
  )
  VALUES (
    p_store_id,
    v_store_owner,
    v_auth_user,
    p_price_table_id,
    p_status,
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
    COALESCE(p_subtotal, 0),
    COALESCE(p_payment_discount_amount, 0),
    COALESCE(p_negotiation_discount_percentage, 0),
    COALESCE(p_negotiation_discount_amount, 0),
    COALESCE(p_negotiation_surcharge_amount, 0),
    COALESCE(p_total, 0),
    p_notes,
    p_shipping_address,
    p_negotiation_reason,
    v_customer_name,
    v_customer_code,
    v_company_name,
    v_price_table_name
  )
  RETURNING q.id, q.quote_number
    INTO v_quote_id, v_quote_number;

  INSERT INTO public.sales_quote_items (
    quote_id,
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
    v_quote_id,
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

  RETURN QUERY SELECT v_quote_id, v_quote_number;
END;
$$;

DROP FUNCTION IF EXISTS public.representative_convert_quote_to_order_atomic(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.representative_convert_quote_to_order_atomic(
  p_quote_id UUID,
  p_created_note TEXT DEFAULT NULL
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
  v_order_id UUID;
  v_order_number TEXT;
  v_quote public.sales_quotes%ROWTYPE;
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

  SELECT q.*
    INTO v_quote
    FROM public.sales_quotes AS q
   WHERE q.id = p_quote_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orcamento nao encontrado.';
  END IF;

  IF v_actor_role = 'representative' AND v_quote.representative_id <> v_auth_user THEN
    RAISE EXCEPTION 'Este orcamento nao pertence ao representante autenticado.';
  END IF;

  IF v_quote.status IN ('converted', 'cancelled') THEN
    RAISE EXCEPTION 'Este orcamento nao pode mais ser convertido.';
  END IF;

  INSERT INTO public.orders AS o (
    store_id,
    profile_id,
    created_by_profile_id,
    sales_channel,
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
    v_quote.store_id,
    v_quote.customer_profile_id,
    v_auth_user,
    'representative',
    'pending',
    'pending',
    v_quote.payment_method_id,
    v_quote.payment_condition_id,
    v_quote.payment_rule_id,
    v_quote.payment_method_condition_id,
    v_quote.payment_method_code,
    v_quote.payment_method_name,
    v_quote.payment_condition_name,
    v_quote.payment_condition_description,
    v_quote.payment_installments,
    v_quote.payment_discount_percentage,
    v_quote.payment_surcharge_percentage,
    v_quote.negotiation_discount_percentage,
    v_quote.negotiation_discount_amount,
    v_quote.negotiation_surcharge_amount,
    v_quote.subtotal,
    COALESCE(v_quote.payment_discount_amount, 0) + COALESCE(v_quote.negotiation_discount_amount, 0),
    v_quote.total,
    v_quote.shipping_address,
    v_quote.notes,
    v_quote.negotiation_reason
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
  FROM public.sales_quote_items AS item
  WHERE item.quote_id = p_quote_id;

  INSERT INTO public.order_status_history (
    order_id,
    status,
    notes,
    changed_by
  )
  VALUES (
    v_order_id,
    'pending',
    COALESCE(NULLIF(TRIM(COALESCE(p_created_note, '')), ''), 'Pedido gerado a partir de orcamento do representante.'),
    v_auth_user
  );

  UPDATE public.sales_quotes
     SET status = 'converted',
         converted_order_id = v_order_id,
         updated_at = NOW()
   WHERE id = p_quote_id;

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.representative_create_order_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_create_quote_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.representative_create_quote_atomic(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_convert_quote_to_order_atomic(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.representative_convert_quote_to_order_atomic(UUID, TEXT) TO authenticated, service_role;
