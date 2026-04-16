CREATE OR REPLACE FUNCTION public.admin_upsert_product_domain(
    p_product_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_slug TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_size TEXT DEFAULT NULL,
    p_has_size_variants BOOLEAN DEFAULT false,
    p_size_options JSONB DEFAULT NULL,
    p_base_price NUMERIC DEFAULT 0,
    p_is_active BOOLEAN DEFAULT true,
    p_is_featured BOOLEAN DEFAULT false,
    p_active_variant_ids UUID[] DEFAULT NULL,
    p_variant_price_overrides JSONB DEFAULT NULL,
    p_tax_profile_id UUID DEFAULT NULL
)
RETURNS TABLE(product_id UUID, created BOOLEAN, variants_inserted INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_product_id UUID;
    v_created BOOLEAN := false;
    v_variants_inserted INTEGER := 0;
    v_override_key TEXT;
    v_override_value TEXT;
    v_variant_id UUID;
    v_price NUMERIC;
    v_size_option JSONB;
    v_size_option_id UUID;
    v_size_option_name TEXT;
    v_size_option_slug TEXT;
    v_size_price_mode TEXT;
    v_size_price_value NUMERIC;
    v_size_is_active BOOLEAN;
    v_size_sort_order INTEGER;
    v_size_is_default BOOLEAN;
    v_size_existing_id UUID;
    v_size_ids_to_keep UUID[] := ARRAY[]::UUID[];
    v_default_size_option_id UUID;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_slug, '')), '') IS NULL THEN
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
            tax_profile_id,
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
            p_tax_profile_id,
            p_size,
            COALESCE(p_has_size_variants, false),
            p_base_price,
            p_is_active,
            p_is_featured
        )
        RETURNING id INTO v_product_id;

        v_created := true;
    ELSE
        UPDATE public.products AS p
           SET name = p_name,
               slug = p_slug,
               description = p_description,
               category_id = p_category_id,
               tax_profile_id = p_tax_profile_id,
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
        COALESCE(p_is_active, true) AND COALESCE(fc.is_active, true)
    FROM public.fabric_colors AS fc
    WHERE NOT EXISTS (
        SELECT 1
          FROM public.product_variants AS pv
         WHERE pv.product_id = v_product_id
           AND pv.fabric_id = fc.fabric_id
           AND pv.fabric_color_id = fc.id
    );

    GET DIAGNOSTICS v_variants_inserted = ROW_COUNT;

    IF p_active_variant_ids IS NOT NULL THEN
        UPDATE public.product_variants AS pv
           SET is_active = (pv.id = ANY(p_active_variant_ids))
         WHERE pv.product_id = v_product_id;
    END IF;

    IF p_variant_price_overrides IS NOT NULL THEN
        FOR v_override_key, v_override_value IN
            SELECT key, value
            FROM jsonb_each_text(p_variant_price_overrides)
        LOOP
            BEGIN
                v_variant_id := v_override_key::UUID;
            EXCEPTION WHEN invalid_text_representation THEN
                CONTINUE;
            END;

            IF NULLIF(TRIM(COALESCE(v_override_value, '')), '') IS NULL THEN
                v_price := NULL;
            ELSE
                BEGIN
                    v_price := v_override_value::NUMERIC;
                EXCEPTION WHEN invalid_text_representation THEN
                    RAISE EXCEPTION 'Invalid variant price for id %', v_override_key;
                END;

                IF v_price < 0 THEN
                    RAISE EXCEPTION 'Variant price cannot be negative for id %', v_override_key;
                END IF;
            END IF;

            UPDATE public.product_variants AS pv
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
            v_size_option_name := NULLIF(TRIM(COALESCE(v_size_option->>'name', '')), '');
            v_size_option_slug := LOWER(NULLIF(TRIM(COALESCE(v_size_option->>'slug', '')), ''));
            v_size_price_mode := LOWER(COALESCE(v_size_option->>'price_mode', 'delta'));
            v_size_price_value := COALESCE((v_size_option->>'price_value')::NUMERIC, 0);
            v_size_is_active := COALESCE((v_size_option->>'is_active')::BOOLEAN, true);
            v_size_sort_order := COALESCE((v_size_option->>'sort_order')::INTEGER, 0);
            v_size_is_default := COALESCE((v_size_option->>'is_default')::BOOLEAN, false);

            IF v_size_option_name IS NULL THEN
                RAISE EXCEPTION 'Size option name is required';
            END IF;

            IF v_size_option_slug IS NULL THEN
                v_size_option_slug := LOWER(regexp_replace(v_size_option_name, '[^a-zA-Z0-9]+', '-', 'g'));
            END IF;
            v_size_option_slug := TRIM(BOTH '-' FROM v_size_option_slug);

            IF v_size_option_slug IS NULL OR v_size_option_slug = '' THEN
                RAISE EXCEPTION 'Invalid size option slug for %', v_size_option_name;
            END IF;

            IF v_size_price_mode NOT IN ('absolute', 'delta') THEN
                RAISE EXCEPTION 'Invalid size price mode for %', v_size_option_name;
            END IF;

            IF v_size_price_value < 0 THEN
                RAISE EXCEPTION 'Size price cannot be negative for %', v_size_option_name;
            END IF;

            IF v_size_option ? 'id' AND NULLIF(TRIM(COALESCE(v_size_option->>'id', '')), '') IS NOT NULL THEN
                BEGIN
                    v_size_option_id := (v_size_option->>'id')::UUID;
                EXCEPTION WHEN invalid_text_representation THEN
                    v_size_option_id := NULL;
                END;
            END IF;

            v_size_existing_id := NULL;

            IF v_size_option_id IS NOT NULL THEN
                UPDATE public.product_size_options AS so
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

        DELETE FROM public.product_size_options AS so
         WHERE so.product_id = v_product_id
           AND (
               array_length(v_size_ids_to_keep, 1) IS NULL
               OR NOT (so.id = ANY(v_size_ids_to_keep))
           );

        IF COALESCE(p_has_size_variants, false) THEN
            IF NOT EXISTS (
                SELECT 1
                  FROM public.product_size_options AS so
                 WHERE so.product_id = v_product_id
                   AND so.is_active = true
            ) THEN
                RAISE EXCEPTION 'At least one active size option is required when has_size_variants is true';
            END IF;
        END IF;

        SELECT so.id
          INTO v_default_size_option_id
          FROM public.product_size_options AS so
         WHERE so.product_id = v_product_id
           AND so.is_default = true
         ORDER BY so.sort_order ASC, so.created_at ASC
         LIMIT 1;

        IF v_default_size_option_id IS NULL THEN
            SELECT so.id
              INTO v_default_size_option_id
              FROM public.product_size_options AS so
             WHERE so.product_id = v_product_id
               AND so.is_active = true
             ORDER BY so.sort_order ASC, so.created_at ASC
             LIMIT 1;
        END IF;

        IF v_default_size_option_id IS NULL THEN
            SELECT so.id
              INTO v_default_size_option_id
              FROM public.product_size_options AS so
             WHERE so.product_id = v_product_id
             ORDER BY so.sort_order ASC, so.created_at ASC
             LIMIT 1;
        END IF;

        IF v_default_size_option_id IS NOT NULL THEN
            UPDATE public.product_size_options AS so
               SET is_default = (so.id = v_default_size_option_id)
             WHERE so.product_id = v_product_id;
        END IF;
    END IF;

    RETURN QUERY
    SELECT v_product_id, v_created, COALESCE(v_variants_inserted, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_domain(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN, JSONB, NUMERIC, BOOLEAN, BOOLEAN, UUID[], JSONB, UUID
)
TO service_role, authenticated;
