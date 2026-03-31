-- ============================================================
-- Migration 055: Checkout v2 canonical integrity + fabrics/colors enterprise hardening
-- ============================================================

-- -----------------------------
-- Fabrics/Colors observability
-- -----------------------------
ALTER TABLE public.fabrics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.fabric_colors
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS update_fabrics_updated_at ON public.fabrics;
CREATE TRIGGER update_fabrics_updated_at
  BEFORE UPDATE ON public.fabrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_fabric_colors_updated_at ON public.fabric_colors;
CREATE TRIGGER update_fabric_colors_updated_at
  BEFORE UPDATE ON public.fabric_colors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_product_variants_fabric_color_id
  ON public.product_variants(fabric_color_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_active_color
  ON public.product_variants(product_id, is_active, fabric_color_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_fabric_active_product
  ON public.product_variants(fabric_id, is_active, product_id);

CREATE INDEX IF NOT EXISTS idx_fabrics_active_sort
  ON public.fabrics(is_active, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_fabric_colors_fabric_active_sort
  ON public.fabric_colors(fabric_id, is_active, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_product_size_options_product_slug_active
  ON public.product_size_options(product_id, slug, is_active);

CREATE TABLE IF NOT EXISTS public.admin_fabric_actions_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
  fabric_color_id UUID REFERENCES public.fabric_colors(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_fabric_actions_audit_created_at
  ON public.admin_fabric_actions_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_fabric_actions_audit_action
  ON public.admin_fabric_actions_audit(action);

ALTER TABLE public.admin_fabric_actions_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'admin_fabric_actions_audit'
       AND policyname = 'Admins can read fabric actions audit'
  ) THEN
    CREATE POLICY "Admins can read fabric actions audit"
      ON public.admin_fabric_actions_audit
      FOR SELECT
      USING (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'admin_fabric_actions_audit'
       AND policyname = 'Admins can insert fabric actions audit'
  ) THEN
    CREATE POLICY "Admins can insert fabric actions audit"
      ON public.admin_fabric_actions_audit
      FOR INSERT
      WITH CHECK (public.is_admin());
  END IF;
END $$;

GRANT SELECT, INSERT ON TABLE public.admin_fabric_actions_audit TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_fabric_color_usage_counts()
RETURNS TABLE(
  fabric_id UUID,
  fabric_color_id UUID,
  variant_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  RETURN QUERY
  SELECT
    pv.fabric_id,
    pv.fabric_color_id,
    COUNT(*)::BIGINT AS variant_count
  FROM public.product_variants AS pv
  GROUP BY pv.fabric_id, pv.fabric_color_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_fabric_color_usage_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_fabric_color_usage_counts() TO authenticated, service_role;

-- -----------------------------
-- Checkout v2 shared helpers
-- -----------------------------
CREATE OR REPLACE FUNCTION public.resolve_effective_price_table_for_store(
  p_store_id UUID,
  p_preferred_price_table_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override_price_table_id UUID;
  v_store_assignment_price_table_id UUID;
  v_default_price_table_id UUID;
  v_candidate UUID;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT scs.override_price_table_id
    INTO v_override_price_table_id
    FROM public.store_commercial_settings AS scs
   WHERE scs.store_id = p_store_id
   LIMIT 1;

  SELECT spt.price_table_id
    INTO v_store_assignment_price_table_id
    FROM public.store_price_tables AS spt
   WHERE spt.store_id = p_store_id
   ORDER BY spt.created_at DESC
   LIMIT 1;

  SELECT pt.id
    INTO v_default_price_table_id
    FROM public.price_tables AS pt
   WHERE pt.is_default = true
   ORDER BY pt.created_at DESC
   LIMIT 1;

  FOR v_candidate IN
    SELECT c.candidate_id
      FROM (
        SELECT
          candidate_id,
          MIN(priority) AS priority
        FROM (
          VALUES
            (p_preferred_price_table_id, 1),
            (v_override_price_table_id, 2),
            (v_store_assignment_price_table_id, 3),
            (v_default_price_table_id, 4)
        ) AS raw(candidate_id, priority)
        WHERE candidate_id IS NOT NULL
        GROUP BY candidate_id
      ) AS c
     ORDER BY c.priority
  LOOP
    IF EXISTS (
      SELECT 1
        FROM public.price_tables AS pt
       WHERE pt.id = v_candidate
         AND pt.is_active = true
         AND (pt.valid_from IS NULL OR NOW() >= pt.valid_from)
         AND (pt.valid_until IS NULL OR NOW() <= pt.valid_until)
    ) THEN
      RETURN v_candidate;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_checkout_payment_selection_v2(
  p_subtotal NUMERIC,
  p_effective_price_table_id UUID,
  p_payment_method_id UUID DEFAULT NULL,
  p_payment_condition_id UUID DEFAULT NULL,
  p_payment_rule_id UUID DEFAULT NULL,
  p_payment_method_condition_id UUID DEFAULT NULL
)
RETURNS TABLE(
  payment_method_id UUID,
  payment_condition_id UUID,
  payment_rule_id UUID,
  payment_method_condition_id UUID,
  payment_method_code TEXT,
  payment_method_name TEXT,
  payment_condition_name TEXT,
  payment_condition_description TEXT,
  payment_installments INTEGER,
  payment_discount_percentage NUMERIC,
  payment_surcharge_percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_link RECORD;
  v_condition RECORD;
BEGIN
  IF p_subtotal IS NULL OR p_subtotal < 0 THEN
    RAISE EXCEPTION 'Subtotal invalido para resolver pagamento.';
  END IF;

  IF p_payment_rule_id IS NOT NULL THEN
    SELECT
      r.id,
      r.price_table_id,
      r.payment_method_condition_id,
      r.number_of_installments,
      COALESCE(r.discount_percentage, 0) AS discount_percentage,
      COALESCE(r.surcharge_percentage, 0) AS surcharge_percentage,
      r.min_order_value,
      r.max_order_value,
      pmc.id AS resolved_payment_method_condition_id,
      pmc.payment_method_id AS resolved_payment_method_id,
      pmc.payment_condition_id AS resolved_payment_condition_id,
      pm.code AS resolved_payment_method_code,
      pm.name AS resolved_payment_method_name,
      pc.name AS resolved_payment_condition_name,
      pc.description AS resolved_payment_condition_description,
      pc.installments AS resolved_payment_installments
    INTO v_rule
    FROM public.price_table_payment_rules AS r
    LEFT JOIN public.payment_method_conditions AS pmc
      ON pmc.id = r.payment_method_condition_id
     AND pmc.is_active = true
    LEFT JOIN public.payment_methods AS pm
      ON pm.id = pmc.payment_method_id
     AND pm.is_active = true
    LEFT JOIN public.payment_conditions AS pc
      ON pc.id = pmc.payment_condition_id
     AND pc.is_active = true
    WHERE r.id = p_payment_rule_id
      AND COALESCE(r.is_active, true) = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Regra de pagamento nao encontrada.';
    END IF;

    IF p_effective_price_table_id IS NULL THEN
      RAISE EXCEPTION 'Regra de pagamento exige tabela de preco ativa para o cliente.';
    END IF;

    IF v_rule.price_table_id <> p_effective_price_table_id THEN
      RAISE EXCEPTION 'A regra selecionada nao pertence a tabela ativa do cliente.';
    END IF;

    IF p_subtotal < COALESCE(v_rule.min_order_value, 0)
       OR (v_rule.max_order_value IS NOT NULL AND p_subtotal > v_rule.max_order_value) THEN
      RAISE EXCEPTION 'O valor do pedido nao e mais valido para esta regra comercial.';
    END IF;

    IF v_rule.payment_method_condition_id IS NOT NULL
       AND v_rule.resolved_payment_method_condition_id IS NULL THEN
      RAISE EXCEPTION 'O vinculo de pagamento da regra comercial esta inativo.';
    END IF;

    IF p_payment_method_condition_id IS NOT NULL
       AND v_rule.resolved_payment_method_condition_id IS NOT NULL
       AND p_payment_method_condition_id <> v_rule.resolved_payment_method_condition_id THEN
      RAISE EXCEPTION 'A regra de pagamento nao corresponde ao vinculo selecionado.';
    END IF;

    IF p_payment_method_id IS NOT NULL
       AND v_rule.resolved_payment_method_id IS NOT NULL
       AND p_payment_method_id <> v_rule.resolved_payment_method_id THEN
      RAISE EXCEPTION 'A regra de pagamento nao corresponde ao meio selecionado.';
    END IF;

    IF p_payment_condition_id IS NOT NULL
       AND v_rule.resolved_payment_condition_id IS NOT NULL
       AND p_payment_condition_id <> v_rule.resolved_payment_condition_id THEN
      RAISE EXCEPTION 'A regra de pagamento nao corresponde a condicao selecionada.';
    END IF;

    RETURN QUERY
    SELECT
      COALESCE(v_rule.resolved_payment_method_id, p_payment_method_id),
      COALESCE(v_rule.resolved_payment_condition_id, p_payment_condition_id),
      v_rule.id,
      COALESCE(v_rule.resolved_payment_method_condition_id, p_payment_method_condition_id),
      v_rule.resolved_payment_method_code,
      COALESCE(v_rule.resolved_payment_method_name, 'Regra comercial'),
      COALESCE(
        v_rule.resolved_payment_condition_name,
        CASE
          WHEN COALESCE(v_rule.number_of_installments, 1) > 1
            THEN v_rule.number_of_installments::TEXT || ' parcelas'
          ELSE 'A vista comercial'
        END
      ),
      COALESCE(
        v_rule.resolved_payment_condition_description,
        CASE
          WHEN COALESCE(v_rule.number_of_installments, 1) > 1
            THEN 'Condicao comercial definida por regra de tabela.'
          ELSE 'Condicao comercial definida por regra de tabela.'
        END
      ),
      COALESCE(v_rule.number_of_installments, v_rule.resolved_payment_installments, 1),
      COALESCE(v_rule.discount_percentage, 0),
      COALESCE(v_rule.surcharge_percentage, 0);

    RETURN;
  END IF;
  IF p_payment_method_condition_id IS NOT NULL THEN
    SELECT
      pmc.id,
      pmc.payment_method_id,
      pmc.payment_condition_id,
      pm.code AS payment_method_code,
      pm.name AS payment_method_name,
      pc.name AS payment_condition_name,
      pc.description AS payment_condition_description,
      pc.installments AS payment_installments,
      COALESCE(pc.discount_percentage, 0) AS payment_discount_percentage,
      COALESCE(pc.surcharge_percentage, 0) AS payment_surcharge_percentage,
      pc.min_order_value,
      pc.max_order_value
    INTO v_link
    FROM public.payment_method_conditions AS pmc
    JOIN public.payment_methods AS pm
      ON pm.id = pmc.payment_method_id
    JOIN public.payment_conditions AS pc
      ON pc.id = pmc.payment_condition_id
    WHERE pmc.id = p_payment_method_condition_id
      AND pmc.is_active = true
      AND pm.is_active = true
      AND pc.is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vinculo entre meio e condicao de pagamento nao encontrado.';
    END IF;

    IF p_payment_method_id IS NOT NULL AND p_payment_method_id <> v_link.payment_method_id THEN
      RAISE EXCEPTION 'payment_method_id nao corresponde ao vinculo informado.';
    END IF;

    IF p_payment_condition_id IS NOT NULL AND p_payment_condition_id <> v_link.payment_condition_id THEN
      RAISE EXCEPTION 'payment_condition_id nao corresponde ao vinculo informado.';
    END IF;

    IF p_subtotal < COALESCE(v_link.min_order_value, 0)
       OR (v_link.max_order_value IS NOT NULL AND p_subtotal > v_link.max_order_value) THEN
      RAISE EXCEPTION 'O valor do pedido nao e mais valido para esta condicao de pagamento.';
    END IF;

    RETURN QUERY
    SELECT
      v_link.payment_method_id,
      v_link.payment_condition_id,
      NULL::UUID,
      v_link.id,
      v_link.payment_method_code,
      v_link.payment_method_name,
      v_link.payment_condition_name,
      v_link.payment_condition_description,
      v_link.payment_installments,
      v_link.payment_discount_percentage,
      v_link.payment_surcharge_percentage;

    RETURN;
  END IF;

  IF p_payment_condition_id IS NOT NULL THEN
    SELECT
      pc.id,
      pc.name,
      pc.description,
      pc.installments,
      COALESCE(pc.discount_percentage, 0) AS discount_percentage,
      COALESCE(pc.surcharge_percentage, 0) AS surcharge_percentage,
      pc.min_order_value,
      pc.max_order_value
    INTO v_condition
    FROM public.payment_conditions AS pc
    WHERE pc.id = p_payment_condition_id
      AND pc.is_active = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Condicao de pagamento nao encontrada.';
    END IF;

    IF p_subtotal < COALESCE(v_condition.min_order_value, 0)
       OR (v_condition.max_order_value IS NOT NULL AND p_subtotal > v_condition.max_order_value) THEN
      RAISE EXCEPTION 'O valor do pedido nao e mais valido para esta condicao de pagamento.';
    END IF;

    RETURN QUERY
    SELECT
      NULL::UUID,
      v_condition.id,
      NULL::UUID,
      NULL::UUID,
      NULL::TEXT,
      'Nao informado'::TEXT,
      v_condition.name,
      v_condition.description,
      v_condition.installments,
      v_condition.discount_percentage,
      v_condition.surcharge_percentage;

    RETURN;
  END IF;

  RAISE EXCEPTION 'Selecao de pagamento obrigatoria.';
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_resolve_item_snapshot_v2(
  p_variant_id UUID,
  p_size_option_id UUID DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1,
  p_effective_price_table_id UUID DEFAULT NULL
)
RETURNS TABLE(
  product_variant_id UUID,
  size_option_id UUID,
  product_name TEXT,
  fabric_name TEXT,
  color_name TEXT,
  size_name TEXT,
  quantity INTEGER,
  unit_price NUMERIC,
  product_price NUMERIC,
  size_price NUMERIC,
  variation_price NUMERIC,
  final_price NUMERIC,
  subtotal NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant RECORD;
  v_size_option RECORD;
  v_table_discount NUMERIC := 0;
  v_table_override NUMERIC := NULL;
  v_standard_base NUMERIC := 0;
  v_effective_base NUMERIC := 0;
  v_size_price_local NUMERIC := NULL;
  v_unit_price_local NUMERIC := 0;
BEGIN
  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'Item sem product_variant_id.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade invalida para a variante selecionada.';
  END IF;

  SELECT
    pv.id AS variant_id,
    pv.product_id,
    pv.is_active AS variant_active,
    pv.price_override,
    p.name AS product_name,
    p.base_price,
    p.size AS product_size,
    COALESCE(p.has_size_variants, false) AS has_size_variants,
    p.is_active AS product_active,
    f.name AS fabric_name,
    f.price_modifier,
    f.is_active AS fabric_active,
    fc.name AS color_name,
    fc.is_active AS color_active
  INTO v_variant
  FROM public.product_variants AS pv
  JOIN public.products AS p
    ON p.id = pv.product_id
  JOIN public.fabrics AS f
    ON f.id = pv.fabric_id
  JOIN public.fabric_colors AS fc
    ON fc.id = pv.fabric_color_id
  WHERE pv.id = p_variant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variante nao encontrada.';
  END IF;

  IF NOT (v_variant.variant_active AND v_variant.product_active AND v_variant.fabric_active AND v_variant.color_active) THEN
    RAISE EXCEPTION 'Variante indisponivel para checkout.';
  END IF;

  IF p_size_option_id IS NOT NULL THEN
    SELECT
      so.id,
      so.product_id,
      so.name,
      so.price_mode,
      so.price_value,
      so.is_active
    INTO v_size_option
    FROM public.product_size_options AS so
    WHERE so.id = p_size_option_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tamanho selecionado nao encontrado.';
    END IF;

    IF v_size_option.product_id <> v_variant.product_id THEN
      RAISE EXCEPTION 'Tamanho selecionado nao pertence ao produto da variante.';
    END IF;

    IF NOT v_size_option.is_active THEN
      RAISE EXCEPTION 'Tamanho selecionado esta inativo.';
    END IF;
  ELSE
    v_size_option := NULL;
  END IF;

  IF v_variant.has_size_variants AND p_size_option_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um tamanho valido para este produto.';
  END IF;

  IF p_effective_price_table_id IS NOT NULL THEN
    SELECT COALESCE(pt.discount_percentage, 0)
      INTO v_table_discount
      FROM public.price_tables AS pt
     WHERE pt.id = p_effective_price_table_id
     LIMIT 1;

    SELECT pti.custom_price
      INTO v_table_override
      FROM public.price_table_items AS pti
     WHERE pti.price_table_id = p_effective_price_table_id
       AND pti.product_variant_id = p_variant_id
     LIMIT 1;
  END IF;

  v_standard_base := GREATEST(0, COALESCE(v_variant.base_price, 0) + COALESCE(v_variant.price_modifier, 0));
  v_effective_base := v_standard_base;
  v_size_price_local := NULL;

  IF v_size_option IS NOT NULL AND v_size_option.price_mode = 'delta' THEN
    v_effective_base := GREATEST(0, v_standard_base + COALESCE(v_size_option.price_value, 0));
  END IF;

  IF v_size_option IS NOT NULL AND v_size_option.price_mode = 'absolute' THEN
    v_size_price_local := GREATEST(0, COALESCE(v_size_option.price_value, 0) + COALESCE(v_variant.price_modifier, 0));
  END IF;

  IF v_variant.price_override IS NOT NULL THEN
    v_unit_price_local := v_variant.price_override;
  ELSIF v_size_price_local IS NOT NULL THEN
    v_unit_price_local := v_size_price_local;
  ELSIF v_table_override IS NOT NULL THEN
    v_unit_price_local := v_table_override;
  ELSIF COALESCE(v_table_discount, 0) > 0 THEN
    v_unit_price_local := v_effective_base * (1 - (v_table_discount / 100));
  ELSE
    v_unit_price_local := v_effective_base;
  END IF;

  RETURN QUERY
  SELECT
    p_variant_id,
    p_size_option_id,
    v_variant.product_name::TEXT,
    v_variant.fabric_name::TEXT,
    v_variant.color_name::TEXT,
    COALESCE(v_size_option.name::TEXT, v_variant.product_size::TEXT),
    p_quantity,
    v_unit_price_local,
    COALESCE(v_variant.base_price, 0),
    v_size_price_local,
    v_variant.price_override,
    v_unit_price_local,
    (v_unit_price_local * p_quantity);
END;
$$;

-- -----------------------------
-- Client checkout atomic v2
-- -----------------------------
DROP FUNCTION IF EXISTS public.client_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT
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
  v_payment_discount_amount NUMERIC := 0;
  v_after_payment_discount NUMERIC := 0;
  v_payment_surcharge_amount NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF p_store_id IS NULL OR p_profile_id IS NULL THEN
    RAISE EXCEPTION 'store_id e profile_id sao obrigatorios.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens do pedido sao obrigatorios.';
  END IF;

  IF v_auth_user <> p_profile_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT s.profile_id
    INTO v_store_owner
    FROM public.stores AS s
   WHERE s.id = p_store_id
   FOR UPDATE;

  IF v_store_owner IS NULL THEN
    RAISE EXCEPTION 'Loja nao encontrada.';
  END IF;

  IF v_store_owner <> p_profile_id THEN
    RAISE EXCEPTION 'Loja nao pertence ao perfil informado.';
  END IF;

  v_effective_price_table_id := public.resolve_effective_price_table_for_store(p_store_id, NULL);

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

  v_payment_discount_amount := v_subtotal * (COALESCE(v_payment.payment_discount_percentage, 0) / 100);
  v_after_payment_discount := GREATEST(0, v_subtotal - v_payment_discount_amount);
  v_payment_surcharge_amount := v_after_payment_discount * (COALESCE(v_payment.payment_surcharge_percentage, 0) / 100);
  v_total := GREATEST(0, v_after_payment_discount + v_payment_surcharge_amount);

  RETURN QUERY
  SELECT *
    FROM public.client_create_order_atomic(
      p_store_id,
      p_profile_id,
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
      v_total,
      p_shipping_address,
      p_notes,
      v_items_snapshot,
      p_created_note
    );
END;
$$;

REVOKE ALL ON FUNCTION public.client_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.client_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, JSONB, TEXT
) TO authenticated, service_role;

-- -----------------------------
-- Representative checkout atomic v2
-- -----------------------------
DROP FUNCTION IF EXISTS public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
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
  p_source_quote_id UUID DEFAULT NULL
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
      p_source_quote_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.representative_create_order_atomic_v2(
  UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, UUID
) TO authenticated, service_role;
