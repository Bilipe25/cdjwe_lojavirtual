-- ============================================================
-- Migration 099: Transport Layer — Environment Column Additions
-- Adds natureza_operacao to company_fiscal_environment
-- and phone column to company_fiscal_profile
-- ============================================================

-- 1) Add natureza_operacao to company_fiscal_environment
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS natureza_operacao TEXT NOT NULL DEFAULT 'VENDA DE MERCADORIA';

-- 2) Add phone column to company_fiscal_profile (if missing)
--    Note: razao_social, nome_fantasia, fiscal_* fields already exist from migration 086
ALTER TABLE public.company_fiscal_profile
    ADD COLUMN IF NOT EXISTS phone TEXT;

