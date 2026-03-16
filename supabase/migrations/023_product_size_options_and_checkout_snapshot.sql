-- ============================================================
-- Migration 023: Product Size Options + Checkout Snapshot v2
-- ============================================================

-- 1) Products: feature flag for size variants
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_size_variants BOOLEAN NOT NULL DEFAULT false;

-- 2) Product size options (first-class variation)
CREATE TABLE IF NOT EXISTS public.product_size_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  price_mode TEXT NOT NULL DEFAULT 'delta' CHECK (price_mode IN ('absolute', 'delta')),
  price_value NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_size_options_product_slug_unique UNIQUE (product_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_size_options_product_id
  ON public.product_size_options(product_id);

CREATE INDEX IF NOT EXISTS idx_product_size_options_active_sort
  ON public.product_size_options(product_id, is_active, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_size_options_single_default
  ON public.product_size_options(product_id)
  WHERE is_default = true;

DROP TRIGGER IF EXISTS update_product_size_options_updated_at ON public.product_size_options;
CREATE TRIGGER update_product_size_options_updated_at
  BEFORE UPDATE ON public.product_size_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_size_options ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Approved users can view active product sizes'
      AND tablename = 'product_size_options'
  ) THEN
    CREATE POLICY "Approved users can view active product sizes"
      ON public.product_size_options
      FOR SELECT
      USING (
        is_active = true
        AND (
          public.is_admin()
          OR public.is_approved_client()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admins can manage product sizes'
      AND tablename = 'product_size_options'
  ) THEN
    CREATE POLICY "Admins can manage product sizes"
      ON public.product_size_options
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 3) Order snapshots: freeze size metadata at order time
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS size_option_id UUID,
  ADD COLUMN IF NOT EXISTS size_name TEXT,
  ADD COLUMN IF NOT EXISTS size_price NUMERIC(10,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_size_option_id_fkey'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_size_option_id_fkey
      FOREIGN KEY (size_option_id)
      REFERENCES public.product_size_options(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.order_items
SET size_name = COALESCE(size_name, size)
WHERE size_name IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_items_size_price_check'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_size_price_check
      CHECK (size_price IS NULL OR size_price >= 0);
  END IF;
END $$;

-- 4) Checkout atomic RPC now accepts size snapshot fields in p_items
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

-- 5) Admin product domain upsert now supports has_size_variants + size options sync
DROP FUNCTION IF EXISTS public.admin_upsert_product_domain(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  numeric,
  boolean,
  boolean,
  uuid[],
  jsonb
);

CREATE OR REPLACE FUNCTION public.admin_upsert_product_domain(
  p_product_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_size text DEFAULT NULL,
  p_has_size_variants boolean DEFAULT false,
  p_size_options jsonb DEFAULT NULL,
  p_base_price numeric DEFAULT 0,
  p_is_active boolean DEFAULT true,
  p_is_featured boolean DEFAULT false,
  p_active_variant_ids uuid[] DEFAULT NULL,
  p_variant_price_overrides jsonb DEFAULT NULL
)
RETURNS TABLE(product_id uuid, created boolean, variants_inserted integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_created boolean := false;
  v_variants_inserted integer := 0;
  v_override_key text;
  v_override_value text;
  v_variant_id uuid;
  v_price numeric;
  v_size_option jsonb;
  v_size_option_id uuid;
  v_size_option_name text;
  v_size_option_slug text;
  v_size_price_mode text;
  v_size_price_value numeric;
  v_size_is_active boolean;
  v_size_sort_order integer;
  v_size_is_default boolean;
  v_size_existing_id uuid;
  v_size_ids_to_keep uuid[] := ARRAY[]::uuid[];
  v_default_size_option_id uuid;
BEGIN
  IF NULLIF(trim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  IF NULLIF(trim(coalesce(p_slug, '')), '') IS NULL THEN
    RAISE EXCEPTION 'p_slug is required';
  END IF;

  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'p_category_id is required';
  END IF;

  IF p_base_price IS NULL OR p_base_price < 0 THEN
    RAISE EXCEPTION 'p_base_price must be >= 0';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      name,
      slug,
      description,
      category_id,
      size,
      has_size_variants,
      base_price,
      is_active,
      is_featured
    )
    VALUES (
      p_name,
      p_slug,
      p_description,
      p_category_id,
      p_size,
      COALESCE(p_has_size_variants, false),
      p_base_price,
      p_is_active,
      p_is_featured
    )
    RETURNING id INTO v_product_id;

    v_created := true;
  ELSE
    UPDATE public.products p
       SET name = p_name,
           slug = p_slug,
           description = p_description,
           category_id = p_category_id,
           size = p_size,
           has_size_variants = COALESCE(p_has_size_variants, false),
           base_price = p_base_price,
           is_active = p_is_active,
           is_featured = p_is_featured
     WHERE p.id = p_product_id
     RETURNING p.id INTO v_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product % not found', p_product_id;
    END IF;
  END IF;

  INSERT INTO public.product_variants (
    product_id,
    fabric_id,
    fabric_color_id,
    stock_quantity,
    is_active
  )
  SELECT
    v_product_id,
    fc.fabric_id,
    fc.id,
    999,
    coalesce(p_is_active, true) AND coalesce(fc.is_active, true)
  FROM public.fabric_colors fc
  WHERE NOT EXISTS (
    SELECT 1
      FROM public.product_variants pv
     WHERE pv.product_id = v_product_id
       AND pv.fabric_id = fc.fabric_id
       AND pv.fabric_color_id = fc.id
  );

  GET DIAGNOSTICS v_variants_inserted = ROW_COUNT;

  IF p_active_variant_ids IS NOT NULL THEN
    UPDATE public.product_variants pv
       SET is_active = (pv.id = ANY(p_active_variant_ids))
     WHERE pv.product_id = v_product_id;
  END IF;

  IF p_variant_price_overrides IS NOT NULL THEN
    FOR v_override_key, v_override_value IN
      SELECT key, value
      FROM jsonb_each_text(p_variant_price_overrides)
    LOOP
      BEGIN
        v_variant_id := v_override_key::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
      END;

      IF NULLIF(trim(coalesce(v_override_value, '')), '') IS NULL THEN
        v_price := NULL;
      ELSE
        BEGIN
          v_price := v_override_value::numeric;
        EXCEPTION WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'Invalid variant price for id %', v_override_key;
        END;

        IF v_price < 0 THEN
          RAISE EXCEPTION 'Variant price cannot be negative for id %', v_override_key;
        END IF;
      END IF;

      UPDATE public.product_variants pv
         SET price_override = v_price
       WHERE pv.id = v_variant_id
         AND pv.product_id = v_product_id;
    END LOOP;
  END IF;

  IF p_size_options IS NOT NULL THEN
    IF jsonb_typeof(p_size_options) <> 'array' THEN
      RAISE EXCEPTION 'p_size_options must be a JSON array';
    END IF;

    FOR v_size_option IN
      SELECT * FROM jsonb_array_elements(p_size_options)
    LOOP
      v_size_option_id := NULL;
      v_size_option_name := NULLIF(trim(coalesce(v_size_option->>'name', '')), '');
      v_size_option_slug := lower(NULLIF(trim(coalesce(v_size_option->>'slug', '')), ''));
      v_size_price_mode := lower(coalesce(v_size_option->>'price_mode', 'delta'));
      v_size_price_value := coalesce((v_size_option->>'price_value')::numeric, 0);
      v_size_is_active := coalesce((v_size_option->>'is_active')::boolean, true);
      v_size_sort_order := coalesce((v_size_option->>'sort_order')::integer, 0);
      v_size_is_default := coalesce((v_size_option->>'is_default')::boolean, false);

      IF v_size_option_name IS NULL THEN
        RAISE EXCEPTION 'Size option name is required';
      END IF;

      IF v_size_option_slug IS NULL THEN
        v_size_option_slug := lower(regexp_replace(v_size_option_name, '[^a-zA-Z0-9]+', '-', 'g'));
      END IF;
      v_size_option_slug := trim(both '-' FROM v_size_option_slug);

      IF v_size_option_slug IS NULL OR v_size_option_slug = '' THEN
        RAISE EXCEPTION 'Invalid size option slug for %', v_size_option_name;
      END IF;

      IF v_size_price_mode NOT IN ('absolute', 'delta') THEN
        RAISE EXCEPTION 'Invalid size price mode for %', v_size_option_name;
      END IF;

      IF v_size_price_value < 0 THEN
        RAISE EXCEPTION 'Size price cannot be negative for %', v_size_option_name;
      END IF;

      IF v_size_option ? 'id' AND NULLIF(trim(coalesce(v_size_option->>'id', '')), '') IS NOT NULL THEN
        BEGIN
          v_size_option_id := (v_size_option->>'id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_size_option_id := NULL;
        END;
      END IF;

      v_size_existing_id := NULL;

      IF v_size_option_id IS NOT NULL THEN
        UPDATE public.product_size_options so
           SET name = v_size_option_name,
               slug = v_size_option_slug,
               price_mode = v_size_price_mode,
               price_value = v_size_price_value,
               is_active = v_size_is_active,
               sort_order = v_size_sort_order,
               is_default = v_size_is_default
         WHERE so.id = v_size_option_id
           AND so.product_id = v_product_id
         RETURNING so.id INTO v_size_existing_id;
      END IF;

      IF v_size_existing_id IS NULL THEN
        INSERT INTO public.product_size_options (
          product_id,
          name,
          slug,
          price_mode,
          price_value,
          is_active,
          sort_order,
          is_default
        )
        VALUES (
          v_product_id,
          v_size_option_name,
          v_size_option_slug,
          v_size_price_mode,
          v_size_price_value,
          v_size_is_active,
          v_size_sort_order,
          v_size_is_default
        )
        RETURNING id INTO v_size_existing_id;
      END IF;

      v_size_ids_to_keep := array_append(v_size_ids_to_keep, v_size_existing_id);
    END LOOP;

    DELETE FROM public.product_size_options so
     WHERE so.product_id = v_product_id
       AND (
         array_length(v_size_ids_to_keep, 1) IS NULL
         OR NOT (so.id = ANY(v_size_ids_to_keep))
       );

    IF COALESCE(p_has_size_variants, false) THEN
      IF NOT EXISTS (
        SELECT 1
          FROM public.product_size_options so
         WHERE so.product_id = v_product_id
           AND so.is_active = true
      ) THEN
        RAISE EXCEPTION 'At least one active size option is required when has_size_variants is true';
      END IF;
    END IF;

    SELECT so.id
      INTO v_default_size_option_id
      FROM public.product_size_options so
     WHERE so.product_id = v_product_id
       AND so.is_default = true
     ORDER BY so.sort_order ASC, so.created_at ASC
     LIMIT 1;

    IF v_default_size_option_id IS NULL THEN
      SELECT so.id
        INTO v_default_size_option_id
        FROM public.product_size_options so
       WHERE so.product_id = v_product_id
         AND so.is_active = true
       ORDER BY so.sort_order ASC, so.created_at ASC
       LIMIT 1;
    END IF;

    IF v_default_size_option_id IS NULL THEN
      SELECT so.id
        INTO v_default_size_option_id
        FROM public.product_size_options so
       WHERE so.product_id = v_product_id
       ORDER BY so.sort_order ASC, so.created_at ASC
       LIMIT 1;
    END IF;

    IF v_default_size_option_id IS NOT NULL THEN
      UPDATE public.product_size_options so
         SET is_default = (so.id = v_default_size_option_id)
       WHERE so.product_id = v_product_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT v_product_id, v_created, coalesce(v_variants_inserted, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_product_domain(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  jsonb,
  numeric,
  boolean,
  boolean,
  uuid[],
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_domain(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  jsonb,
  numeric,
  boolean,
  boolean,
  uuid[],
  jsonb
) TO service_role;
