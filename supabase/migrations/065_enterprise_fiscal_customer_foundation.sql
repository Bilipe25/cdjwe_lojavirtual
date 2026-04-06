-- ============================================================
-- Migration 065: Enterprise Fiscal Foundation (Customers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_tax_document(p_document TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT regexp_replace(COALESCE(p_document, ''), '\D', '', 'g');
$$;

-- 1) Fiscal address support (IBGE / country ready)
ALTER TABLE public.store_addresses
    ADD COLUMN IF NOT EXISTS municipality_code TEXT,
    ADD COLUMN IF NOT EXISTS country_code TEXT;

UPDATE public.store_addresses
   SET country_code = COALESCE(NULLIF(TRIM(COALESCE(country_code, '')), ''), '1058')
 WHERE country_code IS NULL OR TRIM(country_code) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_addresses_country_code_check'
    ) THEN
        ALTER TABLE public.store_addresses
            ADD CONSTRAINT store_addresses_country_code_check
            CHECK (country_code IS NULL OR country_code ~ '^\d{4}$');
    END IF;
END $$;

-- 2) Store fiscal data (1:1 with store)
CREATE TABLE IF NOT EXISTS public.store_fiscal_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
    person_type TEXT NOT NULL DEFAULT 'legal_entity',
    document_type TEXT NOT NULL DEFAULT 'CNPJ',
    document_number TEXT NOT NULL,
    state_registration TEXT,
    municipal_registration TEXT,
    taxpayer_indicator TEXT NOT NULL DEFAULT 'contributor',
    fiscal_email TEXT,
    fiscal_notes TEXT,
    fiscal_address_id UUID REFERENCES public.store_addresses(id) ON DELETE SET NULL,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_fiscal_data_store
    ON public.store_fiscal_data(store_id);
