-- ============================================================
-- Migration 051: Logistics V1 - Driver live tracking (MVP)
-- - Last known location per route + driver
-- - Realtime-ready table for admin map updates
-- - RLS to enforce driver-route ownership
-- ============================================================

CREATE TABLE IF NOT EXISTS public.driver_live_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  latitude NUMERIC(10,7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(10,7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy_m NUMERIC(8,2),
  speed_kmh NUMERIC(8,2),
  heading_deg NUMERIC(6,2),
  tracking_status TEXT NOT NULL DEFAULT 'active'
    CHECK (tracking_status IN ('awaiting_permission', 'active', 'paused', 'unavailable', 'offline', 'stopped')),
  source TEXT NOT NULL DEFAULT 'pwa_geolocation',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(route_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_live_locations_route_seen
  ON public.driver_live_locations(route_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_live_locations_driver_seen
  ON public.driver_live_locations(driver_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_live_locations_status
  ON public.driver_live_locations(tracking_status, last_seen_at DESC);

DROP TRIGGER IF EXISTS update_driver_live_locations_updated_at ON public.driver_live_locations;
CREATE TRIGGER update_driver_live_locations_updated_at
  BEFORE UPDATE ON public.driver_live_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.driver_live_locations REPLICA IDENTITY FULL;
ALTER TABLE public.driver_live_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage driver live locations" ON public.driver_live_locations;
CREATE POLICY "Admins can manage driver live locations"
  ON public.driver_live_locations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Drivers can view own live locations" ON public.driver_live_locations;
CREATE POLICY "Drivers can view own live locations"
  ON public.driver_live_locations FOR SELECT
  USING (
    public.is_driver()
    AND driver_id IN (
      SELECT d.id
      FROM public.drivers d
      WHERE d.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Drivers can insert own active live locations" ON public.driver_live_locations;
CREATE POLICY "Drivers can insert own active live locations"
  ON public.driver_live_locations FOR INSERT
  WITH CHECK (
    public.is_driver()
    AND driver_id IN (
      SELECT d.id
      FROM public.drivers d
      WHERE d.profile_id = auth.uid()
    )
    AND route_id IN (
      SELECT dr.id
      FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
        AND dr.status IN ('confirmed', 'in_progress')
    )
  );

DROP POLICY IF EXISTS "Drivers can update own active live locations" ON public.driver_live_locations;
CREATE POLICY "Drivers can update own active live locations"
  ON public.driver_live_locations FOR UPDATE
  USING (
    public.is_driver()
    AND driver_id IN (
      SELECT d.id
      FROM public.drivers d
      WHERE d.profile_id = auth.uid()
    )
    AND route_id IN (
      SELECT dr.id
      FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
        AND dr.status IN ('confirmed', 'in_progress')
    )
  )
  WITH CHECK (
    public.is_driver()
    AND driver_id IN (
      SELECT d.id
      FROM public.drivers d
      WHERE d.profile_id = auth.uid()
    )
    AND route_id IN (
      SELECT dr.id
      FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
        AND dr.status IN ('confirmed', 'in_progress')
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'driver_live_locations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_live_locations;
    END IF;
  END IF;
END $$;
