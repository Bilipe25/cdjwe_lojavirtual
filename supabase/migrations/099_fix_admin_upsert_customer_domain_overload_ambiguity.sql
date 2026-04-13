-- Fix overloaded admin_upsert_customer_domain ambiguity introduced by
-- the fiscal extension that called the legacy 16-arg overload.

CREATE OR REPLACE FUNCTION public.admin_upsert_customer_domain(
    p_profile_id UUID,
    p_full_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_store_id UUID DEFAULT NULL,
    p_company_name TEXT DEFAULT NULL,
    p_trade_name TEXT DEFAULT NULL,
    p_cnpj TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_customer_type_id UUID DEFAULT NULL,
    p_representative_id UUID DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_zip_code TEXT DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT '{}'::UUID[],
    p_person_type TEXT DEFAULT NULL,
    p_document_type TEXT DEFAULT NULL,
    p_document_number TEXT DEFAULT NULL,
    p_state_registration TEXT DEFAULT NULL,
    p_municipal_registration TEXT DEFAULT NULL,
    p_taxpayer_indicator TEXT DEFAULT NULL,
    p_fiscal_email TEXT DEFAULT NULL,
    p_fiscal_notes TEXT DEFAULT NULL,
    p_fiscal_address_id UUID DEFAULT NULL
)
RETURNS TABLE(store_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_profile_role TEXT;
    v_final_status TEXT;
    v_store_id UUID;
    v_main_address_id UUID;
    v_has_complete_address BOOLEAN;
    v_document_type TEXT;
    v_person_type TEXT;
    v_document_number TEXT;
BEGIN
    IF p_profile_id IS NULL THEN
        RAISE EXCEPTION 'p_profile_id is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_full_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_full_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_company_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_company_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_cnpj, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_cnpj is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_email, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_email is required';
    END IF;

    SELECT p.role
      INTO v_profile_role
      FROM public.profiles p
     WHERE p.id = p_profile_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile % not found', p_profile_id;
    END IF;

    IF v_profile_role NOT IN ('client', 'representative') THEN
        RAISE EXCEPTION 'Profile % is not allowed for customer domain update', p_profile_id;
    END IF;

    v_final_status := COALESCE(p_status, 'approved');
    IF v_final_status NOT IN ('pending', 'approved', 'blocked', 'imported') THEN
        RAISE EXCEPTION 'Invalid customer status: %', v_final_status;
    END IF;

    UPDATE public.profiles p
       SET full_name = p_full_name,
           phone = p_phone,
           status = v_final_status
     WHERE p.id = p_profile_id;

    IF p_store_id IS NOT NULL THEN
        PERFORM 1
          FROM public.stores s
         WHERE s.id = p_store_id
           AND s.profile_id = p_profile_id
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

    DELETE FROM public.store_tags st
     WHERE st.store_id = v_store_id;

    IF COALESCE(array_length(p_tag_ids, 1), 0) > 0 THEN
        INSERT INTO public.store_tags (store_id, tag_id)
        SELECT v_store_id, dedup.tag_id
          FROM (
              SELECT DISTINCT unnest(p_tag_ids) AS tag_id
          ) dedup
         WHERE dedup.tag_id IS NOT NULL;
    END IF;

    v_has_complete_address :=
        NULLIF(TRIM(COALESCE(p_address, '')), '') IS NOT NULL
        AND NULLIF(TRIM(COALESCE(p_city, '')), '') IS NOT NULL
        AND NULLIF(TRIM(COALESCE(p_state, '')), '') IS NOT NULL
        AND NULLIF(TRIM(COALESCE(p_zip_code, '')), '') IS NOT NULL;

    IF v_has_complete_address THEN
        SELECT sa.id
          INTO v_main_address_id
          FROM public.store_addresses sa
         WHERE sa.store_id = v_store_id
           AND sa.is_main = true
         ORDER BY sa.created_at ASC
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
            UPDATE public.store_addresses sa
               SET zip_code = p_zip_code,
                   address = p_address,
                   city = p_city,
                   state = p_state
             WHERE sa.id = v_main_address_id;
        END IF;
    END IF;

    v_document_type := UPPER(NULLIF(TRIM(COALESCE(p_document_type, '')), ''));
    v_document_number := COALESCE(
        NULLIF(public.normalize_tax_document(p_document_number), ''),
        NULLIF(public.normalize_tax_document(p_cnpj), '')
    );

    IF v_document_number ~ '^\d{11}$' THEN
        v_document_type := 'CPF';
    ELSIF v_document_number ~ '^\d{14}$' THEN
        v_document_type := 'CNPJ';
    ELSIF v_document_type NOT IN ('CPF', 'CNPJ') OR v_document_type IS NULL THEN
        v_document_type := 'CNPJ';
    END IF;

    IF NULLIF(v_document_number, '') IS NULL THEN
        v_document_number := CASE
            WHEN v_document_type = 'CPF' THEN '00000000000'
            ELSE '00000000000000'
        END;
    ELSIF v_document_type = 'CPF' AND v_document_number !~ '^\d{11}$' THEN
        v_document_number := LPAD(RIGHT(v_document_number, 11), 11, '0');
    ELSIF v_document_type = 'CNPJ' AND v_document_number !~ '^\d{14}$' THEN
        v_document_number := LPAD(RIGHT(v_document_number, 14), 14, '0');
    END IF;

    v_person_type := COALESCE(
        NULLIF(TRIM(COALESCE(p_person_type, '')), ''),
        CASE WHEN v_document_type = 'CPF' THEN 'individual' ELSE 'legal_entity' END
    );
    IF v_document_type = 'CPF' THEN
        v_person_type := 'individual';
    ELSIF v_document_type = 'CNPJ' THEN
        v_person_type := 'legal_entity';
    END IF;

    UPDATE public.stores s
       SET person_type = v_person_type,
           document_type = v_document_type,
           document_number = v_document_number,
           state_registration = COALESCE(p_state_registration, s.state_registration),
           cnpj = CASE
               WHEN v_document_type = 'CNPJ' AND NULLIF(v_document_number, '') IS NOT NULL THEN v_document_number
               ELSE s.cnpj
           END
     WHERE s.id = v_store_id;

    PERFORM public.admin_upsert_store_fiscal_data(
        v_store_id,
        v_person_type,
        v_document_type,
        v_document_number,
        COALESCE(p_state_registration, NULL),
        p_municipal_registration,
        p_taxpayer_indicator,
        COALESCE(NULLIF(TRIM(COALESCE(p_fiscal_email, '')), ''), p_email),
        p_fiscal_notes,
        p_fiscal_address_id
    );

    RETURN QUERY SELECT v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_customer_domain(
    UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID[],
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
)
TO service_role, authenticated;
