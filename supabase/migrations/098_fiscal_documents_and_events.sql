-- ============================================================
-- Migration 098: Fiscal Documents & Events Log
-- Stores emitted NF-e/NFC-e documents and audit trail
-- ============================================================

-- 1) Supabase Storage bucket for XMLs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fiscal-xml',
    'fiscal-xml',
    false,
    5242880, -- 5MB
    ARRAY['application/xml', 'text/xml', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2) fiscal_documents table
CREATE TABLE IF NOT EXISTS public.fiscal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    -- Document type
    document_model TEXT NOT NULL DEFAULT '55',
    document_status TEXT NOT NULL DEFAULT 'pending',
    -- Identification
    chave_acesso TEXT,
    numero_nf INTEGER NOT NULL,
    serie TEXT NOT NULL,
    natureza_operacao TEXT NOT NULL DEFAULT 'VENDA DE MERCADORIA',
    -- SEFAZ response
    protocolo_autorizacao TEXT,
    data_autorizacao TIMESTAMPTZ,
    codigo_status INTEGER,
    motivo_status TEXT,
    digest_value TEXT,
    -- Storage paths (Supabase Storage bucket: fiscal-xml)
    xml_envio_path TEXT,
    xml_retorno_path TEXT,
    xml_processado_path TEXT,
    danfe_path TEXT,
    -- Motor version and payload
    motor_version TEXT,
    fiscal_payload_jsonb JSONB,
    -- Totals (denormalized)
    valor_produtos NUMERIC(15,2),
    valor_total_nota NUMERIC(15,2),
    valor_icms NUMERIC(15,2),
    valor_st NUMERIC(15,2),
    valor_pis NUMERIC(15,2),
    valor_cofins NUMERIC(15,2),
    valor_ipi NUMERIC(15,2),
    valor_frete NUMERIC(15,2),
    valor_desconto NUMERIC(15,2),
    -- Ambiente
    ambiente TEXT NOT NULL DEFAULT 'homologacao',
    -- Audit
    emitted_by UUID REFERENCES auth.users(id),
    emitted_at TIMESTAMPTZ,
    -- Cancellation
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id),
    cancellation_protocol TEXT,
    cancellation_justificativa TEXT,
    -- Correction
    correction_count INTEGER NOT NULL DEFAULT 0,
    last_correction_at TIMESTAMPTZ,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_documents_model_check'
    ) THEN
        ALTER TABLE public.fiscal_documents
            ADD CONSTRAINT fiscal_documents_model_check
            CHECK (document_model IN ('55', '65'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_documents_status_check'
    ) THEN
        ALTER TABLE public.fiscal_documents
            ADD CONSTRAINT fiscal_documents_status_check
            CHECK (document_status IN (
                'pending', 'processing', 'authorized', 'denied',
                'cancelled', 'correction', 'inutilized', 'error'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_documents_ambiente_check'
    ) THEN
        ALTER TABLE public.fiscal_documents
            ADD CONSTRAINT fiscal_documents_ambiente_check
            CHECK (ambiente IN ('homologacao', 'producao'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_documents_chave_unique'
    ) THEN
        ALTER TABLE public.fiscal_documents
            ADD CONSTRAINT fiscal_documents_chave_unique
            UNIQUE (chave_acesso);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_documents_correction_limit'
    ) THEN
        ALTER TABLE public.fiscal_documents
            ADD CONSTRAINT fiscal_documents_correction_limit
            CHECK (correction_count >= 0 AND correction_count <= 20);
    END IF;
END $$;

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_order_id
    ON public.fiscal_documents(order_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status
    ON public.fiscal_documents(document_status);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_chave
    ON public.fiscal_documents(chave_acesso)
    WHERE chave_acesso IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_emitted_at
    ON public.fiscal_documents(emitted_at DESC)
    WHERE emitted_at IS NOT NULL;

-- 5) Updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_fiscal_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_documents_updated_at ON public.fiscal_documents;
CREATE TRIGGER trg_fiscal_documents_updated_at
    BEFORE UPDATE ON public.fiscal_documents
    FOR EACH ROW EXECUTE FUNCTION public.trg_fiscal_documents_updated_at();

-- 6) fiscal_events_log table
CREATE TABLE IF NOT EXISTS public.fiscal_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id UUID REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    -- Event
    event_type TEXT NOT NULL,
    event_status TEXT NOT NULL DEFAULT 'pending',
    -- Payloads
    request_summary_jsonb JSONB,
    response_summary_jsonb JSONB,
    -- SEFAZ
    sefaz_status_code INTEGER,
    sefaz_message TEXT,
    -- Error
    error_message TEXT,
    error_stack TEXT,
    -- Duration
    duration_ms INTEGER,
    -- Audit
    executed_by UUID REFERENCES auth.users(id),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) Event constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_events_type_check'
    ) THEN
        ALTER TABLE public.fiscal_events_log
            ADD CONSTRAINT fiscal_events_type_check
            CHECK (event_type IN (
                'calculation', 'validation', 'authorization',
                'cancellation', 'correction', 'inutilization',
                'consultation', 'status_check', 'danfe_generation'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_events_status_check'
    ) THEN
        ALTER TABLE public.fiscal_events_log
            ADD CONSTRAINT fiscal_events_status_check
            CHECK (event_status IN ('pending', 'success', 'failure', 'warning'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fiscal_events_document_id
    ON public.fiscal_events_log(fiscal_document_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_events_order_id
    ON public.fiscal_events_log(order_id)
    WHERE order_id IS NOT NULL;

-- 8) RLS Policies
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_events_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'fiscal_documents_admin_all'
    ) THEN
        CREATE POLICY fiscal_documents_admin_all ON public.fiscal_documents
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'manager')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'fiscal_events_admin_all'
    ) THEN
        CREATE POLICY fiscal_events_admin_all ON public.fiscal_events_log
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'manager')
                )
            );
    END IF;
END $$;

-- 9) Storage RLS for fiscal-xml bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'fiscal_xml_admin_select'
        AND tablename = 'objects'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY fiscal_xml_admin_select
            ON storage.objects FOR SELECT
            USING (
                bucket_id = 'fiscal-xml'
                AND EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'manager')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'fiscal_xml_service_insert'
        AND tablename = 'objects'
        AND schemaname = 'storage'
    ) THEN
        CREATE POLICY fiscal_xml_service_insert
            ON storage.objects FOR INSERT
            WITH CHECK (
                bucket_id = 'fiscal-xml'
                AND EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'manager')
                )
            );
    END IF;
END $$;
