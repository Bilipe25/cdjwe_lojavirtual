-- Ensure singleton settings/fiscal tables keep only the latest record
-- and prevent future drift between UI and backend loaders.

DO $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
    FROM public.system_settings
  )
  DELETE FROM public.system_settings s
  USING ranked
  WHERE s.id = ranked.id
    AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_singleton_idx
  ON public.system_settings ((true));

DO $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
    FROM public.company_fiscal_profile
  )
  DELETE FROM public.company_fiscal_profile p
  USING ranked
  WHERE p.id = ranked.id
    AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS company_fiscal_profile_singleton_idx
  ON public.company_fiscal_profile ((true));

DO $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
    FROM public.company_fiscal_environment
  )
  DELETE FROM public.company_fiscal_environment e
  USING ranked
  WHERE e.id = ranked.id
    AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS company_fiscal_environment_singleton_idx
  ON public.company_fiscal_environment ((true));

DO $$
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
    FROM public.company_certificate_config
  )
  DELETE FROM public.company_certificate_config c
  USING ranked
  WHERE c.id = ranked.id
    AND ranked.rn > 1;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS company_certificate_config_singleton_idx
  ON public.company_certificate_config ((true));
