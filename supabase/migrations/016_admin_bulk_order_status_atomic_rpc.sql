-- ============================================================
-- Migration 016: Admin Bulk Order Status Atomic RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_bulk_update_order_status_atomic(
  p_order_ids UUID[],
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  previous_status TEXT,
  new_status TEXT,
  client_email TEXT,
  client_name TEXT,
  changed BOOLEAN,
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_order_id UUID;
  v_status TEXT;
  v_result RECORD;
BEGIN
  v_auth_user := auth.uid();
  v_status := LOWER(TRIM(COALESCE(p_new_status, '')));

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF COALESCE(array_length(p_order_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Lista de pedidos vazia.';
  END IF;

  FOREACH v_order_id IN ARRAY p_order_ids LOOP
    BEGIN
      SELECT *
      INTO v_result
      FROM public.admin_update_order_status_atomic(v_order_id, v_status, p_notes)
      LIMIT 1;

      RETURN QUERY
      SELECT
        v_result.order_id,
        v_result.order_number,
        v_result.previous_status,
        v_result.new_status,
        v_result.client_email,
        v_result.client_name,
        v_result.changed,
        true,
        NULL::TEXT;
    EXCEPTION
      WHEN OTHERS THEN
        RETURN QUERY
        SELECT
          v_order_id,
          NULL::TEXT,
          NULL::TEXT,
          v_status,
          NULL::TEXT,
          NULL::TEXT,
          false,
          false,
          SQLERRM::TEXT;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_update_order_status_atomic(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_update_order_status_atomic(UUID[], TEXT, TEXT) TO authenticated, service_role;

