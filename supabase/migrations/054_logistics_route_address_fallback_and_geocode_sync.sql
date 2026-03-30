-- ============================================================
-- Migration 054: Route stop address fallback + geocode persistence support
-- - Prevents new stops with NULL address_id when store has main address
-- - Backfills existing stops without address_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_delivery_route_atomic(
  p_order_ids UUID[],
  p_planned_date DATE,
  p_vehicle_id UUID DEFAULT NULL,
  p_driver_id UUID DEFAULT NULL,
  p_center_id UUID DEFAULT NULL,
  p_region_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  route_number TEXT,
  total_stops INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_requested_order_ids UUID[];
  v_total_stops INTEGER;
  v_found_orders INTEGER;
  v_invalid_orders TEXT;
  v_conflict_order_number TEXT;
  v_conflict_route_number TEXT;
  v_conflict_route_status TEXT;
  v_driver_status TEXT;
  v_vehicle_status TEXT;
  v_center_active BOOLEAN;
  v_region_active BOOLEAN;
  v_notes TEXT;
  v_route_id UUID;
  v_route_number TEXT;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_planned_date IS NULL THEN
    RAISE EXCEPTION 'Data planejada obrigatoria.';
  END IF;

  WITH dedup AS (
    SELECT order_id, MIN(ord) AS ord
    FROM unnest(COALESCE(p_order_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS t(order_id, ord)
    WHERE order_id IS NOT NULL
    GROUP BY order_id
  )
  SELECT
    COALESCE(array_agg(order_id ORDER BY ord), ARRAY[]::UUID[]),
    COUNT(*)
  INTO v_requested_order_ids, v_total_stops
  FROM dedup;

  IF v_total_stops = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um pedido para criar a rota.';
  END IF;

  PERFORM 1
  FROM public.orders o
  WHERE o.id = ANY(v_requested_order_ids)
  FOR UPDATE OF o;
  GET DIAGNOSTICS v_found_orders = ROW_COUNT;

  IF v_found_orders <> v_total_stops THEN
    RAISE EXCEPTION 'Um ou mais pedidos selecionados nao foram encontrados.';
  END IF;

  SELECT STRING_AGG(o.order_number, ', ' ORDER BY o.order_number)
  INTO v_invalid_orders
  FROM public.orders o
  WHERE o.id = ANY(v_requested_order_ids)
    AND o.status NOT IN ('approved', 'in_production');

  IF v_invalid_orders IS NOT NULL THEN
    RAISE EXCEPTION 'Somente pedidos em status approved ou in_production podem ser roteirizados. Exemplo: %.', v_invalid_orders;
  END IF;

  SELECT
    o.order_number,
    dr.route_number,
    dr.status
  INTO
    v_conflict_order_number,
    v_conflict_route_number,
    v_conflict_route_status
  FROM public.delivery_route_stops s
  JOIN public.delivery_routes dr ON dr.id = s.route_id
  JOIN public.orders o ON o.id = s.order_id
  WHERE s.order_id = ANY(v_requested_order_ids)
    AND dr.status IN ('draft', 'optimized', 'confirmed', 'in_progress')
    AND COALESCE(dr.is_deleted, FALSE) = FALSE
  LIMIT 1;

  IF v_conflict_order_number IS NOT NULL THEN
    RAISE EXCEPTION 'O pedido % ja esta vinculado a rota ativa % (status: %).',
      v_conflict_order_number,
      COALESCE(v_conflict_route_number, 'sem_numero'),
      v_conflict_route_status;
  END IF;

  IF p_driver_id IS NOT NULL THEN
    SELECT d.status INTO v_driver_status
    FROM public.drivers d
    WHERE d.id = p_driver_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Motorista selecionado nao encontrado.';
    END IF;
    IF v_driver_status = 'inactive' THEN
      RAISE EXCEPTION 'Motorista inativo nao pode ser atribuido a rota.';
    END IF;
  END IF;

  IF p_vehicle_id IS NOT NULL THEN
    SELECT v.status INTO v_vehicle_status
    FROM public.vehicles v
    WHERE v.id = p_vehicle_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Veiculo selecionado nao encontrado.';
    END IF;
    IF v_vehicle_status IN ('inactive', 'maintenance') THEN
      RAISE EXCEPTION 'Veiculo indisponivel para atribuicao (inativo ou em manutencao).';
    END IF;
  END IF;

  IF p_center_id IS NOT NULL THEN
    SELECT c.is_active INTO v_center_active
    FROM public.route_centers c
    WHERE c.id = p_center_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Centro selecionado nao encontrado.';
    END IF;
    IF NOT v_center_active THEN
      RAISE EXCEPTION 'Centro inativo nao pode ser usado na rota.';
    END IF;
  END IF;

  IF p_region_id IS NOT NULL THEN
    SELECT r.is_active INTO v_region_active
    FROM public.delivery_regions r
    WHERE r.id = p_region_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Regiao selecionada nao encontrada.';
    END IF;
    IF NOT v_region_active THEN
      RAISE EXCEPTION 'Regiao inativa nao pode ser usada na rota.';
    END IF;
  END IF;

  v_notes := NULLIF(BTRIM(COALESCE(p_notes, '')), '');

  INSERT INTO public.delivery_routes (
    route_number,
    status,
    driver_id,
    vehicle_id,
    center_id,
    region_id,
    planned_date,
    total_stops,
    notes,
    created_by,
    updated_by
  )
  VALUES (
    '',
    'draft',
    p_driver_id,
    p_vehicle_id,
    p_center_id,
    p_region_id,
    p_planned_date,
    v_total_stops,
    v_notes,
    v_auth_user,
    v_auth_user
  )
  RETURNING id, route_number
  INTO v_route_id, v_route_number;

  WITH requested AS (
    SELECT order_id, MIN(ord) AS ord
    FROM unnest(v_requested_order_ids) WITH ORDINALITY AS t(order_id, ord)
    GROUP BY order_id
  ),
  ordered_orders AS (
    SELECT
      r.order_id,
      r.ord,
      o.store_id,
      COALESCE(o.shipping_address_id, main_sa.id) AS resolved_address_id,
      o.shipping_address,
      st.company_name,
      st.city,
      st.state
    FROM requested r
    JOIN public.orders o ON o.id = r.order_id
    LEFT JOIN public.stores st ON st.id = o.store_id
    LEFT JOIN LATERAL (
      SELECT sa_main.id
      FROM public.store_addresses sa_main
      WHERE sa_main.store_id = o.store_id
      ORDER BY sa_main.is_main DESC, sa_main.updated_at DESC NULLS LAST, sa_main.created_at DESC NULLS LAST
      LIMIT 1
    ) main_sa ON TRUE
  )
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
  SELECT
    v_route_id,
    oo.order_id,
    oo.store_id,
    oo.resolved_address_id,
    ROW_NUMBER() OVER (ORDER BY oo.ord),
    sa.latitude,
    sa.longitude,
    COALESCE(
      NULLIF(BTRIM(oo.shipping_address), ''),
      CONCAT_WS(', ', NULLIF(BTRIM(oo.city), ''), NULLIF(BTRIM(oo.state), ''))
    ),
    COALESCE(oo.company_name, '')
  FROM ordered_orders oo
  LEFT JOIN public.store_addresses sa ON sa.id = oo.resolved_address_id
  ORDER BY oo.ord;

  INSERT INTO public.route_events (
    route_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    v_route_id,
    'route_created',
    v_auth_user,
    jsonb_build_object(
      'order_count', v_total_stops,
      'source', 'admin_create_delivery_route_atomic'
    )
  );

  RETURN QUERY
  SELECT
    v_route_id,
    v_route_number,
    v_total_stops;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_delivery_route_atomic(UUID[], DATE, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_delivery_route_atomic(UUID[], DATE, UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;

WITH main_address AS (
  SELECT DISTINCT ON (sa.store_id)
    sa.store_id,
    sa.id AS address_id,
    sa.latitude,
    sa.longitude
  FROM public.store_addresses sa
  ORDER BY sa.store_id, sa.is_main DESC, sa.updated_at DESC NULLS LAST, sa.created_at DESC NULLS LAST
)
UPDATE public.delivery_route_stops s
SET
  address_id = m.address_id,
  latitude = COALESCE(s.latitude, m.latitude),
  longitude = COALESCE(s.longitude, m.longitude),
  updated_at = NOW()
FROM main_address m
WHERE s.address_id IS NULL
  AND s.store_id = m.store_id;
