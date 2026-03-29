-- ============================================================
-- Migration 049: Financial P1 (Operations, UX, Reporting)
-- Goals:
-- - Server-side pagination + SQL filtering for accounts receivable
-- - Installment/due-date validation against payment condition
--   (or mandatory override justification)
-- - Financial notification UX enrichment (type/kind/priority/read_at)
-- - Financial report aggregation in SQL (RPC) instead of in-memory JS
-- ============================================================

-- ==================== NOTIFICATIONS (FINANCIAL UX) ====================

ALTER TABLE public.client_notifications
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS notification_kind TEXT,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

UPDATE public.client_notifications
   SET priority = COALESCE(NULLIF(BTRIM(priority), ''), 'normal')
 WHERE priority IS NULL
    OR BTRIM(priority) = '';

ALTER TABLE public.client_notifications
  ALTER COLUMN priority SET DEFAULT 'normal';

ALTER TABLE public.client_notifications
  ALTER COLUMN priority SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'client_notifications_priority_check'
  ) THEN
    ALTER TABLE public.client_notifications
      ADD CONSTRAINT client_notifications_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'critical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_notifications_profile_priority_read
  ON public.client_notifications(profile_id, priority, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_notifications_profile_kind
  ON public.client_notifications(profile_id, notification_kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_client_notification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind TEXT;
  v_priority TEXT;
  v_source TEXT;
BEGIN
  v_source := COALESCE(NEW.metadata->>'source', '');

  IF NEW.type = 'financial' THEN
    v_kind := COALESCE(
      NULLIF(BTRIM(NEW.notification_kind), ''),
      NULLIF(BTRIM(COALESCE(NEW.metadata->>'notification_kind', '')), '')
    );

    IF v_kind IS NULL THEN
      v_kind := CASE v_source
        WHEN 'admin_invoice_order_atomic' THEN 'invoice_generated'
        WHEN 'admin_record_installment_payment' THEN 'payment_recorded'
        ELSE 'financial_update'
      END;
    END IF;

    NEW.notification_kind := v_kind;
  ELSE
    NEW.notification_kind := COALESCE(NULLIF(BTRIM(NEW.notification_kind), ''), NEW.type || '_update');
  END IF;

  v_priority := NULLIF(BTRIM(COALESCE(NEW.priority, '')), '');

  IF v_priority IS NULL THEN
    IF NEW.type = 'financial' THEN
      v_priority := CASE COALESCE(NEW.notification_kind, '')
        WHEN 'invoice_overdue' THEN 'high'
        WHEN 'payment_overdue' THEN 'high'
        WHEN 'critical_overdue' THEN 'critical'
        WHEN 'invoice_due_soon' THEN 'normal'
        WHEN 'payment_recorded' THEN 'low'
        ELSE 'normal'
      END;
    ELSIF NEW.type = 'order_status' THEN
      v_priority := 'normal';
    ELSIF NEW.type = 'system' THEN
      v_priority := 'normal';
    ELSE
      v_priority := 'low';
    END IF;
  END IF;

  NEW.priority := v_priority;

  IF NEW.is_read THEN
    IF TG_OP = 'INSERT' THEN
      NEW.read_at := COALESCE(NEW.read_at, NOW());
    ELSIF NOT OLD.is_read THEN
      NEW.read_at := COALESCE(NEW.read_at, NOW());
    END IF;
  ELSE
    NEW.read_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_client_notification_fields
  ON public.client_notifications;

CREATE TRIGGER trg_normalize_client_notification_fields
  BEFORE INSERT OR UPDATE OF type, priority, notification_kind, metadata, is_read, read_at
  ON public.client_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_client_notification_fields();

UPDATE public.client_notifications cn
   SET notification_kind = CASE
       WHEN cn.type = 'financial' THEN
         COALESCE(
           NULLIF(BTRIM(cn.notification_kind), ''),
           NULLIF(BTRIM(COALESCE(cn.metadata->>'notification_kind', '')), ''),
           CASE COALESCE(cn.metadata->>'source', '')
             WHEN 'admin_invoice_order_atomic' THEN 'invoice_generated'
             WHEN 'admin_record_installment_payment' THEN 'payment_recorded'
             ELSE 'financial_update'
           END
         )
       ELSE COALESCE(NULLIF(BTRIM(cn.notification_kind), ''), cn.type || '_update')
     END
 WHERE cn.notification_kind IS NULL
    OR BTRIM(cn.notification_kind) = '';

UPDATE public.client_notifications cn
   SET priority = CASE
       WHEN cn.priority IN ('low', 'normal', 'high', 'critical') THEN cn.priority
       WHEN cn.type = 'financial' AND (
         COALESCE(cn.notification_kind, '') IN ('invoice_overdue', 'payment_overdue', 'critical_overdue')
         OR COALESCE(cn.message, '') ILIKE '%vencid%'
         OR COALESCE(cn.title, '') ILIKE '%vencid%'
       ) THEN 'high'
       WHEN cn.type = 'financial' AND COALESCE(cn.notification_kind, '') = 'payment_recorded' THEN 'low'
       ELSE 'normal'
     END
 WHERE cn.priority IS NULL
    OR cn.priority NOT IN ('low', 'normal', 'high', 'critical');

UPDATE public.client_notifications
   SET read_at = COALESCE(read_at, created_at)
 WHERE is_read = TRUE
   AND read_at IS NULL;

-- ==================== FINANCIAL VIEW (QUERY BASE) ====================

CREATE OR REPLACE VIEW public.v_invoice_installments_financial AS
SELECT
  ii.id AS installment_id,
  ii.invoice_id,
  ii.installment_number,
  ii.due_date,
  ii.amount AS installment_amount,
  ii.paid_amount AS installment_paid_amount,
  GREATEST(ii.amount - ii.paid_amount, 0)::NUMERIC(12,2) AS installment_remaining_amount,
  ii.status AS raw_installment_status,
  CASE
    WHEN ii.status = 'cancelled' THEN 'cancelled'
    WHEN ii.status = 'paid' OR ii.paid_amount >= ii.amount THEN 'paid'
    WHEN ii.status = 'overdue' THEN 'overdue'
    WHEN ii.status = 'open'
      AND ii.paid_amount < ii.amount
      AND ii.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS installment_status,
  CASE
    WHEN ii.paid_amount >= ii.amount THEN 0
    WHEN ii.due_date < CURRENT_DATE THEN (CURRENT_DATE - ii.due_date)::INTEGER
    ELSE 0
  END AS days_overdue,
  inv.id AS invoice_id_ref,
  inv.invoice_number,
  inv.status AS invoice_status,
  inv.issue_date,
  inv.total_amount,
  inv.paid_amount,
  inv.open_amount,
  inv.installment_count,
  inv.payment_method_name,
  inv.payment_condition_name,
  inv.notes AS invoice_notes,
  inv.created_at AS invoice_created_at,
  o.id AS order_id,
  o.order_number,
  o.status AS order_status,
  o.total AS order_total,
  s.id AS store_id,
  s.company_name,
  s.cnpj,
  p.id AS profile_id,
  p.full_name AS client_name
FROM public.invoice_installments ii
JOIN public.invoices inv
  ON inv.id = ii.invoice_id
JOIN public.orders o
  ON o.id = inv.order_id
JOIN public.stores s
  ON s.id = inv.store_id
JOIN public.profiles p
  ON p.id = inv.profile_id;

-- ==================== ACCOUNTS RECEIVABLE (PAGINATED RPC) ====================

CREATE OR REPLACE FUNCTION public.admin_list_accounts_receivable(
  p_status TEXT DEFAULT 'all',
  p_search TEXT DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 50
)
RETURNS TABLE(
  installment_id UUID,
  installment_number INTEGER,
  due_date DATE,
  installment_amount NUMERIC,
  installment_paid_amount NUMERIC,
  installment_remaining_amount NUMERIC,
  installment_status TEXT,
  days_overdue INTEGER,
  invoice_id UUID,
  invoice_number TEXT,
  invoice_status TEXT,
  issue_date DATE,
  total_amount NUMERIC,
  paid_amount NUMERIC,
  open_amount NUMERIC,
  installment_count INTEGER,
  payment_method_name TEXT,
  payment_condition_name TEXT,
  invoice_notes TEXT,
  invoice_created_at TIMESTAMPTZ,
  order_id UUID,
  order_number TEXT,
  order_status TEXT,
  order_total NUMERIC,
  store_id UUID,
  company_name TEXT,
  cnpj TEXT,
  profile_id UUID,
  client_name TEXT,
  total_count BIGINT,
  summary_total_open NUMERIC,
  summary_total_overdue NUMERIC,
  summary_total_paid NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_status TEXT := LOWER(BTRIM(COALESCE(p_status, 'all')));
  v_search TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset INTEGER;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      v.installment_id,
      v.installment_number,
      v.due_date,
      v.installment_amount,
      v.installment_paid_amount,
      v.installment_remaining_amount,
      v.installment_status,
      v.days_overdue,
      v.invoice_id_ref AS invoice_id,
      v.invoice_number,
      v.invoice_status,
      v.issue_date,
      v.total_amount,
      v.paid_amount,
      v.open_amount,
      v.installment_count,
      v.payment_method_name,
      v.payment_condition_name,
      v.invoice_notes,
      v.invoice_created_at,
      v.order_id,
      v.order_number,
      v.order_status,
      v.order_total,
      v.store_id,
      v.company_name,
      v.cnpj,
      v.profile_id,
      v.client_name
    FROM public.v_invoice_installments_financial v
    WHERE (
      v_status = 'all'
      OR (v_status = 'overdue' AND v.installment_status = 'overdue')
      OR (v_status = 'open' AND v.installment_status = 'open')
      OR (v_status = 'paid' AND v.installment_status = 'paid')
      OR (v_status = 'cancelled' AND v.installment_status = 'cancelled')
    )
    AND (
      v_search IS NULL
      OR v.invoice_number ILIKE '%' || v_search || '%'
      OR COALESCE(v.order_number, '') ILIKE '%' || v_search || '%'
      OR COALESCE(v.company_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(v.client_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(v.cnpj, '') ILIKE '%' || v_search || '%'
    )
  ),
  ranked AS (
    SELECT
      f.*,
      COUNT(*) OVER() AS total_count,
      COALESCE(SUM(CASE WHEN f.installment_status = 'open' THEN f.installment_remaining_amount ELSE 0 END) OVER(), 0)::NUMERIC(14,2) AS summary_total_open,
      COALESCE(SUM(CASE WHEN f.installment_status = 'overdue' THEN f.installment_remaining_amount ELSE 0 END) OVER(), 0)::NUMERIC(14,2) AS summary_total_overdue,
      COALESCE(SUM(CASE WHEN f.installment_status = 'paid' THEN f.installment_paid_amount ELSE 0 END) OVER(), 0)::NUMERIC(14,2) AS summary_total_paid
    FROM filtered f
  )
  SELECT
    r.installment_id,
    r.installment_number,
    r.due_date,
    r.installment_amount,
    r.installment_paid_amount,
    r.installment_remaining_amount,
    r.installment_status,
    r.days_overdue,
    r.invoice_id,
    r.invoice_number,
    r.invoice_status,
    r.issue_date,
    r.total_amount,
    r.paid_amount,
    r.open_amount,
    r.installment_count,
    r.payment_method_name,
    r.payment_condition_name,
    r.invoice_notes,
    r.invoice_created_at,
    r.order_id,
    r.order_number,
    r.order_status,
    r.order_total,
    r.store_id,
    r.company_name,
    r.cnpj,
    r.profile_id,
    r.client_name,
    r.total_count,
    r.summary_total_open,
    r.summary_total_overdue,
    r.summary_total_paid
  FROM ranked r
  ORDER BY r.due_date ASC, r.installment_number ASC, r.invoice_created_at DESC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_accounts_receivable(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts_receivable(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

-- ==================== FINANCIAL REPORT (SQL AGGREGATION RPC) ====================

CREATE OR REPLACE FUNCTION public.admin_get_financial_report(
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_result JSONB;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  WITH base AS (
    SELECT
      v.profile_id,
      v.client_name,
      v.company_name,
      v.installment_amount,
      v.installment_paid_amount,
      v.installment_remaining_amount,
      CASE
        WHEN v.installment_status = 'overdue' THEN 'overdue'
        WHEN v.installment_status = 'open'
          AND v.due_date < COALESCE(p_reference_date, CURRENT_DATE)
          AND v.installment_remaining_amount > 0 THEN 'overdue'
        ELSE v.installment_status
      END AS effective_status,
      CASE
        WHEN v.due_date < COALESCE(p_reference_date, CURRENT_DATE)
          AND v.installment_remaining_amount > 0
          THEN (COALESCE(p_reference_date, CURRENT_DATE) - v.due_date)::INTEGER
        ELSE 0
      END AS days_overdue
    FROM public.v_invoice_installments_financial v
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(CASE WHEN b.effective_status IN ('open', 'overdue') THEN b.installment_remaining_amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_receivable,
      COALESCE(SUM(CASE WHEN b.effective_status = 'overdue' THEN b.installment_remaining_amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_overdue,
      COALESCE(SUM(b.installment_amount), 0)::NUMERIC(14,2) AS total_issued
    FROM base b
  ),
  received AS (
    SELECT
      COALESCE(SUM(ip.amount), 0)::NUMERIC(14,2) AS total_received_in_period
    FROM public.invoice_payments ip
    WHERE (p_period_start IS NULL OR ip.payment_date >= p_period_start)
      AND (p_period_end IS NULL OR ip.payment_date <= p_period_end)
  ),
  top_debtors AS (
    SELECT
      b.profile_id,
      MAX(b.client_name) AS client_name,
      MAX(b.company_name) AS company_name,
      COALESCE(SUM(CASE WHEN b.effective_status IN ('open', 'overdue') THEN b.installment_remaining_amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_open,
      COALESCE(SUM(CASE WHEN b.effective_status = 'overdue' THEN b.installment_remaining_amount ELSE 0 END), 0)::NUMERIC(14,2) AS total_overdue
    FROM base b
    GROUP BY b.profile_id
    HAVING COALESCE(SUM(CASE WHEN b.effective_status IN ('open', 'overdue') THEN b.installment_remaining_amount ELSE 0 END), 0) > 0
    ORDER BY total_open DESC
    LIMIT 10
  ),
  aging AS (
    SELECT
      CASE
        WHEN b.days_overdue BETWEEN 1 AND 30 THEN '0-30 dias'
        WHEN b.days_overdue BETWEEN 31 AND 60 THEN '31-60 dias'
        WHEN b.days_overdue BETWEEN 61 AND 90 THEN '61-90 dias'
        WHEN b.days_overdue > 90 THEN '90+ dias'
        ELSE NULL
      END AS range,
      COALESCE(SUM(b.installment_remaining_amount), 0)::NUMERIC(14,2) AS total,
      COUNT(*)::INTEGER AS count
    FROM base b
    WHERE b.effective_status = 'overdue'
      AND b.days_overdue > 0
    GROUP BY 1
  ),
  aging_full AS (
    SELECT
      ranges.range,
      COALESCE(a.total, 0)::NUMERIC(14,2) AS total,
      COALESCE(a.count, 0)::INTEGER AS count,
      ranges.sort_order
    FROM (
      VALUES
        ('0-30 dias'::TEXT, 1),
        ('31-60 dias'::TEXT, 2),
        ('61-90 dias'::TEXT, 3),
        ('90+ dias'::TEXT, 4)
    ) AS ranges(range, sort_order)
    LEFT JOIN aging a
      ON a.range = ranges.range
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'totalReceivable', k.total_receivable,
      'totalOverdue', k.total_overdue,
      'totalReceivedInPeriod', r.total_received_in_period,
      'defaultRate',
        CASE
          WHEN k.total_issued <= 0 THEN 0
          ELSE ROUND((k.total_overdue / k.total_issued) * 100, 2)
        END
    ),
    'topDebtors', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'profileId', td.profile_id,
            'clientName', td.client_name,
            'companyName', td.company_name,
            'totalOpen', td.total_open,
            'totalOverdue', td.total_overdue
          )
          ORDER BY td.total_open DESC
        )
        FROM top_debtors td
      ),
      '[]'::JSONB
    ),
    'aging', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'range', af.range,
            'total', af.total,
            'count', af.count
          )
          ORDER BY af.sort_order
        )
        FROM aging_full af
      ),
      '[]'::JSONB
    )
  )
    INTO v_result
  FROM kpis k
  CROSS JOIN received r;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_financial_report(DATE, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_report(DATE, DATE, DATE) TO authenticated, service_role;

-- ==================== INVOICING VALIDATION (PAYMENT CONDITION) ====================

CREATE OR REPLACE FUNCTION public.admin_invoice_order_atomic(
  p_order_id UUID,
  p_issue_date DATE DEFAULT CURRENT_DATE,
  p_payment_method_id UUID DEFAULT NULL,
  p_payment_method_name TEXT DEFAULT NULL,
  p_payment_condition_id UUID DEFAULT NULL,
  p_payment_condition_name TEXT DEFAULT NULL,
  p_installment_count INTEGER DEFAULT NULL,
  p_installment_days TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  invoice_id UUID,
  invoice_number TEXT,
  order_id UUID,
  order_number TEXT,
  store_id UUID,
  profile_id UUID,
  total_amount NUMERIC,
  installment_count INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_order_record RECORD;
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_installment_count INTEGER;
  v_installment_amount NUMERIC(12,2);
  v_remainder NUMERIC(12,2);
  v_due_date DATE;
  v_days_arr TEXT[];
  v_day_offset INTEGER;
  v_prev_day_offset INTEGER := 0;
  v_expected_installments INTEGER;
  v_has_non_default_days BOOLEAN := FALSE;
  v_requires_override BOOLEAN := FALSE;
  v_override_reason TEXT;
  i INTEGER;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada. Apenas administradores podem gerar faturas.';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
  END IF;

  SELECT
    o.id,
    o.order_number,
    o.store_id,
    o.profile_id,
    o.status,
    o.total,
    o.payment_method_id AS order_payment_method_id,
    o.payment_method_name AS order_payment_method_name,
    o.payment_condition_id AS order_payment_condition_id,
    o.payment_condition_name AS order_payment_condition_name,
    o.payment_installments AS order_payment_installments
  INTO v_order_record
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE OF o;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  IF v_order_record.status IN ('pending', 'cancelled') THEN
    RAISE EXCEPTION 'Nao e possivel faturar pedidos com status "%".', v_order_record.status;
  END IF;

  IF v_order_record.total IS NULL OR v_order_record.total <= 0 THEN
    RAISE EXCEPTION 'O pedido nao possui valor total valido para faturamento.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Ja existe uma fatura para este pedido.';
  END IF;

  p_payment_method_id := COALESCE(p_payment_method_id, v_order_record.order_payment_method_id);
  p_payment_method_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''), v_order_record.order_payment_method_name);
  p_payment_condition_id := COALESCE(p_payment_condition_id, v_order_record.order_payment_condition_id);
  p_payment_condition_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''), v_order_record.order_payment_condition_name);
  v_installment_count := COALESCE(p_installment_count, v_order_record.order_payment_installments, 1);

  IF v_installment_count < 1 THEN
    v_installment_count := 1;
  END IF;

  v_override_reason := NULLIF(BTRIM(COALESCE(p_notes, '')), '');

  IF p_payment_condition_id IS NOT NULL THEN
    SELECT pc.installments
      INTO v_expected_installments
      FROM public.payment_conditions pc
     WHERE pc.id = p_payment_condition_id
     LIMIT 1;

    IF FOUND AND v_expected_installments IS NOT NULL AND v_installment_count <> v_expected_installments THEN
      v_requires_override := TRUE;
    END IF;
  END IF;

  IF p_installment_days IS NOT NULL AND TRIM(p_installment_days) <> '' THEN
    v_days_arr := string_to_array(REPLACE(p_installment_days, ' ', ''), ',');

    IF array_length(v_days_arr, 1) IS NULL OR array_length(v_days_arr, 1) <> v_installment_count THEN
      RAISE EXCEPTION 'Informe exatamente um vencimento (em dias) por parcela.';
    END IF;

    v_prev_day_offset := 0;
    FOR i IN 1..array_length(v_days_arr, 1) LOOP
      BEGIN
        v_day_offset := NULLIF(TRIM(v_days_arr[i]), '')::INTEGER;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE EXCEPTION 'Valor invalido em installment_days na posicao %.', i;
      END;

      IF v_day_offset IS NULL OR v_day_offset <= 0 THEN
        RAISE EXCEPTION 'Dias de vencimento devem ser inteiros positivos.';
      END IF;

      IF v_day_offset <= v_prev_day_offset THEN
        RAISE EXCEPTION 'Os vencimentos personalizados devem estar em ordem crescente.';
      END IF;

      IF v_day_offset <> i * 30 THEN
        v_has_non_default_days := TRUE;
      END IF;

      v_prev_day_offset := v_day_offset;
    END LOOP;

    IF v_has_non_default_days THEN
      v_requires_override := TRUE;
    END IF;
  ELSE
    v_days_arr := NULL;
  END IF;

  IF v_requires_override AND (v_override_reason IS NULL OR CHAR_LENGTH(v_override_reason) < 10) THEN
    RAISE EXCEPTION 'Override da condicao de pagamento detectado. Informe justificativa com pelo menos 10 caracteres em observacoes.';
  END IF;

  INSERT INTO public.invoices (
    order_id,
    store_id,
    profile_id,
    status,
    issue_date,
    total_amount,
    paid_amount,
    open_amount,
    installment_count,
    payment_method_id,
    payment_method_name,
    payment_condition_id,
    payment_condition_name,
    notes,
    created_by
  )
  VALUES (
    p_order_id,
    v_order_record.store_id,
    v_order_record.profile_id,
    'open',
    COALESCE(p_issue_date, CURRENT_DATE),
    v_order_record.total,
    0,
    v_order_record.total,
    v_installment_count,
    p_payment_method_id,
    p_payment_method_name,
    p_payment_condition_id,
    p_payment_condition_name,
    p_notes,
    v_auth_user
  )
  RETURNING id, invoice_number
    INTO v_invoice_id, v_invoice_number;

  v_installment_amount := TRUNC(v_order_record.total / v_installment_count, 2);
  v_remainder := v_order_record.total - (v_installment_amount * v_installment_count);

  FOR i IN 1..v_installment_count LOOP
    IF v_days_arr IS NOT NULL THEN
      v_day_offset := NULLIF(TRIM(v_days_arr[i]), '')::INTEGER;
    ELSE
      v_day_offset := i * 30;
    END IF;

    v_due_date := COALESCE(p_issue_date, CURRENT_DATE) + v_day_offset;

    INSERT INTO public.invoice_installments (
      invoice_id,
      installment_number,
      due_date,
      amount,
      paid_amount,
      status
    )
    VALUES (
      v_invoice_id,
      i,
      v_due_date,
      CASE
        WHEN i = v_installment_count THEN v_installment_amount + v_remainder
        ELSE v_installment_amount
      END,
      0,
      'open'
    );
  END LOOP;

  PERFORM public.recompute_invoice_financial_state(v_invoice_id, COALESCE(p_issue_date, CURRENT_DATE), FALSE);

  INSERT INTO public.invoice_events (
    invoice_id,
    event_type,
    description,
    amount,
    metadata,
    created_by
  )
  VALUES (
    v_invoice_id,
    'created',
    FORMAT('Fatura %s gerada para o pedido %s com %s parcela(s).', v_invoice_number, v_order_record.order_number, v_installment_count),
    v_order_record.total,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order_record.order_number,
      'installment_count', v_installment_count,
      'expected_installments', v_expected_installments,
      'installment_days', p_installment_days,
      'has_custom_due_schedule', v_has_non_default_days,
      'override_required', v_requires_override,
      'override_reason', v_override_reason,
      'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
      'payment_method_name', p_payment_method_name,
      'payment_condition_name', p_payment_condition_name,
      'source', 'admin_invoice_order_atomic'
    ),
    v_auth_user
  );

  INSERT INTO public.client_notifications (
    profile_id,
    type,
    notification_kind,
    priority,
    title,
    message,
    link,
    order_id,
    metadata
  )
  VALUES (
    v_order_record.profile_id,
    'financial',
    'invoice_generated',
    CASE WHEN v_requires_override THEN 'high' ELSE 'normal' END,
    FORMAT('Fatura %s gerada', v_invoice_number),
    FORMAT(
      'Uma fatura no valor de R$ %s foi gerada para o pedido %s com %s parcela(s).',
      TO_CHAR(v_order_record.total, 'FM999G999G999D00'),
      v_order_record.order_number,
      v_installment_count
    ),
    '/invoices',
    p_order_id,
    jsonb_build_object(
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'total_amount', v_order_record.total,
      'installment_count', v_installment_count,
      'override_required', v_requires_override,
      'override_reason', v_override_reason,
      'notification_kind', 'invoice_generated',
      'source', 'admin_invoice_order_atomic'
    )
  );

  RETURN QUERY
  SELECT
    v_invoice_id,
    v_invoice_number,
    p_order_id,
    v_order_record.order_number,
    v_order_record.store_id,
    v_order_record.profile_id,
    v_order_record.total,
    v_installment_count,
    'open'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invoice_order_atomic(UUID, DATE, UUID, TEXT, UUID, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_invoice_order_atomic(UUID, DATE, UUID, TEXT, UUID, TEXT, INTEGER, TEXT, TEXT) TO authenticated, service_role;
