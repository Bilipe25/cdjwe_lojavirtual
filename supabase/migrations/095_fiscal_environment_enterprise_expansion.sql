-- ============================================================
-- Migration 095: Fiscal environment enterprise expansion
-- Adds NFC-e configuration, reference code, taxes/freight
-- toggles, and uses parametros_jsonb for item info & notes.
-- ============================================================

-- 1) Invoice configuration columns
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS max_itens_por_nota INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS ultima_nota_nfe INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS serie_nfce TEXT NOT NULL DEFAULT '0',
    ADD COLUMN IF NOT EXISTS nota_inicial_nfce INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS ultima_nota_nfce INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS csc_id_nfce TEXT,
    ADD COLUMN IF NOT EXISTS csc_numero_nfce TEXT;

-- 2) Reference code on invoice
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS codigo_referencia_nota TEXT NOT NULL DEFAULT 'codigo_interno';

-- 3) Tax and freight toggles
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS desconto_impostos_prazo BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS bloquear_retorno_parcial_remessa BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS icms_base_pis_cofins BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS frete_base_icms BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS modalidade_frete_padrao TEXT NOT NULL DEFAULT 'destinatario';

-- 4) Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cfe_max_itens_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_max_itens_check
            CHECK (max_itens_por_nota >= 1 AND max_itens_por_nota <= 990);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cfe_serie_nfce_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_serie_nfce_check
            CHECK (serie_nfce ~ '^\d{1,3}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cfe_nota_inicial_nfce_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_nota_inicial_nfce_check
            CHECK (nota_inicial_nfce >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cfe_codigo_referencia_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_codigo_referencia_check
            CHECK (codigo_referencia_nota IN (
                'codigo_barras',
                'codigo_fabricante',
                'codigo_erp',
                'codigo_interno'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cfe_modalidade_frete_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_modalidade_frete_check
            CHECK (modalidade_frete_padrao IN (
                'emitente',
                'destinatario',
                'terceiros',
                'proprio_remetente',
                'proprio_destinatario',
                'sem_frete'
            ));
    END IF;
END $$;
