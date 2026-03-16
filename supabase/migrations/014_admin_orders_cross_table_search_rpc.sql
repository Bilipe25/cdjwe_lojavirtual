-- ============================================================
-- Migration 014: Admin Orders Cross-Table Search RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_search_orders_paginated(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 15
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
  total_count BIGINT
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_status := NULLIF(TRIM(COALESCE(p_status, '')), '');

  IF v_status = 'all' THEN
    v_status := NULL;
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'approved', 'in_production', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Status invalido.';
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
      pc.name AS payment_condition_name
    FROM public.orders o
    LEFT JOIN public.stores s ON s.id = o.store_id
    LEFT JOIN public.profiles p ON p.id = o.profile_id
    LEFT JOIN public.payment_conditions pc ON pc.id = o.payment_condition_id
    WHERE
      (v_status IS NULL OR o.status = v_status)
      AND (
        v_search IS NULL
        OR o.order_number ILIKE '%' || v_search || '%'
        OR COALESCE(o.notes, '') ILIKE '%' || v_search || '%'
        OR COALESCE(s.company_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(s.cnpj, '') ILIKE '%' || v_search || '%'
        OR COALESCE(p.full_name, '') ILIKE '%' || v_search || '%'
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
    pg.total_count
  FROM paged pg
  LEFT JOIN (
    SELECT order_id, COUNT(*)::INTEGER AS item_count
    FROM public.order_items
    GROUP BY order_id
  ) oi ON oi.order_id = pg.id
  ORDER BY pg.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_orders_paginated(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc
  ON public.orders(status, created_at DESC);
