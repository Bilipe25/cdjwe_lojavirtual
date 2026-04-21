-- ============================================================
-- Migration 116: Archive orders with fiscal documents instead
-- of hard-deleting them, while keeping hard delete for orders
-- without NF-e and hiding archived orders by default.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_archived_at ON public.orders(archived_at);

DROP FUNCTION IF EXISTS public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.admin_search_orders_paginated(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 15,
  p_archive_visibility TEXT DEFAULT 'active'
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

  IF v_status = 'all' THEN
    v_status := NULL;
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
      AND (
        v_search IS NULL
        OR o.order_number ILIKE '%' || v_search || '%'
        OR COALESCE(o.notes, '') ILIKE '%' || v_search || '%'
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

REVOKE ALL ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_delete_order(UUID);

CREATE OR REPLACE FUNCTION public.admin_delete_order(
  p_order_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_deleted_order UUID;
  v_order_status TEXT;
  v_archived_at TIMESTAMPTZ;
  v_has_invoice BOOLEAN;
  v_has_active_route BOOLEAN;
  v_has_fiscal_document BOOLEAN;
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

  SELECT o.status, o.archived_at
    INTO v_order_status, v_archived_at
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RETURN 'already_archived';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.invoices i
    WHERE i.order_id = p_order_id
  )
  INTO v_has_invoice;

  IF v_has_invoice THEN
    RAISE EXCEPTION 'Pedido possui fatura vinculada.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.delivery_route_stops s
    JOIN public.delivery_routes r ON r.id = s.route_id
    WHERE s.order_id = p_order_id
      AND COALESCE(r.is_deleted, FALSE) = FALSE
  )
  INTO v_has_active_route;

  IF v_has_active_route THEN
    RAISE EXCEPTION 'Pedido possui parada logistica ativa.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.fiscal_documents fd
    WHERE fd.order_id = p_order_id
  )
  INTO v_has_fiscal_document;

  IF v_has_fiscal_document THEN
    UPDATE public.orders
       SET archived_at = NOW(),
           archived_by = v_auth_user,
           archive_reason = 'Arquivado administrativamente para preservar a NF-e e o historico fiscal vinculados.',
           updated_at = NOW()
     WHERE id = p_order_id;

    INSERT INTO public.order_status_history (
      order_id,
      status,
      notes,
      changed_by
    )
    VALUES (
      p_order_id,
      v_order_status,
      'Pedido arquivado administrativamente para preservar a NF-e e o historico fiscal vinculados.',
      v_auth_user
    );

    RETURN 'archived';
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

  RETURN 'deleted';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(UUID) TO authenticated, service_role;
