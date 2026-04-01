-- ============================================================
-- Migration 058: Fix unique collision during manual stop reorder
-- - Updates logistics_reorder_route_stops_atomic to use a two-step
--   position update (staging offset + final position), preventing
--   transient conflicts with idx_delivery_route_stops_route_position_unique.
-- ============================================================

CREATE OR REPLACE FUNCTION public.logistics_reorder_route_stops_atomic(
  p_route_id UUID,
  p_ordered_stop_ids UUID[],
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  updated_stops INTEGER,
  route_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_route_status TEXT;
  v_route_is_deleted BOOLEAN;
  v_total_stops INTEGER;
  v_input_count INTEGER;
  v_unique_input_count INTEGER;
  v_missing_count INTEGER;
  v_extra_count INTEGER;
  v_stage_offset INTEGER;
  v_staged_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_reason TEXT;
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

  SELECT r.status, COALESCE(r.is_deleted, FALSE)
  INTO v_route_status, v_route_is_deleted
  FROM public.delivery_routes r
  WHERE r.id = p_route_id
  FOR UPDATE OF r;

  IF NOT FOUND OR v_route_is_deleted THEN
    RAISE EXCEPTION 'Rota nao encontrada.';
  END IF;

  IF v_route_status NOT IN ('draft', 'optimized', 'confirmed') THEN
    RAISE EXCEPTION 'A sequencia so pode ser editada em rotas draft, optimized ou confirmed.';
  END IF;

  IF p_ordered_stop_ids IS NULL OR array_length(p_ordered_stop_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'ordered_stop_ids obrigatorio.';
  END IF;

  PERFORM 1
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id
  FOR UPDATE;

  GET DIAGNOSTICS v_total_stops = ROW_COUNT;

  IF v_total_stops = 0 THEN
    RAISE EXCEPTION 'A rota nao possui paradas para reordenar.';
  END IF;

  v_input_count := COALESCE(array_length(p_ordered_stop_ids, 1), 0);
  IF v_input_count <> v_total_stops THEN
    RAISE EXCEPTION 'Quantidade de paradas enviada (%) difere da rota (%).', v_input_count, v_total_stops;
  END IF;

  SELECT COUNT(DISTINCT stop_id)
  INTO v_unique_input_count
  FROM unnest(p_ordered_stop_ids) AS stop_id;

  IF v_unique_input_count <> v_total_stops THEN
    RAISE EXCEPTION 'A lista de paradas enviada contem IDs duplicados.';
  END IF;

  WITH payload AS (
    SELECT stop_id
    FROM unnest(p_ordered_stop_ids) AS stop_id
  )
  SELECT COUNT(*)
  INTO v_missing_count
  FROM public.delivery_route_stops s
  LEFT JOIN payload p ON p.stop_id = s.id
  WHERE s.route_id = p_route_id
    AND p.stop_id IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'A lista enviada nao contem todas as paradas da rota.';
  END IF;

  WITH payload AS (
    SELECT stop_id
    FROM unnest(p_ordered_stop_ids) AS stop_id
  )
  SELECT COUNT(*)
  INTO v_extra_count
  FROM payload p
  LEFT JOIN public.delivery_route_stops s
    ON s.id = p.stop_id
   AND s.route_id = p_route_id
  WHERE s.id IS NULL;

  IF v_extra_count > 0 THEN
    RAISE EXCEPTION 'A lista enviada contem paradas que nao pertencem a rota.';
  END IF;

  SELECT COALESCE(MAX(s.stop_position), 0)
  INTO v_stage_offset
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id;

  -- Step 1: move all target stops to a safe staging range to avoid transient
  -- unique collisions on (route_id, stop_position).
  WITH payload AS (
    SELECT stop_id, ord::INTEGER AS next_position
    FROM unnest(p_ordered_stop_ids) WITH ORDINALITY AS t(stop_id, ord)
  ),
  staged AS (
    UPDATE public.delivery_route_stops s
    SET stop_position = v_stage_offset + p.next_position
    FROM payload p
    WHERE s.id = p.stop_id
      AND s.route_id = p_route_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_staged_count FROM staged;

  IF v_staged_count <> v_total_stops THEN
    RAISE EXCEPTION 'Falha ao preparar a nova sequencia das paradas.';
  END IF;

  -- Step 2: apply final sequence and clear stale per-stop metrics.
  WITH payload AS (
    SELECT stop_id, ord::INTEGER AS next_position
    FROM unnest(p_ordered_stop_ids) WITH ORDINALITY AS t(stop_id, ord)
  ),
  updated AS (
    UPDATE public.delivery_route_stops s
    SET
      stop_position = p.next_position,
      estimated_arrival_min = NULL,
      estimated_distance_km = NULL
    FROM payload p
    WHERE s.id = p.stop_id
      AND s.route_id = p_route_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  IF v_updated_count <> v_total_stops THEN
    RAISE EXCEPTION 'Falha ao aplicar a nova sequencia em todas as paradas.';
  END IF;

  UPDATE public.delivery_routes r
  SET
    route_polyline = NULL,
    total_distance_km = NULL,
    total_duration_min = NULL,
    optimization_result = CASE
      WHEN r.optimization_result IS NULL THEN NULL
      ELSE r.optimization_result - 'orderedStops' - 'directionsStops'
    END,
    updated_by = v_auth_user
  WHERE r.id = p_route_id;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');

  INSERT INTO public.route_events (
    route_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    p_route_id,
    'stop_reordered',
    v_auth_user,
    jsonb_strip_nulls(
      jsonb_build_object(
        'source', 'logistics_reorder_route_stops_atomic',
        'changed_count', v_updated_count,
        'reason', v_reason
      )
    )
  );

  RETURN QUERY
  SELECT
    p_route_id,
    v_updated_count,
    v_route_status;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_reorder_route_stops_atomic(UUID, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_reorder_route_stops_atomic(UUID, UUID[], TEXT) TO authenticated, service_role;
