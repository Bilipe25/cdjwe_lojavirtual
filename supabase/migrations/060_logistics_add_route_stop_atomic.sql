-- ============================================================
-- Migration 060: Add route stop atomically with audit trail
-- - Adds one routable order as a new stop at the end of route
-- - Allows add only for draft/optimized/confirmed routes
-- - Clears stale route geometry/metrics after structural change
-- - Preserves append-only audit in route_events
-- ============================================================

CREATE OR REPLACE FUNCTION public.logistics_add_route_stop_atomic(
  p_route_id UUID,
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  added_stop_id UUID,
  stop_position INTEGER,
  total_stops INTEGER,
  route_status TEXT,
  order_number TEXT,
  customer_name TEXT,
  address_snapshot TEXT,
  latitude NUMERIC,
  longitude NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_route_status TEXT;
  v_route_is_deleted BOOLEAN;
  v_existing_stops INTEGER := 0;
  v_next_position INTEGER := 0;
  v_total_stops INTEGER := 0;
  v_order_status TEXT;
  v_order_number TEXT;
  v_store_id UUID;
  v_shipping_address_id UUID;
  v_shipping_address TEXT;
  v_company_name TEXT;
  v_city TEXT;
  v_state TEXT;
  v_resolved_address_id UUID;
  v_lat NUMERIC;
  v_lng NUMERIC;
  v_address_snapshot TEXT;
  v_added_stop_id UUID;
  v_reason TEXT;
  v_conflict_route_id UUID;
  v_conflict_route_number TEXT;
  v_conflict_route_status TEXT;
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

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
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
    RAISE EXCEPTION 'A parada so pode ser adicionada em rotas draft, optimized ou confirmed.';
  END IF;

  PERFORM 1
  FROM public.delivery_route_stops s
  WHERE s.route_id = p_route_id
  FOR UPDATE;
  GET DIAGNOSTICS v_existing_stops = ROW_COUNT;
  v_next_position := v_existing_stops + 1;

  SELECT
    o.status,
    o.order_number,
    o.store_id,
    o.shipping_address_id,
    o.shipping_address,
    st.company_name,
    st.city,
    st.state
  INTO
    v_order_status,
    v_order_number,
    v_store_id,
    v_shipping_address_id,
    v_shipping_address,
    v_company_name,
    v_city,
    v_state
  FROM public.orders o
  LEFT JOIN public.stores st ON st.id = o.store_id
  WHERE o.id = p_order_id
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  IF v_order_status NOT IN ('approved', 'in_production') THEN
    RAISE EXCEPTION 'Somente pedidos em approved ou in_production podem ser adicionados a rota.';
  END IF;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Pedido sem loja vinculada.';
  END IF;

  SELECT
    dr.id,
    dr.route_number,
    dr.status
  INTO
    v_conflict_route_id,
    v_conflict_route_number,
    v_conflict_route_status
  FROM public.delivery_route_stops s
  JOIN public.delivery_routes dr ON dr.id = s.route_id
  WHERE s.order_id = p_order_id
    AND COALESCE(dr.is_deleted, FALSE) = FALSE
    AND dr.status IN ('draft', 'optimized', 'confirmed', 'in_progress')
  LIMIT 1;

  IF v_conflict_route_id IS NOT NULL THEN
    IF v_conflict_route_id = p_route_id THEN
      RAISE EXCEPTION 'O pedido ja esta vinculado a esta rota.';
    END IF;

    RAISE EXCEPTION 'O pedido % ja esta vinculado a rota ativa % (status: %).',
      COALESCE(v_order_number, 'sem_numero'),
      COALESCE(v_conflict_route_number, 'sem_numero'),
      v_conflict_route_status;
  END IF;

  v_resolved_address_id := v_shipping_address_id;
  IF v_resolved_address_id IS NULL THEN
    SELECT sa_main.id
    INTO v_resolved_address_id
    FROM public.store_addresses sa_main
    WHERE sa_main.store_id = v_store_id
    ORDER BY sa_main.is_main DESC, sa_main.updated_at DESC NULLS LAST, sa_main.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_resolved_address_id IS NOT NULL THEN
    SELECT sa.latitude, sa.longitude
    INTO v_lat, v_lng
    FROM public.store_addresses sa
    WHERE sa.id = v_resolved_address_id;
  ELSE
    v_lat := NULL;
    v_lng := NULL;
  END IF;

  v_address_snapshot := NULLIF(BTRIM(COALESCE(v_shipping_address, '')), '');
  IF v_address_snapshot IS NULL THEN
    v_address_snapshot := NULLIF(
      CONCAT_WS(', ', NULLIF(BTRIM(v_city), ''), NULLIF(BTRIM(v_state), '')),
      ''
    );
  END IF;

  INSERT INTO public.delivery_route_stops (
    route_id,
    order_id,
    store_id,
    address_id,
    stop_position,
    latitude,
    longitude,
    address_snapshot,
    customer_name
  )
  VALUES (
    p_route_id,
    p_order_id,
    v_store_id,
    v_resolved_address_id,
    v_next_position,
    v_lat,
    v_lng,
    v_address_snapshot,
    COALESCE(v_company_name, '')
  )
  RETURNING id INTO v_added_stop_id;

  v_total_stops := v_next_position;

  UPDATE public.delivery_routes r
  SET
    total_stops = v_total_stops,
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
    v_added_stop_id,
    'notes_updated',
    v_auth_user,
    jsonb_strip_nulls(
      jsonb_build_object(
        'action', 'route_stop_added',
        'source', 'logistics_add_route_stop_atomic',
        'reason', v_reason,
        'order_id', p_order_id,
        'order_number', v_order_number,
        'stop_id', v_added_stop_id,
        'stop_position', v_next_position,
        'total_stops', v_total_stops
      )
    )
  );

  RETURN QUERY
  SELECT
    p_route_id AS route_id,
    v_added_stop_id AS added_stop_id,
    v_next_position AS stop_position,
    v_total_stops AS total_stops,
    v_route_status AS route_status,
    v_order_number AS order_number,
    COALESCE(v_company_name, '') AS customer_name,
    v_address_snapshot AS address_snapshot,
    v_lat AS latitude,
    v_lng AS longitude;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_add_route_stop_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_add_route_stop_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

