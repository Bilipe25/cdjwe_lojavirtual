-- ============================================================
-- Migration 123: Enterprise integration for PRE_VENDA / PRONTA_ENTREGA
-- - Exposes order_type in admin order search/export.
-- - Keeps pronta entrega out of logistics routes by UI query and DB guard.
-- - Preserves PRE_VENDA as default for legacy orders.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_routable_pre_venda_status_created
  ON public.orders(status, created_at DESC)
  WHERE order_type = 'PRE_VENDA'
    AND status IN ('approved', 'in_production')
    AND archived_at IS NULL;

DROP FUNCTION IF EXISTS public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_search_orders_paginated(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 15,
  p_archive_visibility TEXT DEFAULT 'active',
  p_order_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  status TEXT,
  total NUMERIC,
  subtotal NUMERIC,
  discount_amount NUMERIC,
  created_at TIMESTAMPTZ,
  notes TEXT,
  store_company_name TEXT,
  store_cnpj TEXT,
  profile_full_name TEXT,
  payment_condition_name TEXT,
  item_count INTEGER,
  total_count BIGINT,
  sales_channel TEXT,
  order_type TEXT,
  created_by_full_name TEXT,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search TEXT;
  v_status TEXT;
  v_page INTEGER;
  v_page_size INTEGER;
  v_offset INTEGER;
  v_archive_visibility TEXT;
  v_order_type TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_status := NULLIF(TRIM(COALESCE(p_status, '')), '');
  v_archive_visibility := LOWER(NULLIF(TRIM(COALESCE(p_archive_visibility, 'active')), ''));
  v_order_type := NULLIF(UPPER(TRIM(COALESCE(p_order_type, ''))), '');

  IF v_status = 'all' THEN
    v_status := NULL;
  END IF;

  IF v_order_type = 'ALL' THEN
    v_order_type := NULL;
  END IF;

  IF v_archive_visibility IS NULL THEN
    v_archive_visibility := 'active';
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'approved', 'in_production', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Status invalido.';
  END IF;

  IF v_archive_visibility NOT IN ('active', 'archived', 'all') THEN
    RAISE EXCEPTION 'Filtro de arquivamento invalido.';
  END IF;

  IF v_order_type IS NOT NULL AND v_order_type NOT IN ('PRE_VENDA', 'PRONTA_ENTREGA') THEN
    RAISE EXCEPTION 'Tipo de pedido invalido.';
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := GREATEST(LEAST(COALESCE(p_page_size, 15), 100), 1);
  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      o.id,
      o.order_number,
      o.status,
      o.total,
      o.subtotal,
      o.discount_amount,
      o.created_at,
      o.notes,
      s.company_name AS store_company_name,
      s.cnpj AS store_cnpj,
      p.full_name AS profile_full_name,
      pc.name AS payment_condition_name,
      COALESCE(o.sales_channel::TEXT, 'customer_portal') AS sales_channel,
      COALESCE(o.order_type, 'PRE_VENDA') AS order_type,
      cp.full_name AS created_by_full_name,
      o.archived_at,
      o.archive_reason
    FROM public.orders o
    LEFT JOIN public.stores s ON s.id = o.store_id
    LEFT JOIN public.profiles p ON p.id = o.profile_id
    LEFT JOIN public.profiles cp ON cp.id = o.created_by_profile_id
    LEFT JOIN public.payment_conditions pc ON pc.id = o.payment_condition_id
    WHERE
      (
        (v_archive_visibility = 'active' AND o.archived_at IS NULL)
        OR (v_archive_visibility = 'archived' AND o.archived_at IS NOT NULL)
        OR (v_archive_visibility = 'all')
      )
      AND (v_status IS NULL OR o.status = v_status)
      AND (v_order_type IS NULL OR COALESCE(o.order_type, 'PRE_VENDA') = v_order_type)
      AND (
        v_search IS NULL
        OR o.order_number ILIKE '%' || v_search || '%'
        OR COALESCE(o.notes, '') ILIKE '%' || v_search || '%'
        OR COALESCE(o.order_type, 'PRE_VENDA') ILIKE '%' || v_search || '%'
        OR COALESCE(s.company_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(s.cnpj, '') ILIKE '%' || v_search || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(cp.full_name, '') ILIKE '%' || v_search || '%'
      )
  ),
  ranked AS (
    SELECT
      f.*,
      COUNT(*) OVER() AS total_count
    FROM filtered f
  ),
  paged AS (
    SELECT *
    FROM ranked
    ORDER BY created_at DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    pg.id,
    pg.order_number,
    pg.status,
    pg.total,
    pg.subtotal,
    pg.discount_amount,
    pg.created_at,
    pg.notes,
    pg.store_company_name,
    pg.store_cnpj,
    pg.profile_full_name,
    pg.payment_condition_name,
    COALESCE(oi.item_count, 0)::INTEGER AS item_count,
    pg.total_count,
    pg.sales_channel,
    pg.order_type,
    pg.created_by_full_name,
    pg.archived_at,
    pg.archive_reason
  FROM paged pg
  LEFT JOIN (
    SELECT order_id, COUNT(*)::INTEGER AS item_count
    FROM public.order_items
    GROUP BY order_id
  ) oi ON oi.order_id = pg.id
  ORDER BY pg.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_route_stop_pre_venda_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_type TEXT;
  v_order_number TEXT;
BEGIN
  SELECT COALESCE(o.order_type, 'PRE_VENDA'), o.order_number
  INTO v_order_type, v_order_number
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_order_type = 'PRONTA_ENTREGA' THEN
    RAISE EXCEPTION 'Pedidos de pronta entrega nao podem ser vinculados a rotas de entrega. Pedido: %.',
      COALESCE(v_order_number, NEW.order_id::TEXT);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_route_stop_pre_venda_order ON public.delivery_route_stops;
CREATE TRIGGER trg_enforce_route_stop_pre_venda_order
  BEFORE INSERT OR UPDATE OF order_id ON public.delivery_route_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_route_stop_pre_venda_order();

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
  v_ready_delivery_orders TEXT;
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

  SELECT STRING_AGG(o.order_number, ', ' ORDER BY o.order_number)
  INTO v_ready_delivery_orders
  FROM public.orders o
  WHERE o.id = ANY(v_requested_order_ids)
    AND COALESCE(o.order_type, 'PRE_VENDA') = 'PRONTA_ENTREGA';

  IF v_ready_delivery_orders IS NOT NULL THEN
    RAISE EXCEPTION 'Pedidos de pronta entrega nao podem ser roteirizados. Pedido(s): %.', v_ready_delivery_orders;
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

  INSERT INTO public.delivery_routes AS dr (
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
  RETURNING dr.id, dr.route_number
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
  v_order_type TEXT;
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
    COALESCE(o.order_type, 'PRE_VENDA'),
    o.order_number,
    o.store_id,
    o.shipping_address_id,
    o.shipping_address,
    st.company_name,
    st.city,
    st.state
  INTO
    v_order_status,
    v_order_type,
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

  IF v_order_type = 'PRONTA_ENTREGA' THEN
    RAISE EXCEPTION 'Pedidos de pronta entrega nao podem ser adicionados a rotas de entrega. Pedido: %.',
      COALESCE(v_order_number, p_order_id::TEXT);
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
    'stop_added',
    v_auth_user,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order_number,
      'stop_position', v_next_position,
      'reason', v_reason,
      'source', 'logistics_add_route_stop_atomic'
    )
  );

  RETURN QUERY
  SELECT
    p_route_id,
    v_added_stop_id,
    v_next_position,
    v_total_stops,
    v_route_status,
    v_order_number,
    COALESCE(v_company_name, ''),
    v_address_snapshot,
    v_lat,
    v_lng;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_add_route_stop_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_add_route_stop_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
