-- ============================================================
-- Migration 009: Customer Domain P1 Hardening
-- - Deduplicate stores by profile
-- - Enforce one store per profile
-- - Reinforce admin_upsert_customer_domain with UPSERT
-- ============================================================

-- 1) Build map of duplicate stores -> canonical store (oldest by created_at)
CREATE TEMP TABLE tmp_store_dedup_map ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        id,
        profile_id,
        ROW_NUMBER() OVER (
            PARTITION BY profile_id
            ORDER BY created_at ASC, id ASC
        ) AS rn,
        FIRST_VALUE(id) OVER (
            PARTITION BY profile_id
            ORDER BY created_at ASC, id ASC
        ) AS keeper_store_id
    FROM public.stores
)
SELECT
    id AS duplicate_store_id,
    keeper_store_id
FROM ranked
WHERE rn > 1;

-- 2) Move dependent rows to canonical store
UPDATE public.orders o
SET store_id = m.keeper_store_id
FROM tmp_store_dedup_map m
WHERE o.store_id = m.duplicate_store_id;

INSERT INTO public.store_price_tables (store_id, price_table_id, created_at)
SELECT m.keeper_store_id, spt.price_table_id, spt.created_at
FROM public.store_price_tables spt
JOIN tmp_store_dedup_map m ON m.duplicate_store_id = spt.store_id
ON CONFLICT (store_id, price_table_id) DO NOTHING;

DELETE FROM public.store_price_tables spt
USING tmp_store_dedup_map m
WHERE spt.store_id = m.duplicate_store_id;

INSERT INTO public.store_tags (store_id, tag_id, created_at)
SELECT m.keeper_store_id, st.tag_id, st.created_at
FROM public.store_tags st
JOIN tmp_store_dedup_map m ON m.duplicate_store_id = st.store_id
ON CONFLICT (store_id, tag_id) DO NOTHING;

DELETE FROM public.store_tags st
USING tmp_store_dedup_map m
WHERE st.store_id = m.duplicate_store_id;

UPDATE public.store_addresses sa
SET store_id = m.keeper_store_id
FROM tmp_store_dedup_map m
WHERE sa.store_id = m.duplicate_store_id;

-- 3) Remove duplicate stores
DELETE FROM public.stores s
USING tmp_store_dedup_map m
WHERE s.id = m.duplicate_store_id;

-- 4) Enforce one store per profile from now on
CREATE UNIQUE INDEX IF NOT EXISTS uq_stores_profile_id
    ON public.stores(profile_id);

-- Ensure only one main address per store at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_addresses_main_per_store
    ON public.store_addresses(store_id)
    WHERE is_main = true;

-- Normalize is_main after consolidation (keep first as main)
WITH ranked_addresses AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY store_id
            ORDER BY is_main DESC, created_at ASC, id ASC
        ) AS rn
    FROM public.store_addresses
)
UPDATE public.store_addresses sa
SET is_main = (ra.rn = 1)
FROM ranked_addresses ra
WHERE sa.id = ra.id;

