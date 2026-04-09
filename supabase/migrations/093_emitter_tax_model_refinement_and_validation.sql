-- ============================================================
-- Migration 093: Emitter tax model refinement and stronger
-- validation support for fiscal readiness.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_fiscal_profile_zip_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_zip_check
            CHECK (fiscal_zip_code IS NULL OR regexp_replace(fiscal_zip_code, '\D', '', 'g') ~ '^\d{8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_fiscal_profile_cnae_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_cnae_check
            CHECK (cnae_principal IS NULL OR cnae_principal ~ '^\d{4}-\d/\d{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'company_fiscal_profile_ie_basic_check'
    ) THEN
        ALTER TABLE public.company_fiscal_profile
            ADD CONSTRAINT company_fiscal_profile_ie_basic_check
            CHECK (
                inscricao_estadual IS NULL
                OR upper(inscricao_estadual) = 'ISENTO'
                OR length(regexp_replace(inscricao_estadual, '[^A-Za-z0-9]', '', 'g')) >= 2
            );
    END IF;
END $$;

ALTER TABLE public.emitter_federal_tax_config
    ADD COLUMN IF NOT EXISTS metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
DECLARE
    resolved_count INTEGER;
BEGIN
    UPDATE public.emitter_ibscbs_state_links AS link
       SET ibscbs_version_id = version_row.id
      FROM public.fiscal_ibscbs_base_versions AS version_row
     WHERE link.ibscbs_version_id IS NULL
       AND version_row.ibscbs_base_id = link.ibscbs_base_id
       AND version_row.status = 'active';

    SELECT COUNT(*) INTO resolved_count
      FROM public.emitter_ibscbs_state_links
     WHERE ibscbs_version_id IS NULL;

    IF resolved_count = 0 THEN
        ALTER TABLE public.emitter_ibscbs_state_links
            ALTER COLUMN ibscbs_version_id SET NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_emitter_ibscbs_state_links_version_id
    ON public.emitter_ibscbs_state_links (ibscbs_version_id);
