-- ============================================================
-- CDJWE B2B System — Customer Management Evolution
-- Migration 004
-- ============================================================

-- ==================== CUSTOMER TYPES ====================
CREATE TABLE IF NOT EXISTS public.customer_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default customer types
INSERT INTO public.customer_types (name, slug, description, sort_order) VALUES
  ('Varejista', 'varejista', 'Cliente varejista', 1),
  ('Consumidor Final', 'consumidor-final', 'Consumidor final pessoa física ou jurídica', 2),
  ('Representante', 'representante', 'Representante comercial', 3),
  ('Revendedor', 'revendedor', 'Revendedor autorizado', 4),
  ('Outros', 'outros', 'Outros tipos de cliente', 5);

-- ==================== ADD customer_type_id TO STORES ====================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS customer_type_id UUID REFERENCES public.customer_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_customer_type_id ON public.stores(customer_type_id);

-- ==================== EXPAND PROFILES STATUS CHECK ====================
-- Drop and recreate the CHECK constraint to include 'imported'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'blocked', 'imported'));

-- ==================== ADD customer_type_id TO PRICE TABLES ====================
ALTER TABLE public.price_tables
  ADD COLUMN IF NOT EXISTS customer_type_id UUID REFERENCES public.customer_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_price_tables_customer_type_id ON public.price_tables(customer_type_id);

-- ==================== CUSTOMER LOGIN AUDIT ====================
CREATE TABLE IF NOT EXISTS public.customer_login_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_login_audit_profile_id ON public.customer_login_audit(profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_login_audit_created_at ON public.customer_login_audit(created_at DESC);

-- ==================== UPDATED_AT TRIGGER FOR customer_types ====================
CREATE TRIGGER update_customer_types_updated_at
  BEFORE UPDATE ON public.customer_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS ====================

-- CUSTOMER TYPES
ALTER TABLE public.customer_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view active customer types"
  ON public.customer_types FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage customer types"
  ON public.customer_types FOR ALL
  USING (public.is_admin());

-- CUSTOMER LOGIN AUDIT
ALTER TABLE public.customer_login_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all login audit"
  ON public.customer_login_audit FOR SELECT
  USING (public.is_admin());
CREATE POLICY "Admins can insert login audit"
  ON public.customer_login_audit FOR INSERT
  WITH CHECK (public.is_admin());
-- Allow the system (service role / triggers) to insert records too
-- Service role bypasses RLS, so authenticated inserts from server actions will work
CREATE POLICY "Users can insert own login audit"
  ON public.customer_login_audit FOR INSERT
  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can view own login audit"
  ON public.customer_login_audit FOR SELECT
  USING (profile_id = auth.uid());
