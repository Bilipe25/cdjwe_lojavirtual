-- ============================================================
-- Migration 018: Admin Products Images Metadata RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_save_product_images_metadata(
    p_product_id uuid,
    p_image_ids_to_delete uuid[] DEFAULT '{}'::uuid[],
    p_new_image_urls text[] DEFAULT '{}'::text[],
    p_primary_image_ref text DEFAULT NULL
)
RETURNS TABLE(
    product_id uuid,
    primary_image_id uuid,
    deleted_urls text[],
    inserted_image_ids uuid[],
    total_images integer
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_deleted_urls text[] := ARRAY[]::text[];
    v_inserted_ids uuid[] := ARRAY[]::uuid[];
    v_primary_ref text;
    v_primary_id uuid;
    v_new_index integer;
BEGIN
    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'p_product_id is required';
    END IF;

    PERFORM 1
      FROM public.products
     WHERE id = p_product_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', p_product_id;
    END IF;

    SELECT coalesce(array_agg(pi.url ORDER BY pi.sort_order, pi.created_at), ARRAY[]::text[])
      INTO v_deleted_urls
      FROM public.product_images pi
     WHERE pi.product_id = p_product_id
       AND pi.id = ANY(coalesce(p_image_ids_to_delete, ARRAY[]::uuid[]));

    DELETE FROM public.product_images
     WHERE product_id = p_product_id
       AND id = ANY(coalesce(p_image_ids_to_delete, ARRAY[]::uuid[]));

    WITH base AS (
        SELECT coalesce(max(sort_order), -1) AS max_sort
          FROM public.product_images
         WHERE product_id = p_product_id
    ),
    new_rows AS (
        SELECT trim(t.url) AS url, t.ordinality::integer AS ord
          FROM unnest(coalesce(p_new_image_urls, ARRAY[]::text[])) WITH ORDINALITY AS t(url, ordinality)
         WHERE nullif(trim(t.url), '') IS NOT NULL
    ),
    inserted AS (
        INSERT INTO public.product_images (
            product_id,
            url,
            is_primary,
            sort_order
        )
        SELECT
            p_product_id,
            n.url,
            false,
            b.max_sort + n.ord
          FROM new_rows n
          CROSS JOIN base b
        RETURNING id, sort_order
    )
    SELECT coalesce(array_agg(i.id ORDER BY i.sort_order), ARRAY[]::uuid[])
      INTO v_inserted_ids
      FROM inserted i;

    v_primary_ref := nullif(trim(coalesce(p_primary_image_ref, '')), '');
    v_primary_id := NULL;

    IF v_primary_ref IS NOT NULL THEN
        IF v_primary_ref LIKE 'new_%' THEN
            BEGIN
                v_new_index := substring(v_primary_ref from 5)::integer;
            EXCEPTION WHEN invalid_text_representation THEN
                v_new_index := NULL;
            END;

            IF v_new_index IS NOT NULL
               AND v_new_index >= 0
               AND array_length(v_inserted_ids, 1) IS NOT NULL
               AND array_length(v_inserted_ids, 1) >= (v_new_index + 1) THEN
                v_primary_id := v_inserted_ids[v_new_index + 1];
            END IF;
        ELSE
            BEGIN
                v_primary_id := v_primary_ref::uuid;
            EXCEPTION WHEN invalid_text_representation THEN
                v_primary_id := NULL;
            END;
        END IF;
    END IF;

    IF v_primary_id IS NOT NULL THEN
        PERFORM 1
          FROM public.product_images
         WHERE id = v_primary_id
           AND product_id = p_product_id;

        IF NOT FOUND THEN
            v_primary_id := NULL;
        END IF;
    END IF;

    IF v_primary_id IS NULL THEN
        SELECT id
          INTO v_primary_id
          FROM public.product_images
         WHERE product_id = p_product_id
         ORDER BY sort_order ASC, created_at ASC
         LIMIT 1;
    END IF;

    UPDATE public.product_images
       SET is_primary = false
     WHERE product_id = p_product_id;

    IF v_primary_id IS NOT NULL THEN
        UPDATE public.product_images
           SET is_primary = true
         WHERE id = v_primary_id;
    END IF;

    RETURN QUERY
    SELECT
        p_product_id,
        v_primary_id,
        v_deleted_urls,
        v_inserted_ids,
        (SELECT count(*)::integer FROM public.product_images WHERE product_id = p_product_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_product_images_metadata(
    uuid,
    uuid[],
    text[],
    text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_save_product_images_metadata(
    uuid,
    uuid[],
    text[],
    text
) TO service_role;
