-- Migration 071: Allow admin_delete_order to detach append-only route_events
-- when deleting residual route stops from soft-deleted routes.
--
-- Problem:
-- - delivered orders can remain linked to delivery_route_stops from routes that were soft-deleted
-- - admin_delete_order must remove those residual stops before deleting the order
-- - route_events.stop_id uses ON DELETE SET NULL
-- - route_events is append-only, so the FK-driven UPDATE is blocked by trg_route_events_append_only
--
-- Solution:
-- - keep route_events append-only for normal operations
-- - allow only the FK nullification of stop_id when a trusted transaction-local flag is enabled
-- - perform the residual cleanup inside admin_delete_order itself

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'order_status_history'
     AND TG_OP = 'DELETE'
     AND COALESCE(current_setting('app.allow_order_history_cascade_delete', true), 'off') = 'on' THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'route_events'
     AND TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.allow_route_event_stop_fk_cleanup', true), 'off') = 'on'
     AND OLD.stop_id IS NOT NULL
     AND NEW.stop_id IS NULL
     AND NEW.id = OLD.id
     AND NEW.route_id = OLD.route_id
     AND NEW.event_type = OLD.event_type
     AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Tabela % e append-only. UPDATE e DELETE nao sao permitidos.', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_order(
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
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

  PERFORM set_config('app.allow_order_history_cascade_delete', 'on', true);
  PERFORM set_config('app.allow_route_event_stop_fk_cleanup', 'on', true);

  DELETE FROM public.delivery_route_stops s
  USING public.delivery_routes r
  WHERE s.route_id = r.id
    AND s.order_id = p_order_id
    AND COALESCE(r.is_deleted, FALSE) = TRUE;

  DELETE FROM public.orders
   WHERE id = p_order_id
   RETURNING id INTO v_deleted_order;

  IF v_deleted_order IS NULL THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  RETURN true;
END;
$$;
