-- ============================================================
-- Migration 008: Customer Domain Atomic Upsert RPC
-- ============================================================

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
        SELECT id
          INTO v_store_id
          FROM public.stores
         WHERE id = p_store_id
           AND profile_id = p_profile_id
         FOR UPDATE;

        IF v_store_id IS NULL THEN
            RAISE EXCEPTION 'Store % does not belong to profile %', p_store_id, p_profile_id;
        END IF;
    ELSE
        SELECT id
          INTO v_store_id
          FROM public.stores
         WHERE profile_id = p_profile_id
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE;
    END IF;

    IF v_store_id IS NULL THEN
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
        RETURNING id INTO v_store_id;
    ELSE
        UPDATE public.stores
           SET company_name = p_company_name,
               trade_name = p_trade_name,
               cnpj = p_cnpj,
               email = p_email,
               phone = p_phone,
               customer_type_id = p_customer_type_id,
               representative_id = p_representative_id,
               address = p_address,
               city = p_city,
               state = p_state,
               zip_code = p_zip_code
         WHERE id = v_store_id;
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
