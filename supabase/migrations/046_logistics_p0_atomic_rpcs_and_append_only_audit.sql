-- ============================================================
-- Migration 046: Logistics P0 Atomic RPCs + Append-Only Audit
-- Goal:
-- - Atomic route creation (route + stops + audit)
-- - Atomic stop execution sync (logistics -> orders -> notifications)
-- - Atomic route completion with automatic stop closure
-- - Append-only guarantees for critical audit tables
-- ============================================================

-- ==================== ATOMIC ROUTE CREATION ====================

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

  -- Lock all selected orders to prevent concurrent route assignment races.
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
    '', -- trigger generate_route_number() fills this
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
      o.shipping_address_id,
      o.shipping_address,
      st.company_name,
      st.city,
      st.state
    FROM requested r
    JOIN public.orders o ON o.id = r.order_id
    LEFT JOIN public.stores st ON st.id = o.store_id
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
    oo.shipping_address_id,
    ROW_NUMBER() OVER (ORDER BY oo.ord),
    sa.latitude,
    sa.longitude,
    COALESCE(
      NULLIF(BTRIM(oo.shipping_address), ''),
      CONCAT_WS(', ', NULLIF(BTRIM(oo.city), ''), NULLIF(BTRIM(oo.state), ''))
    ),
    COALESCE(oo.company_name, '')
  FROM ordered_orders oo
  LEFT JOIN public.store_addresses sa ON sa.id = oo.shipping_address_id
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

-- ==================== ATOMIC STOP STATUS EXECUTION + DOMAIN SYNC ====================

