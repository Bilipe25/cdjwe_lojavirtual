-- ============================================================
-- Migration 043: Logistics Optimization Columns
-- Adds missing columns for route optimization engine tracking
-- and per-stop ETA/distance persistence.
-- ============================================================

-- =========================
-- delivery_routes
-- =========================
ALTER TABLE delivery_routes
  ADD COLUMN IF NOT EXISTS optimization_engine text;

COMMENT ON COLUMN delivery_routes.optimization_engine
  IS 'Engine used for last optimization: osrm_nn, ors_vroom, etc.';

-- =========================
-- delivery_route_stops
-- =========================
ALTER TABLE delivery_route_stops
  ADD COLUMN IF NOT EXISTS estimated_arrival_min integer,
  ADD COLUMN IF NOT EXISTS estimated_distance_km numeric(10,2);

COMMENT ON COLUMN delivery_route_stops.estimated_arrival_min
  IS 'Estimated arrival time in minutes from route start, set by optimizer.';
COMMENT ON COLUMN delivery_route_stops.estimated_distance_km
  IS 'Cumulative distance in km from depot to this stop, set by optimizer.';

-- Index for quick stop ordering by ETA
CREATE INDEX IF NOT EXISTS idx_route_stops_eta
  ON delivery_route_stops (route_id, estimated_arrival_min)
  WHERE estimated_arrival_min IS NOT NULL;
