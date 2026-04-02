-- ============================================================
-- Migration 063: Hotfix row assignment in checkout_resolve_item_snapshot_v2
-- Context:
-- - Migration 062 typed v_size_option as product_size_options%ROWTYPE
-- - Selecting partial columns into ROWTYPE can misalign by column order
-- - This caused numeric cast errors such as:
--   "invalid input syntax for type numeric: \"t\""
-- ============================================================

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
  v_size_option public.product_size_options%ROWTYPE;
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
    SELECT so.*
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

  IF v_size_option.id IS NOT NULL AND v_size_option.price_mode = 'delta' THEN
    v_effective_base := GREATEST(0, v_standard_base + COALESCE(v_size_option.price_value, 0));
  END IF;

  IF v_size_option.id IS NOT NULL AND v_size_option.price_mode = 'absolute' THEN
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

GRANT EXECUTE ON FUNCTION public.checkout_resolve_item_snapshot_v2(UUID, UUID, INTEGER, UUID)
TO authenticated, service_role;
