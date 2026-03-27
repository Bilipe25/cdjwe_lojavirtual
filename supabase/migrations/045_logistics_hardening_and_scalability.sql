-- ============================================================
-- Migration 045: Logistics hardening and scalability
-- - Concurrency-safe route number generation
-- - Stop ordering normalization and integrity constraints
-- - Indexes for heavy operational queries
-- ============================================================

-- ==================== ROUTE NUMBER SEQUENCE (RACE SAFE) ====================
CREATE SEQUENCE IF NOT EXISTS public.delivery_route_number_seq;

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(route_number FROM 4) AS BIGINT)), 0)
    INTO v_max
    FROM public.delivery_routes
    WHERE route_number ~ '^ROT[0-9]+$';

  IF v_max > 0 THEN
    PERFORM setval('public.delivery_route_number_seq', v_max, true);
  ELSE
    PERFORM setval('public.delivery_route_number_seq', 1, false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_route_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.route_number IS NULL OR NEW.route_number = '' THEN
    NEW.route_number := 'ROT' || LPAD(nextval('public.delivery_route_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==================== STOP POSITION NORMALIZATION ====================
WITH normalized_positions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY route_id
      ORDER BY
        CASE WHEN stop_position IS NULL OR stop_position < 1 THEN 2147483647 ELSE stop_position END,
        created_at,
        id
    ) AS normalized_position
  FROM public.delivery_route_stops
)
UPDATE public.delivery_route_stops s
SET stop_position = n.normalized_position
FROM normalized_positions n
WHERE n.id = s.id
  AND s.stop_position IS DISTINCT FROM n.normalized_position;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_route_stops_stop_position_positive'
  ) THEN
    ALTER TABLE public.delivery_route_stops
      ADD CONSTRAINT delivery_route_stops_stop_position_positive
      CHECK (stop_position > 0);
  END IF;
END $$;

-- Create unique index only when no duplicates exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT route_id, stop_position
      FROM public.delivery_route_stops
      GROUP BY route_id, stop_position
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_route_stops_route_position_unique
      ON public.delivery_route_stops(route_id, stop_position);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT route_id, order_id
      FROM public.delivery_route_stops
      GROUP BY route_id, order_id
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_route_stops_route_order_unique
      ON public.delivery_route_stops(route_id, order_id);
  END IF;
END $$;

-- ==================== OPERATIONAL QUERY INDEXES ====================
CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_route_position
  ON public.delivery_route_stops(route_id, stop_position);

CREATE INDEX IF NOT EXISTS idx_delivery_route_stops_order_route
  ON public.delivery_route_stops(order_id, route_id);

CREATE INDEX IF NOT EXISTS idx_route_events_route_created_at_desc
  ON public.route_events(route_id, created_at DESC);
