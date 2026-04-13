-- Fix ambiguous "store_id" inside admin_upsert_store_fiscal_data.
-- Because RETURNS TABLE(store_id, updated) creates an output variable named
-- store_id, unqualified references like ON CONFLICT (store_id) can become
-- ambiguous in PL/pgSQL.

CREATE OR REPLACE FUNCTION public.admin_upsert_store_fiscal_data(
    p_store_id UUID,
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
RETURNS TABLE(store_id UUID, updated BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_document_type TEXT;
    v_person_type TEXT;
    v_document_number TEXT;
    v_updated BOOLEAN := false;
BEGIN
    IF p_store_id IS NULL THEN
        RAISE EXCEPTION 'p_store_id is required';
    END IF;

    v_document_type := UPPER(NULLIF(TRIM(COALESCE(p_document_type, '')), ''));
    v_document_number := NULLIF(public.normalize_tax_document(COALESCE(p_document_number, '')), '');

    IF v_document_number IS NULL THEN
        SELECT public.normalize_tax_document(COALESCE(s.document_number, s.cnpj, ''))
          INTO v_document_number
          FROM public.stores s
         WHERE s.id = p_store_id
         LIMIT 1;
    END IF;

    v_document_number := NULLIF(v_document_number, '');

    IF v_document_number ~ '^\d{11}$' THEN
        v_document_type := 'CPF';
    ELSIF v_document_number ~ '^\d{14}$' THEN
        v_document_type := 'CNPJ';
    ELSIF v_document_type NOT IN ('CPF', 'CNPJ') OR v_document_type IS NULL THEN
        v_document_type := 'CNPJ';
    END IF;

    IF v_document_number IS NULL THEN
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

    IF p_fiscal_address_id IS NOT NULL THEN
        PERFORM 1
          FROM public.store_addresses sa
         WHERE sa.id = p_fiscal_address_id
           AND sa.store_id = p_store_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Fiscal address does not belong to store %', p_store_id;
        END IF;
    END IF;

    INSERT INTO public.store_fiscal_data (
        store_id,
        person_type,
        document_type,
        document_number,
        state_registration,
        municipal_registration,
        taxpayer_indicator,
        fiscal_email,
        fiscal_notes,
        fiscal_address_id
    )
    VALUES (
        p_store_id,
        v_person_type,
        v_document_type,
        v_document_number,
        p_state_registration,
        p_municipal_registration,
        COALESCE(NULLIF(TRIM(COALESCE(p_taxpayer_indicator, '')), ''), 'contributor'),
        p_fiscal_email,
        p_fiscal_notes,
        p_fiscal_address_id
    )
    ON CONFLICT ON CONSTRAINT store_fiscal_data_store_id_key DO UPDATE
       SET person_type = EXCLUDED.person_type,
           document_type = EXCLUDED.document_type,
           document_number = EXCLUDED.document_number,
           state_registration = EXCLUDED.state_registration,
           municipal_registration = EXCLUDED.municipal_registration,
           taxpayer_indicator = EXCLUDED.taxpayer_indicator,
           fiscal_email = EXCLUDED.fiscal_email,
           fiscal_notes = EXCLUDED.fiscal_notes,
           fiscal_address_id = EXCLUDED.fiscal_address_id,
           updated_at = NOW();

    UPDATE public.stores s
       SET person_type = v_person_type,
           document_type = v_document_type,
           document_number = v_document_number,
           state_registration = COALESCE(p_state_registration, s.state_registration),
           cnpj = CASE
               WHEN v_document_type = 'CNPJ' THEN v_document_number
               ELSE s.cnpj
           END
     WHERE s.id = p_store_id;

    v_updated := true;
    RETURN QUERY SELECT p_store_id, v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_store_fiscal_data(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
)
TO authenticated, service_role;
