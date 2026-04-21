-- ============================================================
-- Migration 117: Hard delete definitivo para pedidos arquivados,
-- incluindo purge dos documentos fiscais no banco. A limpeza de
-- storage (bucket fiscal-xml) continua sendo feita na server action.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_hard_delete_archived_order(UUID);

CREATE OR REPLACE FUNCTION public.admin_hard_delete_archived_order(
  p_order_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_archived_at TIMESTAMPTZ;
  v_deleted_order UUID;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
  END IF;

  SELECT o.archived_at
    INTO v_archived_at
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'already_deleted';
  END IF;

  IF v_archived_at IS NULL THEN
    RAISE EXCEPTION 'Pedido precisa estar arquivado antes do hard delete definitivo.';
  END IF;

  PERFORM set_config('app.allow_order_history_cascade_delete', 'on', true);
  PERFORM set_config('app.allow_route_event_stop_fk_cleanup', 'on', true);

  DELETE FROM public.fiscal_documents
  WHERE order_id = p_order_id;

  DELETE FROM public.delivery_route_stops s
  USING public.delivery_routes r
  WHERE s.route_id = r.id
    AND s.order_id = p_order_id
    AND COALESCE(r.is_deleted, FALSE) = TRUE;

  DELETE FROM public.orders
   WHERE id = p_order_id
   RETURNING id INTO v_deleted_order;

  IF v_deleted_order IS NULL THEN
    RETURN 'already_deleted';
  END IF;

  RETURN 'hard_deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_archived_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_archived_order(UUID) TO authenticated, service_role;
