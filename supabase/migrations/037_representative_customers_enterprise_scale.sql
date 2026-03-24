-- ============================================================
-- Migration 037: Representative Customers Enterprise Scale
-- ============================================================

-- Performance indexes for customer workspace at scale
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_stores_rep_state_type_company
  ON public.stores(representative_id, state, customer_type_id, company_name);

CREATE INDEX IF NOT EXISTS idx_stores_state_city
  ON public.stores(state, city);

CREATE INDEX IF NOT EXISTS idx_stores_company_name_trgm
  ON public.stores USING gin (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_trade_name_trgm
  ON public.stores USING gin (trade_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_stores_customer_code_trgm
  ON public.stores USING gin (customer_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_store_created_at_desc
  ON public.orders(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_quotes_store_status_created
  ON public.sales_quotes(store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_visits_store_outcome_visited
  ON public.sales_visits(store_id, outcome, visited_at DESC);

-- Operational audit for representative customer lifecycle
CREATE TABLE IF NOT EXISTS public.representative_customer_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  representative_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'representative_customer_audit_logs_action_check'
  ) THEN
    ALTER TABLE public.representative_customer_audit_logs
      ADD CONSTRAINT representative_customer_audit_logs_action_check
      CHECK (action IN ('create', 'update', 'quality_flag', 'automated_alert'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rep_customer_audit_store_created
  ON public.representative_customer_audit_logs(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rep_customer_audit_rep_created
  ON public.representative_customer_audit_logs(representative_id, created_at DESC);

ALTER TABLE public.representative_customer_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_customer_audit_logs'
      AND policyname = 'Admins can manage representative customer audit logs'
  ) THEN
    CREATE POLICY "Admins can manage representative customer audit logs"
      ON public.representative_customer_audit_logs
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'representative_customer_audit_logs'
      AND policyname = 'Representatives can view own customer audit logs'
  ) THEN
    CREATE POLICY "Representatives can view own customer audit logs"
      ON public.representative_customer_audit_logs
      FOR SELECT
      USING (representative_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

-- SQL-first pagination/filtering + automatic prioritization/alerts
CREATE OR REPLACE FUNCTION public.representative_get_customers_page(
  p_representative_id UUID,
  p_query TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_customer_type_id UUID DEFAULT NULL,
  p_inactivity_bucket TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'inactivity_desc',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_scope_mode TEXT DEFAULT 'assigned_only',
  p_allowed_states TEXT[] DEFAULT '{}'::TEXT[],
  p_allowed_cities TEXT[] DEFAULT '{}'::TEXT[],
  p_manual_allow UUID[] DEFAULT '{}'::UUID[],
  p_manual_deny UUID[] DEFAULT '{}'::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 200);
  v_offset INTEGER := (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 200);
  v_query TEXT := NULLIF(TRIM(COALESCE(p_query, '')), '');
  v_state TEXT := NULLIF(UPPER(TRIM(COALESCE(p_state, ''))), '');
  v_inactivity_bucket TEXT := NULLIF(TRIM(COALESCE(p_inactivity_bucket, '')), '');
  v_segment TEXT := NULLIF(TRIM(COALESCE(p_segment, '')), '');
  v_sort TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_sort, '')), ''), 'inactivity_desc');
  v_scope_mode TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_scope_mode, '')), ''), 'assigned_only');
  v_result JSONB;
