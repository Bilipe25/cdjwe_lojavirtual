-- ============================================================
-- Migration 035: Representative Customer Access Policies
-- ============================================================

CREATE TABLE IF NOT EXISTS public.representative_customer_access_policies (
  representative_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope_mode TEXT NOT NULL DEFAULT 'assigned_only',
  allowed_states TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  allowed_cities TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'representative_customer_access_scope_mode_check'
  ) THEN
    ALTER TABLE public.representative_customer_access_policies
      ADD CONSTRAINT representative_customer_access_scope_mode_check
      CHECK (scope_mode IN ('assigned_only', 'all_admin_portfolio', 'filtered_portfolio'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rep_customer_access_scope_mode
  ON public.representative_customer_access_policies(scope_mode);

DROP TRIGGER IF EXISTS update_representative_customer_access_policies_updated_at
  ON public.representative_customer_access_policies;
CREATE TRIGGER update_representative_customer_access_policies_updated_at
  BEFORE UPDATE ON public.representative_customer_access_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.representative_customer_access_policies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_customer_access_policies'
      AND policyname = 'Admins can manage representative customer access policies'
  ) THEN
    CREATE POLICY "Admins can manage representative customer access policies"
      ON public.representative_customer_access_policies
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
      AND tablename = 'representative_customer_access_policies'
      AND policyname = 'Representatives can view own customer access policies'
  ) THEN
    CREATE POLICY "Representatives can view own customer access policies"
      ON public.representative_customer_access_policies
      FOR SELECT
      USING (representative_id = auth.uid() OR public.is_admin());
  END IF;
END $$;
