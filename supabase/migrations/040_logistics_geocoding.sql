-- ============================================================
-- Migration 040: Logistics — Geocoding Infrastructure
-- ============================================================

-- ==================== GEOCODING COLUMNS IN store_addresses ====================
ALTER TABLE public.store_addresses
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocoding_source TEXT DEFAULT 'openrouteservice';

-- Spatial index for coordinate queries
CREATE INDEX IF NOT EXISTS idx_store_addresses_coords
  ON public.store_addresses(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ==================== LINK orders → store_addresses ====================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES public.store_addresses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shipping_address_id
  ON public.orders(shipping_address_id)
  WHERE shipping_address_id IS NOT NULL;
