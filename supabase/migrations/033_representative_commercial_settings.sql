-- ============================================================
-- Migration 033: Representative Commercial Settings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.representative_commercial_settings (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_discount_percentage NUMERIC(5,2),
  allow_free_negotiation BOOLEAN NOT NULL DEFAULT true,
  can_override_price_table BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'representative_commercial_settings_max_discount_check'
  ) THEN
    ALTER TABLE public.representative_commercial_settings
      ADD CONSTRAINT representative_commercial_settings_max_discount_check
      CHECK (
        max_discount_percentage IS NULL
        OR (max_discount_percentage >= 0 AND max_discount_percentage <= 100)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.representative_price_tables (
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (representative_id, price_table_id)
);

CREATE INDEX IF NOT EXISTS idx_representative_price_tables_representative
  ON public.representative_price_tables(representative_id);

CREATE INDEX IF NOT EXISTS idx_representative_price_tables_price_table
  ON public.representative_price_tables(price_table_id);

DROP TRIGGER IF EXISTS update_representative_commercial_settings_updated_at
  ON public.representative_commercial_settings;
CREATE TRIGGER update_representative_commercial_settings_updated_at
  BEFORE UPDATE ON public.representative_commercial_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.representative_commercial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_price_tables ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_commercial_settings'
      AND policyname = 'Admins can manage representative commercial settings'
  ) THEN
    CREATE POLICY "Admins can manage representative commercial settings"
      ON public.representative_commercial_settings
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_commercial_settings'
      AND policyname = 'Representatives can view own commercial settings'
  ) THEN
    CREATE POLICY "Representatives can view own commercial settings"
      ON public.representative_commercial_settings
      FOR SELECT
      USING (profile_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_price_tables'
      AND policyname = 'Admins can manage representative price tables'
  ) THEN
    CREATE POLICY "Admins can manage representative price tables"
      ON public.representative_price_tables
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_price_tables'
      AND policyname = 'Representatives can view own price tables'
  ) THEN
    CREATE POLICY "Representatives can view own price tables"
      ON public.representative_price_tables
      FOR SELECT
      USING (representative_id = auth.uid() OR public.is_admin());
  END IF;
END $$;
