-- ============================================================
-- Migration 096: Motor Fiscal — Database Gaps Resolution
-- Resolves architectural gaps identified in the fiscal audit
-- ============================================================

-- GAP-01: CNAE validation (must be 7 digits for NF-e)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'company_fiscal_profile_cnae_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_cnae_check
            CHECK (cnae_principal IS NULL OR cnae_principal ~ '^\d{7}$');
    END IF;
END $$;

-- GAP-02: Contingência justificativa (SEFAZ requires min 15 chars)
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS contingencia_justificativa TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cfe_contingencia_justificativa_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_contingencia_justificativa_check
            CHECK (
                contingencia_justificativa IS NULL
                OR LENGTH(TRIM(contingencia_justificativa)) >= 15
            );
    END IF;
END $$;

-- GAP-03: proximo_numero_nfce (consistent with NF-e numbering model)
ALTER TABLE public.company_fiscal_environment
    ADD COLUMN IF NOT EXISTS proximo_numero_nfce INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cfe_proximo_numero_nfce_check'
    ) THEN
        ALTER TABLE public.company_fiscal_environment
            ADD CONSTRAINT cfe_proximo_numero_nfce_check
            CHECK (proximo_numero_nfce >= 1);
    END IF;
END $$;

-- GAP-07: Backfill municipality_code with placeholder for addresses missing it
UPDATE public.store_addresses
   SET municipality_code = COALESCE(NULLIF(TRIM(COALESCE(municipality_code, '')), ''), '0000000')
 WHERE municipality_code IS NULL OR TRIM(municipality_code) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_addresses_ibge_format_check'
    ) THEN
        ALTER TABLE public.store_addresses
            ADD CONSTRAINT store_addresses_ibge_format_check
            CHECK (municipality_code IS NULL OR municipality_code ~ '^\d{7}$');
    END IF;
END $$;

-- GAP-08: country_code backfill + default enforcement
UPDATE public.store_addresses
   SET country_code = COALESCE(NULLIF(TRIM(COALESCE(country_code, '')), ''), '1058')
 WHERE country_code IS NULL OR TRIM(country_code) = '';

ALTER TABLE public.store_addresses
    ALTER COLUMN country_code SET DEFAULT '1058';
