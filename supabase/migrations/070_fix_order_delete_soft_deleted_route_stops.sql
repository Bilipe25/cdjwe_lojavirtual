-- Migration 070: Ignore residual route stops from soft-deleted routes when deleting orders
-- Problem:
-- - logistics soft-deletes rows in delivery_routes
-- - delivery_route_stops remain physically present for those routes
-- - orders.id is still referenced by those stops, so deleting the order fails
--   even though the route is no longer active or visible in Central de Rotas
-- Solution:
-- - keep active route stops as a real blocker
-- - automatically remove only stops that belong to soft-deleted routes
--   inside the trusted admin_delete_order flow

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
