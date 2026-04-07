-- Migration 069: Allow order delete cascade to remove order_status_history
-- Problem:
-- - order_status_history is append-only by trigger
-- - orders -> order_status_history uses ON DELETE CASCADE
-- - deleting an order currently fails because the child trigger blocks the cascade delete
-- Solution:
-- - keep append-only guarantees for direct UPDATE/DELETE
-- - allow DELETE on order_status_history only when admin_delete_order explicitly enables
--   a transaction-local flag for a legitimate order deletion flow

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

  DELETE FROM public.orders
   WHERE id = p_order_id
   RETURNING id INTO v_deleted_order;

  IF v_deleted_order IS NULL THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  RETURN true;
END;
$$;
