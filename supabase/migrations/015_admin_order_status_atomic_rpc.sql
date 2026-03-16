-- ============================================================
-- Migration 015: Admin Order Status Atomic RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_order_status_atomic(
  p_order_id UUID,
  p_new_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  previous_status TEXT,
  new_status TEXT,
  profile_id UUID,
  client_email TEXT,
  client_name TEXT,
  changed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_previous_status TEXT;
  v_order_number TEXT;
  v_profile_id UUID;
  v_client_email TEXT;
  v_client_name TEXT;
  v_new_status TEXT;
BEGIN
  v_auth_user := auth.uid();
  v_new_status := LOWER(TRIM(COALESCE(p_new_status, '')));

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
  END IF;

  IF v_new_status NOT IN ('pending', 'approved', 'in_production', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Status invalido.';
  END IF;

  SELECT
    o.status,
    o.order_number,
    o.profile_id,
    p.email,
    p.full_name
  INTO
    v_previous_status,
    v_order_number,
    v_profile_id,
    v_client_email,
    v_client_name
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.profile_id
  WHERE o.id = p_order_id
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  IF v_previous_status = v_new_status THEN
    RETURN QUERY
    SELECT
      p_order_id,
      v_order_number,
      v_previous_status,
      v_new_status,
      v_profile_id,
      v_client_email,
      v_client_name,
      false;
    RETURN;
  END IF;

  IF NOT (
    (v_previous_status = 'pending' AND v_new_status IN ('approved', 'cancelled'))
    OR (v_previous_status = 'approved' AND v_new_status IN ('in_production', 'cancelled'))
    OR (v_previous_status = 'in_production' AND v_new_status IN ('shipped', 'cancelled'))
    OR (v_previous_status = 'shipped' AND v_new_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'Transicao de status invalida.';
  END IF;

  UPDATE public.orders
  SET status = v_new_status
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (
    order_id,
    status,
    notes,
    changed_by
  )
  VALUES (
    p_order_id,
    v_new_status,
    p_notes,
    v_auth_user
  );

  RETURN QUERY
  SELECT
    p_order_id,
    v_order_number,
    v_previous_status,
    v_new_status,
    v_profile_id,
    v_client_email,
    v_client_name,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_status_atomic(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status_atomic(UUID, TEXT, TEXT) TO authenticated, service_role;