CREATE OR REPLACE FUNCTION public.logistics_update_stop_status_atomic(
  p_stop_id UUID,
  p_new_status TEXT,
  p_failure_reason TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  stop_id UUID,
  order_id UUID,
  previous_stop_status TEXT,
  new_stop_status TEXT,
  order_status_after_sync TEXT,
  changed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_is_admin BOOLEAN;
  v_driver_id UUID;
  v_route_id UUID;
  v_route_number TEXT;
  v_route_status TEXT;
  v_route_driver_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_order_status TEXT;
  v_profile_id UUID;
  v_previous_stop_status TEXT;
  v_new_status TEXT;
  v_failure_reason TEXT;
  v_notes TEXT;
  v_event_type TEXT;
  v_history_notes TEXT;
  v_notification_title TEXT;
  v_notification_message TEXT;
  v_order_status_after TEXT;
  v_changed BOOLEAN;
BEGIN
  v_auth_user := auth.uid();
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    WHERE d.profile_id = v_auth_user
    LIMIT 1;

    IF v_driver_id IS NULL THEN
      RAISE EXCEPTION 'Permissao negada.';
    END IF;
  END IF;

  v_new_status := LOWER(BTRIM(COALESCE(p_new_status, '')));
  IF v_new_status NOT IN ('arrived', 'delivered', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Status de parada invalido.';
  END IF;

  v_failure_reason := NULLIF(BTRIM(COALESCE(p_failure_reason, '')), '');
  v_notes := NULLIF(BTRIM(COALESCE(p_notes, '')), '');

  IF v_new_status = 'failed' AND v_failure_reason IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do insucesso para marcar a parada como failed.';
  END IF;

  SELECT
    s.route_id,
    s.order_id,
    s.status,
    r.status,
    r.driver_id,
    r.route_number,
    o.status,
    o.order_number,
    o.profile_id
  INTO
    v_route_id,
    v_order_id,
    v_previous_stop_status,
    v_route_status,
    v_route_driver_id,
    v_route_number,
    v_order_status,
    v_order_number,
    v_profile_id
  FROM public.delivery_route_stops s
  JOIN public.delivery_routes r ON r.id = s.route_id
  JOIN public.orders o ON o.id = s.order_id
  WHERE s.id = p_stop_id
  FOR UPDATE OF s, r, o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parada nao encontrada.';
  END IF;

  IF NOT v_is_admin AND v_route_driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'Permissao negada para operar esta parada.';
  END IF;

  IF v_route_status <> 'in_progress' THEN
    RAISE EXCEPTION 'A rota precisa estar em andamento para atualizar paradas.';
  END IF;

  IF v_previous_stop_status = v_new_status THEN
    RETURN QUERY
    SELECT
      v_route_id,
      p_stop_id,
      v_order_id,
      v_previous_stop_status,
      v_new_status,
      v_order_status,
      false;
    RETURN;
  END IF;

  IF NOT (
    (v_previous_stop_status = 'pending' AND v_new_status IN ('arrived', 'delivered', 'failed', 'skipped'))
    OR
    (v_previous_stop_status = 'arrived' AND v_new_status IN ('delivered', 'failed', 'skipped'))
  ) THEN
    RAISE EXCEPTION 'Transicao de parada invalida: % -> %.', v_previous_stop_status, v_new_status;
  END IF;

  UPDATE public.delivery_route_stops s
  SET
    status = v_new_status,
    delivered_at = CASE WHEN v_new_status = 'delivered' THEN NOW() ELSE NULL END,
    failure_reason = CASE WHEN v_new_status = 'failed' THEN v_failure_reason ELSE NULL END,
    notes = CASE
      WHEN v_notes IS NOT NULL THEN v_notes
      WHEN v_new_status = 'failed' AND v_failure_reason IS NOT NULL THEN v_failure_reason
      ELSE s.notes
    END
  WHERE s.id = p_stop_id;

  v_event_type := CASE v_new_status
    WHEN 'arrived' THEN 'stop_arrived'
    WHEN 'delivered' THEN 'stop_delivered'
    WHEN 'failed' THEN 'stop_failed'
    ELSE 'stop_skipped'
  END;

  INSERT INTO public.route_events (
    route_id,
    stop_id,
    event_type,
    actor_id,
    metadata
  )
  VALUES (
    v_route_id,
    p_stop_id,
    v_event_type,
    v_auth_user,
    jsonb_strip_nulls(
      jsonb_build_object(
        'failure_reason', v_failure_reason,
        'notes', v_notes,
        'source', 'logistics_update_stop_status_atomic'
      )
    )
  );

  v_order_status_after := v_order_status;
  v_changed := true;

  -- Sync to order + order history + notifications in the same transaction.
  IF v_new_status = 'delivered' AND v_order_status NOT IN ('delivered', 'cancelled') THEN
    UPDATE public.orders o
    SET status = 'delivered'
    WHERE o.id = v_order_id;

    v_order_status_after := 'delivered';
    v_history_notes := FORMAT(
      'Entrega confirmada na rota %s (parada %s).',
      COALESCE(v_route_number, ''),
      p_stop_id
    );

    INSERT INTO public.order_status_history (
      order_id,
      status,
      notes,
      changed_by
    )
    VALUES (
      v_order_id,
      'delivered',
      v_history_notes,
      v_auth_user
    );

    IF v_profile_id IS NOT NULL THEN
      v_notification_title := FORMAT('Pedido %s entregue', COALESCE(v_order_number, ''));
      v_notification_message := FORMAT(
        'Seu pedido %s foi entregue com sucesso.',
        COALESCE(v_order_number, '')
      );

      INSERT INTO public.client_notifications (
        profile_id,
        type,
        title,
        message,
        link,
        order_id,
        metadata
      )
      VALUES (
        v_profile_id,
        'order_status',
        v_notification_title,
        v_notification_message,
        FORMAT('/orders/%s', v_order_id),
        v_order_id,
        jsonb_build_object(
          'status', 'delivered',
          'previous_status', v_order_status,
          'route_id', v_route_id,
          'route_number', v_route_number,
          'stop_id', p_stop_id,
          'logistics_stop_status', v_new_status,
          'source', 'logistics_update_stop_status_atomic'
        )
      );
    END IF;
  ELSIF v_new_status IN ('failed', 'skipped') AND v_order_status NOT IN ('delivered', 'cancelled') THEN
    IF v_order_status <> 'shipped' THEN
      UPDATE public.orders o
      SET status = 'shipped'
      WHERE o.id = v_order_id;
    END IF;

    v_order_status_after := 'shipped';
    v_history_notes := FORMAT(
      'Tentativa de entrega sem sucesso na rota %s (parada %s). Motivo: %s.',
      COALESCE(v_route_number, ''),
      p_stop_id,
      COALESCE(v_failure_reason, v_notes, 'Nao informado')
    );

    INSERT INTO public.order_status_history (
      order_id,
      status,
      notes,
      changed_by
    )
    VALUES (
      v_order_id,
      'shipped',
      v_history_notes,
      v_auth_user
    );

    IF v_profile_id IS NOT NULL THEN
      v_notification_title := FORMAT('Tentativa de entrega do pedido %s', COALESCE(v_order_number, ''));
      v_notification_message := FORMAT(
        'Houve um insucesso na entrega do pedido %s. Motivo: %s.',
        COALESCE(v_order_number, ''),
        COALESCE(v_failure_reason, v_notes, 'Nao informado')
      );

      INSERT INTO public.client_notifications (
        profile_id,
        type,
        title,
        message,
        link,
        order_id,
        metadata
      )
      VALUES (
        v_profile_id,
        'order_status',
        v_notification_title,
        v_notification_message,
        FORMAT('/orders/%s', v_order_id),
        v_order_id,
        jsonb_build_object(
          'status', 'shipped',
          'previous_status', v_order_status,
          'route_id', v_route_id,
          'route_number', v_route_number,
          'stop_id', p_stop_id,
          'logistics_stop_status', v_new_status,
          'failure_reason', COALESCE(v_failure_reason, v_notes),
          'source', 'logistics_update_stop_status_atomic'
        )
      );
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_route_id,
    p_stop_id,
    v_order_id,
    v_previous_stop_status,
    v_new_status,
    v_order_status_after,
    v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_update_stop_status_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_update_stop_status_atomic(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ==================== ATOMIC ROUTE COMPLETION ====================

CREATE OR REPLACE FUNCTION public.logistics_complete_route_atomic(
  p_route_id UUID,
  p_close_open_stops_as TEXT DEFAULT 'failed',
  p_close_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  route_id UUID,
  route_number TEXT,
  closed_open_stops INTEGER,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_is_admin BOOLEAN;
  v_driver_id UUID;
  v_route_number TEXT;
  v_route_status TEXT;
  v_route_driver_id UUID;
  v_close_open_stops_as TEXT;
  v_close_reason TEXT;
  v_closed_open_stops INTEGER := 0;
  v_completed_at TIMESTAMPTZ := NOW();
  v_stop RECORD;
BEGIN
  v_auth_user := auth.uid();
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    WHERE d.profile_id = v_auth_user
    LIMIT 1;

    IF v_driver_id IS NULL THEN
      RAISE EXCEPTION 'Permissao negada.';
    END IF;
  END IF;

  v_close_open_stops_as := LOWER(BTRIM(COALESCE(p_close_open_stops_as, 'failed')));
  IF v_close_open_stops_as NOT IN ('failed', 'skipped') THEN
    RAISE EXCEPTION 'close_open_stops_as deve ser failed ou skipped.';
  END IF;

  v_close_reason := NULLIF(BTRIM(COALESCE(p_close_reason, '')), '');
  IF v_close_reason IS NULL THEN
    v_close_reason := CASE v_close_open_stops_as
      WHEN 'failed' THEN 'Parada encerrada automaticamente na conclusao da rota.'
      ELSE 'Parada marcada como pulada automaticamente na conclusao da rota.'
    END;
  END IF;

  SELECT
    r.route_number,
    r.status,
    r.driver_id
  INTO
    v_route_number,
    v_route_status,
    v_route_driver_id
  FROM public.delivery_routes r
  WHERE r.id = p_route_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rota nao encontrada.';
  END IF;

  IF NOT v_is_admin AND v_route_driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'Permissao negada para concluir esta rota.';
  END IF;

  IF v_route_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Apenas rotas em andamento podem ser concluidas.';
  END IF;

  FOR v_stop IN
    SELECT s.id
    FROM public.delivery_route_stops s
    WHERE s.route_id = p_route_id
      AND s.status IN ('pending', 'arrived')
    ORDER BY s.stop_position
  LOOP
    PERFORM *
    FROM public.logistics_update_stop_status_atomic(
      v_stop.id,
      v_close_open_stops_as,
      CASE WHEN v_close_open_stops_as = 'failed' THEN v_close_reason ELSE NULL END,
      v_close_reason
    );

    v_closed_open_stops := v_closed_open_stops + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.delivery_route_stops s
    WHERE s.route_id = p_route_id
      AND s.status IN ('pending', 'arrived')
  ) THEN
    RAISE EXCEPTION 'Ainda existem paradas pendentes apos tentativa de fechamento automatico.';
  END IF;

  UPDATE public.delivery_routes r
  SET
    status = 'completed',
    completed_at = v_completed_at,
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
    'route_completed',
    v_auth_user,
    jsonb_build_object(
      'auto_closed_stops', v_closed_open_stops,
      'close_strategy', v_close_open_stops_as,
      'close_reason', v_close_reason,
      'source', 'logistics_complete_route_atomic'
    )
  );

  RETURN QUERY
  SELECT
    p_route_id,
    v_route_number,
    v_closed_open_stops,
    v_completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_complete_route_atomic(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logistics_complete_route_atomic(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ==================== APPEND-ONLY AUDIT GUARANTEES ====================

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % e append-only. UPDATE e DELETE nao sao permitidos.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_events_append_only ON public.route_events;
CREATE TRIGGER trg_route_events_append_only
  BEFORE UPDATE OR DELETE ON public.route_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_order_status_history_append_only ON public.order_status_history;
CREATE TRIGGER trg_order_status_history_append_only
  BEFORE UPDATE OR DELETE ON public.order_status_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- Route events: keep admin/driver read + insert only (no update/delete policies).
DROP POLICY IF EXISTS "Admins can manage route events" ON public.route_events;
DROP POLICY IF EXISTS "Admins can view route events" ON public.route_events;
DROP POLICY IF EXISTS "Admins can insert route events" ON public.route_events;

CREATE POLICY "Admins can view route events"
  ON public.route_events FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert route events"
  ON public.route_events FOR INSERT
  WITH CHECK (public.is_admin());
