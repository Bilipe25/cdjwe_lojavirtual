-- ============================================================
-- Migration 038: Financial Accounts Receivable Module
-- Goal:
-- - Create invoices, invoice_installments, invoice_events tables
-- - Atomic RPC for invoice generation (parallel to order flow)
-- - Add 'financial' notification type
-- - RLS policies, indexes, constraints
-- ============================================================

-- ==================== INVOICES ====================

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'overdue', 'cancelled', 'renegotiated')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  open_amount NUMERIC(12,2) NOT NULL CHECK (open_amount >= 0),
  installment_count INTEGER NOT NULL CHECK (installment_count >= 1),
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_method_name TEXT,
  payment_condition_id UUID REFERENCES public.payment_conditions(id) ON DELETE SET NULL,
  payment_condition_name TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id) -- prevents duplicate invoices per order
);

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate invoice numbers
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.invoices;

  NEW.invoice_number := 'FAT' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_store_id ON public.invoices(store_id);
CREATE INDEX IF NOT EXISTS idx_invoices_profile_id ON public.invoices(profile_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at);

-- ==================== INVOICE INSTALLMENTS ====================

CREATE TABLE IF NOT EXISTS public.invoice_installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, installment_number)
);

DROP TRIGGER IF EXISTS update_invoice_installments_updated_at ON public.invoice_installments;
CREATE TRIGGER update_invoice_installments_updated_at
  BEFORE UPDATE ON public.invoice_installments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_invoice_installments_invoice_id ON public.invoice_installments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_due_date ON public.invoice_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_installments_status ON public.invoice_installments(status);

-- ==================== INVOICE EVENTS (Audit Trail) ====================

CREATE TABLE IF NOT EXISTS public.invoice_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'payment_received', 'partial_payment', 'cancelled', 'overdue_marked', 'renegotiated', 'note_added')),
  description TEXT NOT NULL,
  amount NUMERIC(12,2),
  metadata JSONB,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice_id ON public.invoice_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_events_event_type ON public.invoice_events(event_type);
CREATE INDEX IF NOT EXISTS idx_invoice_events_created_at ON public.invoice_events(created_at);

-- ==================== UPDATE client_notifications CHECK ====================

ALTER TABLE public.client_notifications
  DROP CONSTRAINT IF EXISTS client_notifications_type_check;

ALTER TABLE public.client_notifications
  ADD CONSTRAINT client_notifications_type_check
  CHECK (type IN ('order_status', 'campaign', 'system', 'promo', 'financial'));

-- ==================== RLS POLICIES ====================

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;

-- Invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own invoices') THEN
    CREATE POLICY "Users can view own invoices"
      ON public.invoices FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all invoices') THEN
    CREATE POLICY "Admins can manage all invoices"
      ON public.invoices FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- Invoice Installments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own invoice installments') THEN
    CREATE POLICY "Users can view own invoice installments"
      ON public.invoice_installments FOR SELECT
      USING (
        invoice_id IN (
          SELECT id FROM public.invoices WHERE profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all invoice installments') THEN
    CREATE POLICY "Admins can manage all invoice installments"
      ON public.invoice_installments FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- Invoice Events
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own invoice events') THEN
    CREATE POLICY "Users can view own invoice events"
      ON public.invoice_events FOR SELECT
      USING (
        invoice_id IN (
          SELECT id FROM public.invoices WHERE profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all invoice events') THEN
    CREATE POLICY "Admins can manage all invoice events"
      ON public.invoice_events FOR ALL
      USING (public.is_admin());
  END IF;
END $$;

-- ==================== ATOMIC INVOICE GENERATION RPC ====================

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

  -- Fetch order with lock
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

  -- Block invoicing for pending/cancelled orders
  IF v_order_record.status IN ('pending', 'cancelled') THEN
    RAISE EXCEPTION 'Nao e possivel faturar pedidos com status "%" .', v_order_record.status;
  END IF;

  -- Block if total is zero or negative
  IF v_order_record.total IS NULL OR v_order_record.total <= 0 THEN
    RAISE EXCEPTION 'O pedido nao possui valor total valido para faturamento.';
  END IF;

  -- Check for existing invoice (UNIQUE constraint on order_id also enforces this)
  IF EXISTS (SELECT 1 FROM public.invoices WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Ja existe uma fatura para este pedido.';
  END IF;

  -- Resolve payment info (prefer explicit params, fallback to order snapshot)
  p_payment_method_id := COALESCE(p_payment_method_id, v_order_record.order_payment_method_id);
  p_payment_method_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_method_name, '')), ''), v_order_record.order_payment_method_name);
  p_payment_condition_id := COALESCE(p_payment_condition_id, v_order_record.order_payment_condition_id);
  p_payment_condition_name := COALESCE(NULLIF(TRIM(COALESCE(p_payment_condition_name, '')), ''), v_order_record.order_payment_condition_name);
  v_installment_count := COALESCE(p_installment_count, v_order_record.order_payment_installments, 1);

  IF v_installment_count < 1 THEN
    v_installment_count := 1;
  END IF;

  -- Create invoice
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

  -- Calculate installments
  v_installment_amount := TRUNC(v_order_record.total / v_installment_count, 2);
  v_remainder := v_order_record.total - (v_installment_amount * v_installment_count);

  -- Parse installment_days if provided (e.g., '30, 60, 90')
  IF p_installment_days IS NOT NULL AND TRIM(p_installment_days) <> '' THEN
    v_days_arr := string_to_array(REPLACE(p_installment_days, ' ', ''), ',');
  ELSE
    v_days_arr := NULL;
  END IF;

  FOR i IN 1..v_installment_count LOOP
    -- Determine due date
    IF v_days_arr IS NOT NULL AND i <= array_length(v_days_arr, 1) THEN
      v_day_offset := COALESCE(NULLIF(TRIM(v_days_arr[i]), '')::INTEGER, i * 30);
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

  -- Create audit event
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
      'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
      'payment_method_name', p_payment_method_name,
      'payment_condition_name', p_payment_condition_name,
      'source', 'admin_invoice_order_atomic'
    ),
    v_auth_user
  );

  -- Generate client notification
  INSERT INTO public.client_notifications (
    profile_id,
    type,
    title,
    message,
    link,
    order_id,
    metadata
  )
  VALUES (
    v_order_record.profile_id,
    'financial',
    FORMAT('Fatura %s gerada', v_invoice_number),
    FORMAT('Uma fatura no valor de R$ %s foi gerada para o pedido %s com %s parcela(s).', 
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
      'source', 'admin_invoice_order_atomic'
    )
  );

  RETURN QUERY SELECT
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
