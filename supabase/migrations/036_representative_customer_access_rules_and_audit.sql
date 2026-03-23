-- ============================================================
-- Migration 036: Representative Customer Access Rules and Audit
-- ============================================================

CREATE TABLE IF NOT EXISTS public.representative_customer_access_rules (
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  reason TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (representative_id, store_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'representative_customer_access_rules_decision_check'
  ) THEN
    ALTER TABLE public.representative_customer_access_rules
      ADD CONSTRAINT representative_customer_access_rules_decision_check
      CHECK (decision IN ('allow', 'deny'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rep_customer_access_rules_rep
  ON public.representative_customer_access_rules(representative_id);

CREATE INDEX IF NOT EXISTS idx_rep_customer_access_rules_store
  ON public.representative_customer_access_rules(store_id);

DROP TRIGGER IF EXISTS update_representative_customer_access_rules_updated_at
  ON public.representative_customer_access_rules;
CREATE TRIGGER update_representative_customer_access_rules_updated_at
  BEFORE UPDATE ON public.representative_customer_access_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.representative_customer_access_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_customer_access_rules'
      AND policyname = 'Admins can manage representative customer access rules'
  ) THEN
    CREATE POLICY "Admins can manage representative customer access rules"
      ON public.representative_customer_access_rules
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
      AND tablename = 'representative_customer_access_rules'
      AND policyname = 'Representatives can view own customer access rules'
  ) THEN
    CREATE POLICY "Representatives can view own customer access rules"
      ON public.representative_customer_access_rules
      FOR SELECT
      USING (representative_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.representative_customer_access_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  before_state JSONB,
  after_state JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_customer_access_audit_rep_created
  ON public.representative_customer_access_audit_logs(representative_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_customer_access_audit_event
  ON public.representative_customer_access_audit_logs(event_type);

ALTER TABLE public.representative_customer_access_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_customer_access_audit_logs'
      AND policyname = 'Admins can manage representative customer access audit logs'
  ) THEN
    CREATE POLICY "Admins can manage representative customer access audit logs"
      ON public.representative_customer_access_audit_logs
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
      AND tablename = 'representative_customer_access_audit_logs'
      AND policyname = 'Representatives can view own customer access audit logs'
  ) THEN
    CREATE POLICY "Representatives can view own customer access audit logs"
      ON public.representative_customer_access_audit_logs
      FOR SELECT
      USING (representative_id = auth.uid() OR public.is_admin());
  END IF;
END $$;
