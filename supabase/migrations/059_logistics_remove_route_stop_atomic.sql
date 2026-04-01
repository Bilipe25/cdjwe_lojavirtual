-- ============================================================
-- Migration 059: Remove route stop atomically with audit trail
-- - Allows stop removal only for draft/optimized/confirmed routes
-- - Reindexes stop positions safely (no unique collisions)
-- - Clears stale route geometry/metrics after structural change
-- - Preserves append-only audit in route_events
-- ============================================================

CREATE OR REPLACE FUNCTION public.logistics_remove_route_stop_atomic(
  p_route_id UUID,
  p_stop_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  removed_stop_id UUID,
  remaining_stops INTEGER,
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
  v_total_before INTEGER := 0;
  v_remaining INTEGER := 0;
  v_stage_offset INTEGER := 0;
  v_stage_count INTEGER := 0;
  v_final_count INTEGER := 0;
  v_reason TEXT;
  v_removed_order_id UUID;
  v_removed_position INTEGER;
  v_removed_snapshot JSONB;
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

  IF p_stop_id IS NULL THEN
    RAISE EXCEPTION 'stop_id obrigatorio.';
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
    RAISE EXCEPTION 'A parada so pode ser removida em rotas draft, optimized ou confirmed.';
  END IF;

  PERFORM 1
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id
  FOR UPDATE;

  GET DIAGNOSTICS v_total_before = ROW_COUNT;

  IF v_total_before = 0 THEN
    RAISE EXCEPTION 'A rota nao possui paradas.';
  END IF;

  IF v_total_before <= 1 THEN
    RAISE EXCEPTION 'Nao e permitido remover a ultima parada da rota.';
  END IF;

  SELECT
    s.order_id,
    s.stop_position,
    jsonb_strip_nulls(
      jsonb_build_object(
        'id', s.id,
        'order_id', s.order_id,
        'stop_position', s.stop_position,
        'customer_name', s.customer_name,
        'address_snapshot', s.address_snapshot,
        'status', s.status
      )
    )
  INTO
    v_removed_order_id,
    v_removed_position,
    v_removed_snapshot
  FROM public.delivery_route_stops s
  WHERE s.id = p_stop_id
    AND s.route_id = p_route_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada nao encontrada para esta rota.';
  END IF;

  DELETE FROM public.delivery_route_stops s
  WHERE s.id = p_stop_id
    AND s.route_id = p_route_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao remover parada da rota.';
  END IF;

  SELECT COUNT(*)
  INTO v_remaining
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Operacao invalida: rota ficaria sem paradas.';
  END IF;

  SELECT COALESCE(MAX(s.stop_position), 0)
  INTO v_stage_offset
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id;

  -- Step 1: move positions to a safe staging range.
  WITH ordered AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (ORDER BY s.stop_position, s.id)::INTEGER AS next_position
    FROM public.delivery_route_stops s
    WHERE s.route_id = p_route_id
  ),
  staged AS (
    UPDATE public.delivery_route_stops s
    SET stop_position = v_stage_offset + ordered.next_position
    FROM ordered
    WHERE s.id = ordered.id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_stage_count FROM staged;

  IF v_stage_count <> v_remaining THEN
    RAISE EXCEPTION 'Falha ao preparar reindexacao de paradas.';
  END IF;

  -- Step 2: apply canonical contiguous sequence (1..N).
  WITH ordered AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (ORDER BY s.stop_position, s.id)::INTEGER AS next_position
    FROM public.delivery_route_stops s
    WHERE s.route_id = p_route_id
  ),
  updated AS (
    UPDATE public.delivery_route_stops s
    SET
      stop_position = ordered.next_position,
      estimated_arrival_min = NULL,
      estimated_distance_km = NULL
    FROM ordered
    WHERE s.id = ordered.id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_final_count FROM updated;

  IF v_final_count <> v_remaining THEN
    RAISE EXCEPTION 'Falha ao aplicar nova sequencia apos exclusao.';
  END IF;

  UPDATE public.delivery_routes r
  SET
    total_stops = v_remaining,
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
    stop_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    p_route_id,
    NULL,
    'notes_updated',
    v_auth_user,
    jsonb_strip_nulls(
      jsonb_build_object(
        'action', 'route_stop_removed',
        'source', 'logistics_remove_route_stop_atomic',
        'reason', v_reason,
        'removed_stop', v_removed_snapshot,
        'removed_order_id', v_removed_order_id,
        'removed_position', v_removed_position,
        'remaining_stops', v_remaining
      )
    )
  );

  RETURN QUERY
  SELECT
    p_route_id,
    p_stop_id,
    v_remaining,
    v_route_status;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_remove_route_stop_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_remove_route_stop_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