CREATE INDEX IF NOT EXISTS idx_store_fiscal_data_document
    ON public.store_fiscal_data(document_number);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_person_type_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_person_type_check
            CHECK (person_type IN ('individual', 'legal_entity'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_document_type_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_document_type_check
            CHECK (document_type IN ('CPF', 'CNPJ'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_document_length_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_document_length_check
            CHECK (
                (document_type = 'CPF' AND public.normalize_tax_document(document_number) ~ '^\d{11}$')
                OR
                (document_type = 'CNPJ' AND public.normalize_tax_document(document_number) ~ '^\d{14}$')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_person_document_consistency_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_person_document_consistency_check
            CHECK (
                (person_type = 'individual' AND document_type = 'CPF')
                OR
                (person_type = 'legal_entity' AND document_type = 'CNPJ')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_taxpayer_indicator_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_taxpayer_indicator_check
            CHECK (taxpayer_indicator IN ('contributor', 'non_contributor', 'exempt'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_fiscal_data_payload_object_check'
    ) THEN
        ALTER TABLE public.store_fiscal_data
            ADD CONSTRAINT store_fiscal_data_payload_object_check
            CHECK (jsonb_typeof(future_tax_payload) = 'object');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_store_fiscal_data_updated_at ON public.store_fiscal_data;
CREATE TRIGGER update_store_fiscal_data_updated_at
    BEFORE UPDATE ON public.store_fiscal_data
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Generic document fields on stores (backward compatible with cnpj)
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS person_type TEXT,
    ADD COLUMN IF NOT EXISTS document_type TEXT,
    ADD COLUMN IF NOT EXISTS document_number TEXT;

WITH normalized_store_documents AS (
    SELECT
        s.id AS store_id,
        NULLIF(
            public.normalize_tax_document(
                COALESCE(
                    NULLIF(TRIM(COALESCE(s.document_number, '')), ''),
                    s.cnpj,
                    ''
                )
            ),
            ''
        ) AS normalized_document,
        UPPER(NULLIF(TRIM(COALESCE(s.document_type, '')), '')) AS input_document_type,
        NULLIF(TRIM(COALESCE(s.person_type, '')), '') AS input_person_type
    FROM public.stores s
)
UPDATE public.stores s
   SET person_type = CASE
           WHEN nd.normalized_document ~ '^\d{11}$' THEN 'individual'
           WHEN nd.normalized_document ~ '^\d{14}$' THEN 'legal_entity'
           WHEN nd.input_person_type IN ('individual', 'legal_entity') THEN nd.input_person_type
           WHEN nd.input_document_type = 'CPF' THEN 'individual'
           ELSE 'legal_entity'
       END,
       document_type = CASE
           WHEN nd.normalized_document ~ '^\d{11}$' THEN 'CPF'
           WHEN nd.normalized_document ~ '^\d{14}$' THEN 'CNPJ'
           WHEN nd.input_document_type IN ('CPF', 'CNPJ') THEN nd.input_document_type
           ELSE 'CNPJ'
       END,
       document_number = nd.normalized_document
  FROM normalized_store_documents nd
 WHERE nd.store_id = s.id;

CREATE INDEX IF NOT EXISTS idx_stores_document_number
    ON public.stores(document_number);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stores_person_type_check'
    ) THEN
        ALTER TABLE public.stores
            ADD CONSTRAINT stores_person_type_check
            CHECK (person_type IS NULL OR person_type IN ('individual', 'legal_entity'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stores_document_type_check'
    ) THEN
        ALTER TABLE public.stores
            ADD CONSTRAINT stores_document_type_check
            CHECK (document_type IS NULL OR document_type IN ('CPF', 'CNPJ'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_store_fiscal_data_from_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_document_type TEXT;
    v_person_type TEXT;
    v_document_number TEXT;
BEGIN
    v_document_number := NULLIF(
        public.normalize_tax_document(
            COALESCE(
                NULLIF(TRIM(COALESCE(NEW.document_number, '')), ''),
                NEW.cnpj,
                ''
            )
        ),
        ''
    );
    v_document_type := UPPER(NULLIF(TRIM(COALESCE(NEW.document_type, '')), ''));

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

    v_person_type := CASE
        WHEN v_document_type = 'CPF' THEN 'individual'
        ELSE 'legal_entity'
    END;

    NEW.document_type := v_document_type;
    NEW.person_type := v_person_type;
    NEW.document_number := v_document_number;

    IF v_document_type = 'CNPJ' THEN
        NEW.cnpj := v_document_number;
    END IF;

    INSERT INTO public.store_fiscal_data (
        store_id,
        person_type,
        document_type,
        document_number,
        state_registration,
        fiscal_email
    )
    VALUES (
        NEW.id,
        v_person_type,
        v_document_type,
        v_document_number,
        NEW.state_registration,
        NEW.email
    )
    ON CONFLICT (store_id) DO UPDATE
       SET person_type = EXCLUDED.person_type,
           document_type = EXCLUDED.document_type,
           document_number = EXCLUDED.document_number,
           state_registration = COALESCE(EXCLUDED.state_registration, public.store_fiscal_data.state_registration),
           fiscal_email = COALESCE(EXCLUDED.fiscal_email, public.store_fiscal_data.fiscal_email),
           updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_fiscal_data_from_store ON public.stores;
CREATE TRIGGER trg_sync_store_fiscal_data_from_store
    AFTER INSERT OR UPDATE OF cnpj, state_registration, email, person_type, document_type, document_number
    ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_store_fiscal_data_from_store();

-- Backfill fiscal table from existing stores
INSERT INTO public.store_fiscal_data (
    store_id,
    person_type,
    document_type,
    document_number,
    state_registration,
    fiscal_email
)
SELECT
    ns.store_id,
    CASE
        WHEN ns.normalized_document ~ '^\d{11}$' THEN 'individual'
        WHEN ns.normalized_document ~ '^\d{14}$' THEN 'legal_entity'
        WHEN ns.input_person_type IN ('individual', 'legal_entity') THEN ns.input_person_type
        WHEN ns.input_document_type = 'CPF' THEN 'individual'
        ELSE 'legal_entity'
    END AS person_type,
    CASE
        WHEN ns.normalized_document ~ '^\d{11}$' THEN 'CPF'
        WHEN ns.normalized_document ~ '^\d{14}$' THEN 'CNPJ'
        WHEN ns.input_document_type IN ('CPF', 'CNPJ') THEN ns.input_document_type
        ELSE 'CNPJ'
    END AS document_type,
    CASE
        WHEN ns.normalized_document ~ '^\d{11}$' THEN ns.normalized_document
        WHEN ns.normalized_document ~ '^\d{14}$' THEN ns.normalized_document
        WHEN ns.normalized_document IS NULL THEN
            CASE
                WHEN ns.input_document_type = 'CPF' THEN '00000000000'
                ELSE '00000000000000'
            END
        WHEN ns.input_document_type = 'CPF' THEN LPAD(RIGHT(ns.normalized_document, 11), 11, '0')
        ELSE LPAD(RIGHT(ns.normalized_document, 14), 14, '0')
    END AS document_number,
    ns.state_registration,
    ns.email
FROM (
    SELECT
        s.id AS store_id,
        NULLIF(
            public.normalize_tax_document(
                COALESCE(
                    NULLIF(TRIM(COALESCE(s.document_number, '')), ''),
                    s.cnpj,
                    ''
                )
            ),
            ''
        ) AS normalized_document,
        UPPER(NULLIF(TRIM(COALESCE(s.document_type, '')), '')) AS input_document_type,
        NULLIF(TRIM(COALESCE(s.person_type, '')), '') AS input_person_type,
        s.state_registration,
        s.email
    FROM public.stores s
) AS ns
ON CONFLICT (store_id) DO UPDATE
   SET person_type = EXCLUDED.person_type,
       document_type = EXCLUDED.document_type,
       document_number = EXCLUDED.document_number,
       state_registration = COALESCE(EXCLUDED.state_registration, public.store_fiscal_data.state_registration),
       fiscal_email = COALESCE(EXCLUDED.fiscal_email, public.store_fiscal_data.fiscal_email),
       updated_at = NOW();

-- 4) Admin RPC to read/update fiscal customer data
CREATE OR REPLACE FUNCTION public.admin_get_store_fiscal_data(
    p_store_id UUID
)
RETURNS TABLE (
    store_id UUID,
    person_type TEXT,
    document_type TEXT,
    document_number TEXT,
    state_registration TEXT,
    municipal_registration TEXT,
    taxpayer_indicator TEXT,
    fiscal_email TEXT,
    fiscal_notes TEXT,
    fiscal_address_id UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        fd.store_id,
        fd.person_type,
        fd.document_type,
        fd.document_number,
        fd.state_registration,
        fd.municipal_registration,
        fd.taxpayer_indicator,
        fd.fiscal_email,
        fd.fiscal_notes,
        fd.fiscal_address_id
    FROM public.store_fiscal_data fd
    WHERE fd.store_id = p_store_id
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_store_fiscal_data(UUID)
TO authenticated, service_role;

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
    ON CONFLICT (store_id) DO UPDATE
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

-- 5) Extend customer domain RPC with generic document/fiscal fields
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
DECLARE
    v_store_id UUID;
    v_document_type TEXT;
    v_person_type TEXT;
    v_document_number TEXT;
BEGIN
    -- Call legacy implementation first (keeps existing behavior)
    SELECT *
      INTO v_store_id
      FROM public.admin_upsert_customer_domain(
        p_profile_id,
        p_full_name,
        p_phone,
        p_status,
        p_store_id,
        p_company_name,
        p_trade_name,
        p_cnpj,
        p_email,
        p_customer_type_id,
        p_representative_id,
        p_address,
        p_city,
        p_state,
        p_zip_code,
        p_tag_ids
      );

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve store for profile %', p_profile_id;
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

-- 6) RLS policies for new fiscal table
ALTER TABLE public.store_fiscal_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'store_fiscal_data'
          AND policyname = 'store_fiscal_data_admin_all'
    ) THEN
        CREATE POLICY "store_fiscal_data_admin_all"
            ON public.store_fiscal_data
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid()
                      AND role = 'admin'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'store_fiscal_data'
          AND policyname = 'store_fiscal_data_client_select_own'
    ) THEN
        CREATE POLICY "store_fiscal_data_client_select_own"
            ON public.store_fiscal_data
            FOR SELECT
            USING (
                store_id IN (
                    SELECT id FROM public.stores WHERE profile_id = auth.uid()
                )
            );
    END IF;
END $$;
