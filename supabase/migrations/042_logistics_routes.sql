-- ============================================================
-- Migration 042: Logistics — Routes, Stops, Events & Regions
-- ============================================================

-- ==================== ROUTE CENTERS (Centros de Distribuição) ====================
CREATE TABLE IF NOT EXISTS public.route_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT,
  zip_code TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one default center
CREATE OR REPLACE FUNCTION public.ensure_single_default_center()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.route_centers
    SET is_default = false, updated_at = NOW()
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_single_default_center ON public.route_centers;
CREATE TRIGGER trg_ensure_single_default_center
  BEFORE INSERT OR UPDATE ON public.route_centers
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_default_center();

DROP TRIGGER IF EXISTS update_route_centers_updated_at ON public.route_centers;
CREATE TRIGGER update_route_centers_updated_at
  BEFORE UPDATE ON public.route_centers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== DELIVERY REGIONS ====================
CREATE TABLE IF NOT EXISTS public.delivery_regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  cities JSONB NOT NULL DEFAULT '[]',
  states JSONB NOT NULL DEFAULT '[]',
  default_center_id UUID REFERENCES public.route_centers(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#3B82F6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_delivery_regions_updated_at ON public.delivery_regions;
CREATE TRIGGER update_delivery_regions_updated_at
  BEFORE UPDATE ON public.delivery_regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== DELIVERY ROUTES ====================
CREATE TABLE IF NOT EXISTS public.delivery_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'optimized', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  center_id UUID REFERENCES public.route_centers(id) ON DELETE SET NULL,
  region_id UUID REFERENCES public.delivery_regions(id) ON DELETE SET NULL,
  planned_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_distance_km NUMERIC(10,2),
  total_duration_min NUMERIC(10,2),
  total_stops INTEGER NOT NULL DEFAULT 0,
  total_weight_kg NUMERIC(10,2),
  optimization_result JSONB,
  route_polyline TEXT,
  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate route numbers (ROT000001, ROT000002, ...)
CREATE OR REPLACE FUNCTION public.generate_route_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(route_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM public.delivery_routes;

  NEW.route_number := 'ROT' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_route_number ON public.delivery_routes;
CREATE TRIGGER set_route_number
  BEFORE INSERT ON public.delivery_routes
  FOR EACH ROW
  WHEN (NEW.route_number IS NULL OR NEW.route_number = '')
  EXECUTE FUNCTION public.generate_route_number();

DROP TRIGGER IF EXISTS update_delivery_routes_updated_at ON public.delivery_routes;
CREATE TRIGGER update_delivery_routes_updated_at
  BEFORE UPDATE ON public.delivery_routes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_delivery_routes_status
  ON public.delivery_routes(status);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_planned_date
  ON public.delivery_routes(planned_date DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_driver_id
  ON public.delivery_routes(driver_id);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_created_by
  ON public.delivery_routes(created_by);

-- ==================== DELIVERY ROUTE STOPS ====================
CREATE TABLE IF NOT EXISTS public.delivery_route_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  address_id UUID REFERENCES public.store_addresses(id) ON DELETE SET NULL,
  stop_position INTEGER NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  address_snapshot TEXT,
  customer_name TEXT,
  eta TIMESTAMPTZ,
  estimated_service_min NUMERIC(5,1) NOT NULL DEFAULT 15,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'arrived', 'delivered', 'failed', 'skipped')),
  delivered_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_route_id
  ON public.delivery_route_stops(route_id);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_order_id
  ON public.delivery_route_stops(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_status
  ON public.delivery_route_stops(status);

DROP TRIGGER IF EXISTS update_delivery_route_stops_updated_at ON public.delivery_route_stops;
CREATE TRIGGER update_delivery_route_stops_updated_at
  BEFORE UPDATE ON public.delivery_route_stops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== ROUTE EVENTS (Auditoria) ====================
CREATE TABLE IF NOT EXISTS public.route_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id UUID NOT NULL REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES public.delivery_route_stops(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'route_created', 'route_optimized', 'route_confirmed',
      'route_started', 'route_completed', 'route_cancelled',
      'route_reoptimized', 'stop_reordered',
      'stop_arrived', 'stop_delivered', 'stop_failed', 'stop_skipped',
      'driver_assigned', 'vehicle_assigned', 'notes_updated'
    )),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_events_route_id
  ON public.route_events(route_id);

CREATE INDEX IF NOT EXISTS idx_route_events_event_type
  ON public.route_events(event_type);

-- ==================== RLS ====================
ALTER TABLE public.route_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_events ENABLE ROW LEVEL SECURITY;

-- Route centers: admin full, drivers read
CREATE POLICY "Admins can manage route centers"
  ON public.route_centers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Drivers can view route centers"
  ON public.route_centers FOR SELECT USING (public.is_driver());

-- Delivery regions: admin full, drivers read
CREATE POLICY "Admins can manage delivery regions"
  ON public.delivery_regions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Drivers can view delivery regions"
  ON public.delivery_regions FOR SELECT USING (public.is_driver());

-- Delivery routes: admin full, drivers own routes
CREATE POLICY "Admins can manage delivery routes"
  ON public.delivery_routes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Drivers can view own routes"
  ON public.delivery_routes FOR SELECT
  USING (
    public.is_driver()
    AND driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
  );
CREATE POLICY "Drivers can update own routes"
  ON public.delivery_routes FOR UPDATE
  USING (
    public.is_driver()
    AND driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
  );

-- Route stops: admin full, drivers own route stops
CREATE POLICY "Admins can manage route stops"
  ON public.delivery_route_stops FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Drivers can view own route stops"
  ON public.delivery_route_stops FOR SELECT
  USING (
    public.is_driver()
    AND route_id IN (
      SELECT dr.id FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
    )
  );
CREATE POLICY "Drivers can update own route stops"
  ON public.delivery_route_stops FOR UPDATE
  USING (
    public.is_driver()
    AND route_id IN (
      SELECT dr.id FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
    )
  );

-- Route events: admin full, drivers own route events
CREATE POLICY "Admins can manage route events"
  ON public.route_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Drivers can view own route events"
  ON public.route_events FOR SELECT
  USING (
    public.is_driver()
    AND route_id IN (
      SELECT dr.id FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
    )
  );
CREATE POLICY "Drivers can insert route events"
  ON public.route_events FOR INSERT
  WITH CHECK (
    public.is_driver()
    AND route_id IN (
      SELECT dr.id FROM public.delivery_routes dr
      JOIN public.drivers d ON d.id = dr.driver_id
      WHERE d.profile_id = auth.uid()
    )
  );