-- 5) Recreate RPC with race-safe UPSERT behavior
CREATE OR REPLACE FUNCTION public.admin_upsert_customer_domain(
    p_profile_id uuid,
    p_full_name text,
    p_phone text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_store_id uuid DEFAULT NULL,
    p_company_name text DEFAULT NULL,
    p_trade_name text DEFAULT NULL,
    p_cnpj text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_customer_type_id uuid DEFAULT NULL,
    p_representative_id uuid DEFAULT NULL,
    p_address text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_zip_code text DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE(store_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_profile_role text;
    v_final_status text;
    v_store_id uuid;
    v_main_address_id uuid;
    v_has_complete_address boolean;
BEGIN
    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'p_profile_id is required';
    END IF;

    IF NULLIF(trim(coalesce(p_full_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_full_name is required';
    END IF;

    IF NULLIF(trim(coalesce(p_company_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_company_name is required';
    END IF;

    IF NULLIF(trim(coalesce(p_cnpj, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_cnpj is required';
    END IF;

    IF NULLIF(trim(coalesce(p_email, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_email is required';
    END IF;

    SELECT role
      INTO v_profile_role
      FROM public.profiles
     WHERE id = p_profile_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile % not found', p_profile_id;
    END IF;

    IF v_profile_role <> 'client' THEN
        RAISE EXCEPTION 'Profile % is not a client', p_profile_id;
    END IF;

    v_final_status := coalesce(p_status, 'approved');
    IF v_final_status NOT IN ('pending', 'approved', 'blocked', 'imported') THEN
        RAISE EXCEPTION 'Invalid customer status: %', v_final_status;
    END IF;

    UPDATE public.profiles
       SET full_name = p_full_name,
           phone = p_phone,
           status = v_final_status
     WHERE id = p_profile_id;

    IF p_store_id IS NOT NULL THEN
        PERFORM 1
          FROM public.stores
         WHERE id = p_store_id
           AND profile_id = p_profile_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Store % does not belong to profile %', p_store_id, p_profile_id;
        END IF;
    END IF;

    INSERT INTO public.stores (
        profile_id,
        company_name,
        trade_name,
        cnpj,
        email,
        phone,
        customer_type_id,
        representative_id,
        address,
        city,
        state,
        zip_code
    ) VALUES (
        p_profile_id,
        p_company_name,
        p_trade_name,
        p_cnpj,
        p_email,
        p_phone,
        p_customer_type_id,
        p_representative_id,
        p_address,
        p_city,
        p_state,
        p_zip_code
    )
    ON CONFLICT (profile_id) DO UPDATE
       SET company_name = EXCLUDED.company_name,
           trade_name = EXCLUDED.trade_name,
           cnpj = EXCLUDED.cnpj,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           customer_type_id = EXCLUDED.customer_type_id,
           representative_id = EXCLUDED.representative_id,
           address = EXCLUDED.address,
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           zip_code = EXCLUDED.zip_code
    RETURNING id INTO v_store_id;

    IF p_store_id IS NOT NULL AND v_store_id <> p_store_id THEN
        RAISE EXCEPTION 'Resolved store id % differs from input store id %', v_store_id, p_store_id;
    END IF;

    DELETE FROM public.store_tags
     WHERE store_id = v_store_id;

    IF coalesce(array_length(p_tag_ids, 1), 0) > 0 THEN
        INSERT INTO public.store_tags (store_id, tag_id)
        SELECT v_store_id, tag_id
          FROM (
              SELECT DISTINCT unnest(p_tag_ids) AS tag_id
          ) dedup
         WHERE tag_id IS NOT NULL;
    END IF;

    v_has_complete_address :=
        NULLIF(trim(coalesce(p_address, '')), '') IS NOT NULL
        AND NULLIF(trim(coalesce(p_city, '')), '') IS NOT NULL
        AND NULLIF(trim(coalesce(p_state, '')), '') IS NOT NULL
        AND NULLIF(trim(coalesce(p_zip_code, '')), '') IS NOT NULL;

    IF v_has_complete_address THEN
        SELECT id
          INTO v_main_address_id
          FROM public.store_addresses
         WHERE store_id = v_store_id
           AND is_main = true
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE;

        IF v_main_address_id IS NULL THEN
            INSERT INTO public.store_addresses (
                store_id,
                title,
                is_main,
                zip_code,
                address,
                city,
                state,
                number,
                neighborhood
            ) VALUES (
                v_store_id,
                'Endereco Principal',
                true,
                p_zip_code,
                p_address,
                p_city,
                p_state,
                NULL,
                NULL
            )
            RETURNING id INTO v_main_address_id;
        ELSE
            UPDATE public.store_addresses
               SET zip_code = p_zip_code,
                   address = p_address,
                   city = p_city,
                   state = p_state
             WHERE id = v_main_address_id;
        END IF;
    END IF;

    RETURN QUERY SELECT v_store_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_customer_domain(
    uuid,
    text,
    text,
    text,
    uuid,
    text,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    uuid[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_upsert_customer_domain(
    uuid,
    text,
    text,
    text,
    uuid,
    text,
    text,
    text,
    text,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    uuid[]
) TO service_role;
