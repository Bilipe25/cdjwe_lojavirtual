-- ============================================================
-- Migration 041: Logistics — Vehicles & Drivers
-- ============================================================

-- ==================== PROFILE ROLE: ADD driver ====================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'client', 'representative', 'driver'));

-- Helper function: check if user is driver
CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'driver'
      AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== VEHICLES ====================
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plate TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'van'
    CHECK (type IN ('van', 'truck', 'motorcycle', 'car', 'other')),
  capacity_kg NUMERIC(10,2),
  capacity_m3 NUMERIC(10,2),
  max_stops INTEGER,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'in_use', 'maintenance', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_unique
  ON public.vehicles(plate);

CREATE INDEX IF NOT EXISTS idx_vehicles_status
  ON public.vehicles(status);

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== DRIVERS ====================
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone TEXT,
  license_number TEXT,
  default_vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'on_route', 'off_duty', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

CREATE INDEX IF NOT EXISTS idx_drivers_status
  ON public.drivers(status);

CREATE INDEX IF NOT EXISTS idx_drivers_profile_id
  ON public.drivers(profile_id);

DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== RLS ====================
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Vehicles: admin full access
CREATE POLICY "Admins can manage vehicles"
  ON public.vehicles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Vehicles: drivers can view available
CREATE POLICY "Drivers can view vehicles"
  ON public.vehicles FOR SELECT
  USING (public.is_driver());

-- Drivers: admin full access
CREATE POLICY "Admins can manage drivers"
  ON public.drivers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Drivers: driver can view own record
CREATE POLICY "Drivers can view own record"
  ON public.drivers FOR SELECT
  USING (profile_id = auth.uid());
