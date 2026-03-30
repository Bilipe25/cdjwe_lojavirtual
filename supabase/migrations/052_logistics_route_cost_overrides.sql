-- ============================================================
-- Migration 052: Route cost overrides (per-route custom costs)
-- - Allows overriding global logistics cost settings per route
-- - Keeps global settings as fallback/default source
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_route_cost_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  fuel_price_per_liter NUMERIC(10, 2) CHECK (fuel_price_per_liter >= 0),
  fuel_tax_pct NUMERIC(6, 3) CHECK (fuel_tax_pct >= 0),
  additional_tax NUMERIC(10, 2) CHECK (additional_tax >= 0),
  daily_rate NUMERIC(10, 2) CHECK (daily_rate >= 0),
  consumption_km_l NUMERIC(8, 3) CHECK (consumption_km_l >= 0),
  notes TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_route_cost_overrides_route_unique UNIQUE (route_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_cost_overrides_route_id
  ON public.delivery_route_cost_overrides(route_id);

DROP TRIGGER IF EXISTS update_delivery_route_cost_overrides_updated_at ON public.delivery_route_cost_overrides;
CREATE TRIGGER update_delivery_route_cost_overrides_updated_at
  BEFORE UPDATE ON public.delivery_route_cost_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.delivery_route_cost_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage route cost overrides" ON public.delivery_route_cost_overrides;
CREATE POLICY "Admins can manage route cost overrides"
  ON public.delivery_route_cost_overrides FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
