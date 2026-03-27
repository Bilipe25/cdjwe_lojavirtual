-- ============================================================
-- Migration 047: Logistics P1 - Batch Updates + API Cache
-- Goal:
-- - Add durable cache table for directions/matrix/optimize signatures
-- - Replace N+1 stop updates with SQL batch RPCs
-- ============================================================

-- ==================== LOGISTICS API CACHE ====================

CREATE TABLE IF NOT EXISTS public.logistics_api_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_namespace TEXT NOT NULL
    CHECK (cache_namespace IN ('directions', 'matrix', 'optimize')),
  signature_hash TEXT NOT NULL,
  request_signature JSONB NOT NULL,
  response_payload JSONB NOT NULL,
  ttl_seconds INTEGER NOT NULL CHECK (ttl_seconds > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cache_namespace, signature_hash)
);

CREATE INDEX IF NOT EXISTS idx_logistics_api_cache_expires_at
  ON public.logistics_api_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_logistics_api_cache_namespace_expires
  ON public.logistics_api_cache(cache_namespace, expires_at);

DROP TRIGGER IF EXISTS update_logistics_api_cache_updated_at ON public.logistics_api_cache;
CREATE TRIGGER update_logistics_api_cache_updated_at
  BEFORE UPDATE ON public.logistics_api_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.logistics_api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage logistics api cache" ON public.logistics_api_cache;
CREATE POLICY "Service role can manage logistics api cache"
  ON public.logistics_api_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can view logistics api cache" ON public.logistics_api_cache;
CREATE POLICY "Admins can view logistics api cache"
  ON public.logistics_api_cache FOR SELECT
  USING (public.is_admin());

-- ==================== BATCH UPDATE STOP METRICS ====================

CREATE OR REPLACE FUNCTION public.logistics_batch_update_stop_metrics_atomic(
  p_stop_updates JSONB
)
RETURNS TABLE (
  updated_stops INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_updated_count INTEGER := 0;
BEGIN
  v_auth_user := auth.uid();
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_stop_updates IS NULL
    OR jsonb_typeof(p_stop_updates) <> 'array'
    OR jsonb_array_length(p_stop_updates) = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  WITH payload AS (
    SELECT
      NULLIF(item->>'id', '')::UUID AS stop_id,
      COALESCE((item->>'estimated_distance_km')::NUMERIC, 0)::NUMERIC AS estimated_distance_km,
      GREATEST(COALESCE((item->>'estimated_arrival_min')::NUMERIC, 0), 0)::INTEGER AS estimated_arrival_min
    FROM jsonb_array_elements(p_stop_updates) AS item
  ),
  valid_payload AS (
    SELECT *
    FROM payload
    WHERE stop_id IS NOT NULL
  ),
  updated AS (
    UPDATE public.delivery_route_stops s
    SET
      estimated_distance_km = ROUND(GREATEST(vp.estimated_distance_km, 0), 2),
      estimated_arrival_min = vp.estimated_arrival_min
    FROM valid_payload vp
    WHERE s.id = vp.stop_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RETURN QUERY SELECT v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_batch_update_stop_metrics_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_batch_update_stop_metrics_atomic(JSONB) TO authenticated, service_role;

-- ==================== BATCH REORDER + METRICS + ROUTE SUMMARY ====================

CREATE OR REPLACE FUNCTION public.logistics_apply_optimization_result_atomic(
  p_route_id UUID,
  p_ordered_stops JSONB,
  p_total_distance_km NUMERIC,
  p_total_duration_min NUMERIC,
  p_total_stops INTEGER,
  p_engine TEXT DEFAULT NULL,
  p_polyline TEXT DEFAULT NULL,
  p_optimization_result JSONB DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  updated_stops INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_current_status TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  v_auth_user := auth.uid();
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_route_id IS NULL THEN
    RAISE EXCEPTION 'route_id obrigatorio.';
  END IF;

  IF p_ordered_stops IS NULL
    OR jsonb_typeof(p_ordered_stops) <> 'array'
    OR jsonb_array_length(p_ordered_stops) = 0 THEN
    RAISE EXCEPTION 'ordered_stops obrigatorio e nao pode ser vazio.';
  END IF;

  SELECT r.status
  INTO v_current_status
  FROM public.delivery_routes r
  WHERE r.id = p_route_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota nao encontrada.';
  END IF;

  IF v_current_status IN ('completed', 'cancelled', 'in_progress') THEN
    RAISE EXCEPTION 'Nao e permitido aplicar otimizacao para rota em status %.', v_current_status;
  END IF;

  WITH payload AS (
    SELECT
      NULLIF(item->>'id', '')::UUID AS stop_id,
      (COALESCE((item->>'position')::INTEGER, 0) + 1) AS stop_position,
      ROUND(COALESCE((item->>'arrival')::NUMERIC, 0) / 60.0)::INTEGER AS estimated_arrival_min,
      ROUND(COALESCE((item->>'distance')::NUMERIC, 0), 2)::NUMERIC AS estimated_distance_km
    FROM jsonb_array_elements(p_ordered_stops) AS item
  ),
  valid_payload AS (
    SELECT *
    FROM payload
    WHERE stop_id IS NOT NULL
  ),
  updated AS (
    UPDATE public.delivery_route_stops s
    SET
      stop_position = GREATEST(vp.stop_position, 1),
      estimated_arrival_min = GREATEST(vp.estimated_arrival_min, 0),
      estimated_distance_km = GREATEST(vp.estimated_distance_km, 0)
    FROM valid_payload vp
    WHERE s.id = vp.stop_id
      AND s.route_id = p_route_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma parada da rota foi atualizada.';
  END IF;

  UPDATE public.delivery_routes r
  SET
    total_distance_km = COALESCE(p_total_distance_km, r.total_distance_km),
    total_duration_min = COALESCE(p_total_duration_min, r.total_duration_min),
    total_stops = COALESCE(p_total_stops, r.total_stops),
    optimization_result = COALESCE(p_optimization_result, r.optimization_result),
    optimization_engine = COALESCE(NULLIF(BTRIM(p_engine), ''), r.optimization_engine, 'unknown'),
    route_polyline = COALESCE(NULLIF(BTRIM(p_polyline), ''), r.route_polyline),
    status = 'optimized',
    updated_by = v_auth_user
  WHERE r.id = p_route_id;

  INSERT INTO public.route_events (
    route_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    p_route_id,
    'route_optimized',
    v_auth_user,
    jsonb_build_object(
      'engine', COALESCE(NULLIF(BTRIM(p_engine), ''), 'unknown'),
      'totalDistance', COALESCE(p_total_distance_km, 0),
      'totalDuration', COALESCE(p_total_duration_min, 0),
      'stopsOptimized', COALESCE(p_total_stops, v_updated_count),
      'source', 'logistics_apply_optimization_result_atomic'
    )
  );

  RETURN QUERY
  SELECT
    p_route_id,
    v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_apply_optimization_result_atomic(UUID, JSONB, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_apply_optimization_result_atomic(UUID, JSONB, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, JSONB) TO authenticated, service_role;
