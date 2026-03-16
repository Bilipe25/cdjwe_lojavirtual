-- ============================================================
-- Migration 022: Fix ambiguous product_id in product domain RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_product_domain(
    p_product_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_slug text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_size text DEFAULT NULL,
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
            base_price,
            is_active,
            is_featured
        ) VALUES (
            p_name,
            p_slug,
            p_description,
            p_category_id,
            p_size,
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
    numeric,
    boolean,
    boolean,
    uuid[],
    jsonb
) TO service_role;
