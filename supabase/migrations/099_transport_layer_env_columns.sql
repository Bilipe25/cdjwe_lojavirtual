-- ============================================================
-- Migration 099: Transport Layer — Environment Column Additions
-- Adds natureza_operacao to company_fiscal_environment
-- and razao_social/address fields to company_fiscal_profile
-- ============================================================

-- 1) Add natureza_operacao to company_fiscal_environment
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS natureza_operacao TEXT NOT NULL DEFAULT 'VENDA DE MERCADORIA';

-- 2) Add razao_social and address fields to company_fiscal_profile
--    (needed for NFe XML emitter section)
ALTER TABLE public.company_fiscal_profile
    ADD COLUMN IF NOT EXISTS razao_social TEXT,
    ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_street TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_number TEXT DEFAULT 'S/N',
    ADD COLUMN IF NOT EXISTS fiscal_complement TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_neighborhood TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_city TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_zip_code TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT;

-- 3) Backfill razao_social from company_name if available
UPDATE public.company_fiscal_profile
   SET razao_social = COALESCE(razao_social, company_name, 'EMPRESA NAO INFORMADA')
 WHERE razao_social IS NULL;