BEGIN
  WITH accessible_stores AS (
    SELECT s.*
    FROM public.stores s
    WHERE
      p_representative_id IS NULL
      OR s.representative_id = p_representative_id
      OR (
        s.representative_id IS NULL
        AND (
          s.id = ANY(COALESCE(p_manual_allow, ARRAY[]::UUID[]))
          OR (
            NOT (s.id = ANY(COALESCE(p_manual_deny, ARRAY[]::UUID[])))
            AND (
              v_scope_mode = 'all_admin_portfolio'
              OR UPPER(COALESCE(s.state, '')) = ANY(COALESCE(p_allowed_states, ARRAY[]::TEXT[]))
              OR LOWER(COALESCE(s.city, '')) = ANY(COALESCE(p_allowed_cities, ARRAY[]::TEXT[]))
            )
          )
        )
      )
  ),
  enriched AS (
    SELECT
      s.*,
      p.full_name AS profile_full_name,
      p.email AS profile_email,
      p.phone AS profile_phone,
      ct.name AS customer_type_name,
      lo.order_number AS last_order_number,
      lo.created_at AS last_order_created_at,
      lo.total AS last_order_total,
      lo.status AS last_order_status,
      CASE
        WHEN lo.created_at IS NULL THEN NULL
        ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - lo.created_at)) / 86400)::INT
      END AS inactivity_days,
      COALESCE(qs.open_quotes_count, 0) AS open_quotes_count,
      COALESCE(vs.overdue_followups_count, 0) AS overdue_followups_count,
      (
        100
        - CASE WHEN COALESCE(TRIM(s.cnpj), '') = '' THEN 20 ELSE 0 END
        - CASE
            WHEN (
              COALESCE(TRIM(s.phone), '') = ''
              AND COALESCE(TRIM(s.email), '') = ''
              AND COALESCE(TRIM(p.phone), '') = ''
              AND COALESCE(TRIM(p.email), '') = ''
            )
            THEN 20 ELSE 0
          END
        - CASE
            WHEN COALESCE(TRIM(s.city), '') = '' OR COALESCE(TRIM(s.state), '') = ''
            THEN 15 ELSE 0
          END
        - CASE WHEN s.customer_type_id IS NULL THEN 15 ELSE 0 END
        - CASE WHEN COALESCE(addr.has_address, FALSE) = FALSE THEN 15 ELSE 0 END
        - CASE WHEN COALESCE(TRIM(s.trade_name), '') = '' THEN 5 ELSE 0 END
      )::INT AS data_quality_score,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN COALESCE(TRIM(s.cnpj), '') = '' THEN 'CNPJ ausente' END,
        CASE WHEN (COALESCE(TRIM(s.phone), '') = '' AND COALESCE(TRIM(s.email), '') = '' AND COALESCE(TRIM(p.phone), '') = '' AND COALESCE(TRIM(p.email), '') = '') THEN 'Contato principal ausente' END,
        CASE WHEN COALESCE(TRIM(s.city), '') = '' OR COALESCE(TRIM(s.state), '') = '' THEN 'Cidade/UF incompleto' END,
        CASE WHEN s.customer_type_id IS NULL THEN 'Tipo de cliente nao definido' END,
        CASE WHEN COALESCE(addr.has_address, FALSE) = FALSE THEN 'Endereco principal ausente' END
      ], NULL) AS data_quality_issues
    FROM accessible_stores s
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.customer_types ct ON ct.id = s.customer_type_id
    LEFT JOIN LATERAL (
      SELECT o.order_number, o.created_at, o.total, o.status
      FROM public.orders o
      WHERE o.store_id = s.id
      ORDER BY o.created_at DESC
      LIMIT 1
    ) lo ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS open_quotes_count
      FROM public.sales_quotes q
      WHERE q.store_id = s.id
        AND q.status IN ('draft', 'sent', 'approved')
    ) qs ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INT AS overdue_followups_count
      FROM public.sales_visits v
      WHERE v.store_id = s.id
        AND v.outcome IN ('planned', 'follow_up')
        AND v.visited_at <= NOW()
    ) vs ON TRUE
    LEFT JOIN LATERAL (
      SELECT EXISTS(
        SELECT 1
        FROM public.store_addresses sa
        WHERE sa.store_id = s.id
      ) AS has_address
    ) addr ON TRUE
  ),
  filtered AS (
    SELECT
      e.*,
      (
        CASE
          WHEN e.inactivity_days IS NULL OR e.inactivity_days >= 90 THEN 60
          WHEN e.inactivity_days >= 60 THEN 35
          WHEN e.inactivity_days >= 30 THEN 20
          ELSE 0
        END
        + CASE WHEN e.open_quotes_count > 0 THEN 20 ELSE 0 END
        + CASE WHEN e.overdue_followups_count > 0 THEN 20 ELSE 0 END
        + CASE WHEN e.data_quality_score < 70 THEN 10 ELSE 0 END
      )::INT AS priority_score,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN e.inactivity_days IS NULL THEN 'Cliente sem historico de pedidos' END,
        CASE WHEN e.inactivity_days IS NOT NULL AND e.inactivity_days >= 90 THEN 'Reativacao urgente (90+ dias)' END,
        CASE WHEN e.open_quotes_count > 0 THEN 'Possui orcamento em aberto' END,
        CASE WHEN e.overdue_followups_count > 0 THEN 'Follow-up vencido' END,
        CASE WHEN e.data_quality_score < 70 THEN 'Cadastro com baixa qualidade' END
      ], NULL) AS alerts
    FROM enriched e
    WHERE
      (
        v_query IS NULL
        OR e.company_name ILIKE '%' || v_query || '%'
        OR COALESCE(e.trade_name, '') ILIKE '%' || v_query || '%'
        OR COALESCE(e.cnpj, '') ILIKE '%' || v_query || '%'
        OR COALESCE(e.customer_code, '') ILIKE '%' || v_query || '%'
        OR COALESCE(e.profile_full_name, '') ILIKE '%' || v_query || '%'
        OR COALESCE(e.profile_email, '') ILIKE '%' || v_query || '%'
      )
      AND (
        v_state IS NULL
        OR UPPER(COALESCE(e.state, '')) = v_state
      )
      AND (
        p_customer_type_id IS NULL
        OR e.customer_type_id = p_customer_type_id
      )
      AND (
        v_segment IS NULL
        OR (
          (v_segment = 'reactivation_90' AND e.inactivity_days IS NOT NULL AND e.inactivity_days >= 90)
          OR (v_segment = 'hot_30' AND e.inactivity_days IS NOT NULL AND e.inactivity_days <= 30)
          OR (v_segment = 'never_ordered' AND e.inactivity_days IS NULL)
        )
      )
      AND (
        v_inactivity_bucket IS NULL
        OR (
          (v_inactivity_bucket = '30' AND e.inactivity_days IS NOT NULL AND e.inactivity_days >= 30)
          OR (v_inactivity_bucket = '60' AND e.inactivity_days IS NOT NULL AND e.inactivity_days >= 60)
          OR (v_inactivity_bucket = '90' AND e.inactivity_days IS NOT NULL AND e.inactivity_days >= 90)
          OR (v_inactivity_bucket = 'no_order' AND e.inactivity_days IS NULL)
        )
      )
  ),
  ordered AS (
    SELECT
      f.*,
      CASE
        WHEN f.priority_score >= 70 THEN 'high'
        WHEN f.priority_score >= 40 THEN 'medium'
        ELSE 'low'
      END AS priority_level,
      CASE
        WHEN f.overdue_followups_count > 0 THEN 'Executar follow-up pendente'
        WHEN f.open_quotes_count > 0 THEN 'Retomar negociacao de orcamento aberto'
        WHEN f.inactivity_days IS NULL OR f.inactivity_days >= 90 THEN 'Iniciar plano de reativacao'
        WHEN f.data_quality_score < 70 THEN 'Corrigir cadastro do cliente'
        ELSE 'Manter relacionamento ativo'
      END AS next_recommended_action
    FROM filtered f
    ORDER BY
      CASE WHEN v_sort = 'name_asc' THEN f.company_name END ASC NULLS LAST,
      CASE WHEN v_sort = 'recent_order_desc' THEN COALESCE(f.last_order_created_at, TO_TIMESTAMP(0)) END DESC,
      CASE WHEN v_sort = 'inactivity_desc' THEN COALESCE(f.inactivity_days, 999999) END DESC,
      f.company_name ASC
  ),
  paged AS (
    SELECT *
    FROM ordered
    LIMIT v_page_size OFFSET v_offset
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_count
    FROM filtered
  ),
  summary AS (
    SELECT
      COUNT(*)::INT AS total_customers,
      COUNT(*) FILTER (WHERE inactivity_days IS NULL)::INT AS customers_without_orders,
      COUNT(*) FILTER (WHERE inactivity_days IS NOT NULL AND inactivity_days <= 30)::INT AS customers_with_recent_orders_30,
      COUNT(*) FILTER (WHERE inactivity_days IS NOT NULL AND inactivity_days >= 60)::INT AS customers_inactive_60_plus,
      COUNT(*) FILTER (WHERE inactivity_days IS NOT NULL AND inactivity_days >= 90)::INT AS customers_inactive_90_plus,
      COUNT(*) FILTER (WHERE priority_score >= 70)::INT AS high_priority_customers,
      COUNT(*) FILTER (WHERE data_quality_score < 70)::INT AS low_quality_customers,
      COUNT(*) FILTER (WHERE overdue_followups_count > 0)::INT AS customers_with_overdue_followups
    FROM ordered
  ),
  facets AS (
    SELECT
      COALESCE(
        (
          SELECT JSONB_AGG(state_code ORDER BY state_code)
          FROM (
            SELECT DISTINCT UPPER(COALESCE(s.state, '')) AS state_code
            FROM accessible_stores s
            WHERE COALESCE(TRIM(s.state), '') <> ''
          ) states
        ),
        '[]'::JSONB
      ) AS states,
      COALESCE(
        (
          SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT('id', ct.id, 'name', ct.name)
            ORDER BY ct.name
          )
          FROM (
            SELECT DISTINCT c.id, c.name
            FROM accessible_stores s
            JOIN public.customer_types c ON c.id = s.customer_type_id
          ) ct
        ),
        '[]'::JSONB
      ) AS customer_types
  )
  SELECT JSONB_BUILD_OBJECT(
    'items', COALESCE(
      (
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'id', p.id,
            'profile_id', p.profile_id,
            'customer_code', p.customer_code,
            'company_name', p.company_name,
            'trade_name', p.trade_name,
            'cnpj', p.cnpj,
            'state_registration', p.state_registration,
            'address', p.address,
            'city', p.city,
            'state', p.state,
            'zip_code', p.zip_code,
            'region', p.region,
            'phone', p.phone,
            'email', p.email,
            'notes', p.notes,
            'customer_type_id', p.customer_type_id,
            'representative_id', p.representative_id,
            'is_active', p.is_active,
            'created_at', p.created_at,
            'updated_at', p.updated_at,
            'customer_type', CASE
              WHEN p.customer_type_id IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT('id', p.customer_type_id, 'name', p.customer_type_name)
            END,
            'profile', CASE
              WHEN p.profile_id IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
                'id', p.profile_id,
                'full_name', p.profile_full_name,
                'email', p.profile_email,
                'phone', p.profile_phone
              )
            END,
            'addresses', COALESCE(
              (
                SELECT JSONB_AGG(TO_JSONB(sa) ORDER BY sa.is_main DESC, sa.created_at ASC)
                FROM public.store_addresses sa
                WHERE sa.store_id = p.id
              ),
              '[]'::JSONB
            ),
            'assigned_price_tables', COALESCE(
              (
                SELECT JSONB_AGG(TO_JSONB(pt) ORDER BY pt.name ASC)
                FROM public.store_price_tables spt
                JOIN public.price_tables pt ON pt.id = spt.price_table_id
                WHERE spt.store_id = p.id
              ),
              '[]'::JSONB
            ),
            'last_order', CASE
              WHEN p.last_order_created_at IS NULL THEN NULL
              ELSE JSONB_BUILD_OBJECT(
                'order_number', p.last_order_number,
                'created_at', p.last_order_created_at,
                'total', p.last_order_total,
                'status', p.last_order_status
              )
            END,
            'open_quotes_count', p.open_quotes_count,
            'overdue_followups_count', p.overdue_followups_count,
            'alerts', TO_JSONB(COALESCE(p.alerts, ARRAY[]::TEXT[])),
            'data_quality', JSONB_BUILD_OBJECT(
              'score', p.data_quality_score,
              'issues', TO_JSONB(COALESCE(p.data_quality_issues, ARRAY[]::TEXT[]))
            ),
            'priority', JSONB_BUILD_OBJECT(
              'score', p.priority_score,
              'level', p.priority_level,
              'next_action', p.next_recommended_action
            )
          )
        )
        FROM paged p
      ),
      '[]'::JSONB
    ),
    'total', (SELECT total_count FROM totals),
    'page', v_page,
    'pageSize', v_page_size,
    'totalPages', GREATEST(1, CEIL((SELECT total_count FROM totals)::NUMERIC / v_page_size)::INT),
    'summary', JSONB_BUILD_OBJECT(
      'totalCustomers', (SELECT total_customers FROM summary),
      'customersWithoutOrders', (SELECT customers_without_orders FROM summary),
      'customersWithRecentOrders30', (SELECT customers_with_recent_orders_30 FROM summary),
      'customersInactive60Plus', (SELECT customers_inactive_60_plus FROM summary),
      'customersInactive90Plus', (SELECT customers_inactive_90_plus FROM summary),
      'highPriorityCustomers', (SELECT high_priority_customers FROM summary),
      'lowQualityCustomers', (SELECT low_quality_customers FROM summary),
      'customersWithOverdueFollowups', (SELECT customers_with_overdue_followups FROM summary)
    ),
    'facets', JSONB_BUILD_OBJECT(
      'states', (SELECT states FROM facets),
      'customerTypes', (SELECT customer_types FROM facets)
    )
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.representative_get_customers_page(
  UUID,
  TEXT,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT,
  TEXT[],
  TEXT[],
  UUID[],
  UUID[]
) TO authenticated, service_role;
