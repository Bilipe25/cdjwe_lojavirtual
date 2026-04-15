-- ============================================================
-- Migration 104: Fiscal Transport Hardening
-- - Idempotent emission lock per order/model
-- - Atomic fiscal number reservation
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_documents_active_order_model
    ON public.fiscal_documents(order_id, document_model)
    WHERE document_status IN ('pending', 'processing', 'authorized');

DROP FUNCTION IF EXISTS public.reserve_fiscal_document_emission(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.reserve_fiscal_document_emission(
    p_order_id UUID,
    p_document_model TEXT
)
RETURNS TABLE(
    reserved BOOLEAN,
    environment_id UUID,
    ambiente TEXT,
    serie TEXT,
    numero INTEGER,
    existing_document_id UUID,
    existing_document_status TEXT,
    existing_chave_acesso TEXT,
    existing_protocolo TEXT,
    existing_data_autorizacao TIMESTAMPTZ,
    existing_codigo_status INTEGER,
    existing_motivo_status TEXT,
    existing_xml_processado_path TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_env public.company_fiscal_environment%ROWTYPE;
    v_existing public.fiscal_documents%ROWTYPE;
    v_number_field TEXT;
BEGIN
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'order_id e obrigatorio.';
    END IF;

    IF p_document_model NOT IN ('55', '65') THEN
        RAISE EXCEPTION 'Modelo fiscal invalido: %.', COALESCE(p_document_model, 'null');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_order_id::TEXT || ':' || p_document_model));

    SELECT *
      INTO v_existing
      FROM public.fiscal_documents
     WHERE order_id = p_order_id
       AND document_model = p_document_model
       AND document_status IN ('pending', 'processing', 'authorized')
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            FALSE,
            NULL::UUID,
            v_existing.ambiente,
            v_existing.serie,
            v_existing.numero_nf,
            v_existing.id,
            v_existing.document_status,
            v_existing.chave_acesso,
            v_existing.protocolo_autorizacao,
            v_existing.data_autorizacao,
            v_existing.codigo_status,
            v_existing.motivo_status,
            v_existing.xml_processado_path;
        RETURN;
    END IF;

    SELECT *
      INTO v_env
      FROM public.company_fiscal_environment
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ambiente fiscal nao configurado.';
    END IF;

    v_number_field := CASE WHEN p_document_model = '55' THEN 'proximo_numero_nfe' ELSE 'proximo_numero_nfce' END;

    IF p_document_model = '55' THEN
        IF COALESCE(v_env.serie_nfe, v_env.serie_padrao_nfe) IS NULL OR COALESCE(v_env.proximo_numero_nfe, 0) <= 0 THEN
            RAISE EXCEPTION 'Serie/numero NF-e nao configurados.';
        END IF;

        UPDATE public.company_fiscal_environment
           SET proximo_numero_nfe = v_env.proximo_numero_nfe + 1
         WHERE id = v_env.id;

        RETURN QUERY
        SELECT
            TRUE,
            v_env.id,
            CASE WHEN v_env.ambiente = 'producao' THEN 'producao' ELSE 'homologacao' END,
            COALESCE(v_env.serie_nfe, v_env.serie_padrao_nfe),
            v_env.proximo_numero_nfe,
            NULL::UUID,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TIMESTAMPTZ,
            NULL::INTEGER,
            NULL::TEXT,
            NULL::TEXT;
        RETURN;
    END IF;

    IF COALESCE(v_env.serie_nfce, '') = '' OR COALESCE(v_env.proximo_numero_nfce, 0) <= 0 THEN
        RAISE EXCEPTION 'Serie/numero NFC-e nao configurados.';
    END IF;

    UPDATE public.company_fiscal_environment
       SET proximo_numero_nfce = v_env.proximo_numero_nfce + 1
     WHERE id = v_env.id;

    RETURN QUERY
    SELECT
        TRUE,
        v_env.id,
        CASE WHEN v_env.ambiente = 'producao' THEN 'producao' ELSE 'homologacao' END,
        v_env.serie_nfce,
        v_env.proximo_numero_nfce,
        NULL::UUID,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ,
        NULL::INTEGER,
        NULL::TEXT,
        NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_fiscal_document_emission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_fiscal_document_emission(UUID, TEXT) TO authenticated, service_role;
