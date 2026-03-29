-- ============================================================
-- Migration 048: Financial P0 Reliability Hardening
-- Goals:
-- - Payment ledger + installment allocations (append-only history)
-- - Strict payment write-off with invoice locking and overpayment errors
-- - Formal financial status transitions
-- - Materialized overdue states (daily sync job)
-- - Transactional invoice numbering via sequence
-- - Sync orders.payment_status with real financial state
-- ============================================================

-- ==================== INVOICE NUMBER SEQUENCE ====================

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq
  AS BIGINT
  INCREMENT BY 1
  MINVALUE 1
  START WITH 1
  CACHE 20;

DO $$
DECLARE
  v_max_invoice_num BIGINT;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN invoice_number ~ '^FAT[0-9]+$'
          THEN CAST(SUBSTRING(invoice_number FROM 4) AS BIGINT)
        ELSE NULL
      END
    ),
    0
  )
  INTO v_max_invoice_num
  FROM public.invoices;

  IF v_max_invoice_num > 0 THEN
    PERFORM setval('public.invoice_number_seq', v_max_invoice_num, true);
  ELSE
    PERFORM setval('public.invoice_number_seq', 1, false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR BTRIM(NEW.invoice_number) = '' THEN
    NEW.invoice_number := 'FAT' || LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- ==================== PAYMENT LEDGER ====================

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_method_name TEXT,
  reference TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id
  ON public.invoice_payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_store_id
  ON public.invoice_payments(store_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_profile_id
  ON public.invoice_payments(profile_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date
  ON public.invoice_payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_created_at
  ON public.invoice_payments(created_at);

CREATE TABLE IF NOT EXISTS public.invoice_payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES public.invoice_payments(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  installment_id UUID NOT NULL REFERENCES public.invoice_installments(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(12,2) NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_id, installment_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_allocations_payment_id
  ON public.invoice_payment_allocations(payment_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_allocations_invoice_id
  ON public.invoice_payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_allocations_installment_id
  ON public.invoice_payment_allocations(installment_id);

-- Backfill baseline ledger from existing installment paid amounts.
WITH installments_to_backfill AS (
  SELECT
    ii.id AS installment_id,
    ii.invoice_id,
    ii.paid_amount AS backfill_amount,
    COALESCE(ii.paid_at::DATE, inv.issue_date, CURRENT_DATE) AS payment_date,
    inv.store_id,
    inv.profile_id,
    inv.created_by,
    inv.payment_method_id,
    inv.payment_method_name
  FROM public.invoice_installments ii
  JOIN public.invoices inv
    ON inv.id = ii.invoice_id
  WHERE ii.paid_amount > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoice_payment_allocations ipa
      WHERE ipa.installment_id = ii.id
    )
),
inserted_payments AS (
  INSERT INTO public.invoice_payments (
    invoice_id,
    store_id,
    profile_id,
    payment_date,
    amount,
    payment_method_id,
    payment_method_name,
    reference,
    notes,
    metadata,
    created_by
  )
  SELECT
    b.invoice_id,
    b.store_id,
    b.profile_id,
    b.payment_date,
    b.backfill_amount,
    b.payment_method_id,
    b.payment_method_name,
    b.installment_id::TEXT,
    'Backfill historico (migration 048)',
    jsonb_build_object(
      'source', 'migration_048_backfill',
      'installment_id', b.installment_id
    ),
    COALESCE(b.created_by, b.profile_id)
  FROM installments_to_backfill b
  RETURNING id, invoice_id, reference, amount
)
INSERT INTO public.invoice_payment_allocations (
  payment_id,
  invoice_id,
  installment_id,
  allocated_amount
)
SELECT
  p.id,
  p.invoice_id,
  p.reference::UUID,
  p.amount
FROM inserted_payments p;

CREATE OR REPLACE FUNCTION public.validate_invoice_payment_allocation_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_invoice_id UUID;
  v_installment_invoice_id UUID;
BEGIN
  SELECT invoice_id
    INTO v_payment_invoice_id
    FROM public.invoice_payments
   WHERE id = NEW.payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento nao encontrado para alocacao.';
  END IF;

  SELECT invoice_id
    INTO v_installment_invoice_id
    FROM public.invoice_installments
   WHERE id = NEW.installment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada para alocacao.';
  END IF;

  IF v_payment_invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'A fatura da alocacao diverge da fatura do pagamento.';
  END IF;

  IF v_installment_invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'A fatura da alocacao diverge da fatura da parcela.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_payment_allocation_link
  ON public.invoice_payment_allocations;

CREATE TRIGGER trg_validate_invoice_payment_allocation_link
  BEFORE INSERT OR UPDATE ON public.invoice_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_payment_allocation_link();

CREATE OR REPLACE FUNCTION public.validate_invoice_payment_allocation_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_amount NUMERIC(12,2);
  v_allocated_total NUMERIC(12,2);
BEGIN
  v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);

  SELECT amount
    INTO v_payment_amount
    FROM public.invoice_payments
   WHERE id = v_payment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_allocated_total
    FROM public.invoice_payment_allocations
   WHERE payment_id = v_payment_id;

  IF ABS(v_allocated_total - v_payment_amount) > 0.009 THEN
    RAISE EXCEPTION
      'Soma das alocacoes (%s) difere do valor do pagamento (%s).',
      v_allocated_total,
      v_payment_amount;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_payment_allocation_totals
  ON public.invoice_payment_allocations;

CREATE CONSTRAINT TRIGGER trg_validate_invoice_payment_allocation_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payment_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_payment_allocation_totals();

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_payments'
      AND policyname = 'Users can view own invoice payments'
  ) THEN
    CREATE POLICY "Users can view own invoice payments"
      ON public.invoice_payments
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

-- ==================== FORMAL STATUS TRANSITIONS ====================

CREATE OR REPLACE FUNCTION public.is_valid_invoice_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_old_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  CASE p_old_status
    WHEN 'open' THEN
      RETURN p_new_status IN ('partial', 'paid', 'overdue', 'cancelled', 'renegotiated');
    WHEN 'partial' THEN
      RETURN p_new_status IN ('open', 'paid', 'overdue', 'cancelled', 'renegotiated');
    WHEN 'overdue' THEN
      RETURN p_new_status IN ('open', 'partial', 'paid', 'cancelled', 'renegotiated');
    WHEN 'paid' THEN
      RETURN p_new_status IN ('open', 'partial', 'overdue', 'renegotiated');
    WHEN 'cancelled' THEN
      RETURN p_new_status IN ('open');
    WHEN 'renegotiated' THEN
      RETURN p_new_status IN ('open', 'partial', 'paid', 'overdue', 'cancelled');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_valid_invoice_status_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Transicao de status da fatura invalida: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_status_transition
  ON public.invoices;

CREATE TRIGGER trg_enforce_invoice_status_transition
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_invoice_status_transition();

CREATE OR REPLACE FUNCTION public.is_valid_installment_status_transition(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_old_status = p_new_status THEN
    RETURN TRUE;
  END IF;

  CASE p_old_status
    WHEN 'open' THEN
      RETURN p_new_status IN ('overdue', 'paid', 'cancelled');
    WHEN 'overdue' THEN
      RETURN p_new_status IN ('open', 'paid', 'cancelled');
    WHEN 'paid' THEN
      RETURN p_new_status IN ('open', 'overdue');
    WHEN 'cancelled' THEN
      RETURN p_new_status IN ('open');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_installment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_valid_installment_status_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Transicao de status da parcela invalida: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_installment_status_transition
  ON public.invoice_installments;

CREATE TRIGGER trg_enforce_installment_status_transition
  BEFORE UPDATE OF status ON public.invoice_installments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_installment_status_transition();

-- ==================== ORDER PAYMENT STATUS SYNC ====================

CREATE OR REPLACE FUNCTION public.compute_order_payment_status(
  p_order_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_order_status TEXT;
  v_has_invoice BOOLEAN;
  v_open_amount NUMERIC(12,2);
  v_any_overdue BOOLEAN;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order_id obrigatorio.';
  END IF;

  SELECT status
    INTO v_order_status
    FROM public.orders
   WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado.';
  END IF;

  IF v_order_status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.invoices inv
     WHERE inv.order_id = p_order_id
       AND inv.status <> 'cancelled'
  )
  INTO v_has_invoice;

  IF NOT v_has_invoice THEN
    RETURN 'pending';
  END IF;

  SELECT COALESCE(SUM(inv.open_amount), 0)
    INTO v_open_amount
  FROM public.invoices inv
  WHERE inv.order_id = p_order_id
    AND inv.status <> 'cancelled';

  SELECT EXISTS (
    SELECT 1
      FROM public.invoice_installments ii
      JOIN public.invoices inv
        ON inv.id = ii.invoice_id
     WHERE inv.order_id = p_order_id
       AND inv.status <> 'cancelled'
       AND (
         ii.status = 'overdue'
         OR (
           ii.status = 'open'
           AND ii.amount > ii.paid_amount
           AND ii.due_date < p_reference_date
         )
       )
  )
    INTO v_any_overdue;

  IF v_open_amount <= 0 THEN
    RETURN 'paid';
  ELSIF v_any_overdue THEN
    RETURN 'overdue';
  ELSE
    RETURN 'pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_payment_status(
  p_order_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_status TEXT;
BEGIN
  v_payment_status := public.compute_order_payment_status(p_order_id, p_reference_date);

  UPDATE public.orders o
     SET payment_status = v_payment_status,
         updated_at = NOW()
   WHERE o.id = p_order_id
     AND o.payment_status IS DISTINCT FROM v_payment_status;

  RETURN v_payment_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_order_payment_status_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  IF v_order_id IS NOT NULL THEN
    PERFORM public.sync_order_payment_status(v_order_id, CURRENT_DATE);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_status_from_invoice
  ON public.invoices;

CREATE TRIGGER trg_sync_order_payment_status_from_invoice
  AFTER INSERT OR UPDATE OF status, open_amount, paid_amount, order_id OR DELETE
  ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_order_payment_status_from_invoice();

CREATE OR REPLACE FUNCTION public.trg_sync_order_payment_status_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sync_order_payment_status(NEW.id, CURRENT_DATE);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_status_from_order
  ON public.orders;

CREATE TRIGGER trg_sync_order_payment_status_from_order
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_order_payment_status_from_order();

-- ==================== FINANCIAL STATE RECOMPUTE ====================

CREATE OR REPLACE FUNCTION public.recompute_invoice_financial_state(
  p_invoice_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE,
  p_lock_invoice BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  invoice_id UUID,
  invoice_status TEXT,
  invoice_paid_amount NUMERIC,
  invoice_open_amount NUMERIC,
  overdue_installment_count INTEGER,
  open_installment_count INTEGER,
  paid_installment_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_invoice RECORD;
  v_paid_total NUMERIC(12,2);
  v_open_total NUMERIC(12,2);
  v_new_status TEXT;
  v_overdue_count INTEGER;
  v_open_count INTEGER;
  v_paid_count INTEGER;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'invoice_id obrigatorio.';
  END IF;

  IF p_lock_invoice THEN
    SELECT inv.*
      INTO v_invoice
      FROM public.invoices inv
     WHERE inv.id = p_invoice_id
     FOR UPDATE OF inv;
  ELSE
    SELECT inv.*
      INTO v_invoice
      FROM public.invoices inv
     WHERE inv.id = p_invoice_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura nao encontrada.';
  END IF;

  WITH installment_ledger_totals AS (
    SELECT
      ii.id AS installment_id,
      COALESCE(SUM(ipa.allocated_amount), 0)::NUMERIC(12,2) AS paid_from_ledger
    FROM public.invoice_installments ii
    LEFT JOIN public.invoice_payment_allocations ipa
      ON ipa.installment_id = ii.id
    WHERE ii.invoice_id = p_invoice_id
    GROUP BY ii.id
  )
  UPDATE public.invoice_installments ii
     SET paid_amount = t.paid_from_ledger,
         status = CASE
           WHEN ii.status = 'cancelled' THEN 'cancelled'
           WHEN t.paid_from_ledger >= ii.amount THEN 'paid'
           WHEN ii.due_date < p_reference_date THEN 'overdue'
           ELSE 'open'
         END,
         paid_at = CASE
           WHEN t.paid_from_ledger >= ii.amount THEN COALESCE(ii.paid_at, NOW())
           ELSE NULL
         END,
         updated_at = NOW()
    FROM installment_ledger_totals t
   WHERE ii.id = t.installment_id
     AND (
       ii.paid_amount IS DISTINCT FROM t.paid_from_ledger
       OR ii.status IS DISTINCT FROM CASE
         WHEN ii.status = 'cancelled' THEN 'cancelled'
         WHEN t.paid_from_ledger >= ii.amount THEN 'paid'
         WHEN ii.due_date < p_reference_date THEN 'overdue'
         ELSE 'open'
       END
       OR (
         t.paid_from_ledger >= ii.amount
         AND ii.paid_at IS NULL
       )
       OR (
         t.paid_from_ledger < ii.amount
         AND ii.paid_at IS NOT NULL
       )
     );

  SELECT
    COALESCE(SUM(ii.paid_amount), 0),
    GREATEST(v_invoice.total_amount - COALESCE(SUM(ii.paid_amount), 0), 0),
    COUNT(*) FILTER (WHERE ii.status = 'overdue')::INTEGER,
    COUNT(*) FILTER (WHERE ii.status = 'open')::INTEGER,
    COUNT(*) FILTER (WHERE ii.status = 'paid')::INTEGER
  INTO
    v_paid_total,
    v_open_total,
    v_overdue_count,
    v_open_count,
    v_paid_count
  FROM public.invoice_installments ii
  WHERE ii.invoice_id = p_invoice_id;

  IF v_invoice.status = 'cancelled' THEN
    v_new_status := 'cancelled';
  ELSIF v_invoice.status = 'renegotiated' THEN
    v_new_status := 'renegotiated';
  ELSIF v_open_total <= 0 THEN
    v_new_status := 'paid';
  ELSIF v_overdue_count > 0 THEN
    v_new_status := 'overdue';
  ELSIF v_paid_total > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'open';
  END IF;

  UPDATE public.invoices inv
     SET paid_amount = v_paid_total,
         open_amount = v_open_total,
         status = v_new_status,
         updated_at = NOW()
   WHERE inv.id = p_invoice_id
     AND (
       inv.paid_amount IS DISTINCT FROM v_paid_total
       OR inv.open_amount IS DISTINCT FROM v_open_total
       OR inv.status IS DISTINCT FROM v_new_status
     );

  PERFORM public.sync_order_payment_status(v_invoice.order_id, p_reference_date);

  RETURN QUERY
  SELECT
    p_invoice_id,
    v_new_status,
    v_paid_total,
    v_open_total,
    v_overdue_count,
    v_open_count,
    v_paid_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_financial_overdue_status(
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  processed_invoices INTEGER,
  overdue_installments INTEGER,
  overdue_orders INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_processed_invoices INTEGER := 0;
  v_overdue_installments INTEGER := 0;
  v_overdue_orders INTEGER := 0;
BEGIN
  FOR v_invoice IN
    SELECT DISTINCT inv.id
      FROM public.invoices inv
     WHERE inv.status NOT IN ('cancelled', 'renegotiated')
  LOOP
    PERFORM public.recompute_invoice_financial_state(v_invoice.id, p_reference_date, FALSE);
    v_processed_invoices := v_processed_invoices + 1;
  END LOOP;

  SELECT COUNT(*)::INTEGER
    INTO v_overdue_installments
    FROM public.invoice_installments ii
   WHERE ii.status = 'overdue';

  SELECT COUNT(*)::INTEGER
    INTO v_overdue_orders
    FROM public.orders o
   WHERE o.payment_status = 'overdue';

  RETURN QUERY SELECT v_processed_invoices, v_overdue_installments, v_overdue_orders;
END;
$$;

-- Backfill overdue materialization once on deploy.
SELECT * FROM public.sync_financial_overdue_status(CURRENT_DATE);

-- Backfill orders.payment_status based on financial truth.
WITH computed AS (
  SELECT
    o.id,
    public.compute_order_payment_status(o.id, CURRENT_DATE) AS computed_payment_status
  FROM public.orders o
)
UPDATE public.orders o
   SET payment_status = c.computed_payment_status,
       updated_at = NOW()
  FROM computed c
 WHERE c.id = o.id
   AND o.payment_status IS DISTINCT FROM c.computed_payment_status;

-- Schedule daily overdue materialization if pg_cron is available.
DO $$
DECLARE
  v_has_pg_cron BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_extension
     WHERE extname = 'pg_cron'
  )
  INTO v_has_pg_cron;

  IF v_has_pg_cron THEN
    BEGIN
      EXECUTE $sql$
        SELECT cron.unschedule(jobid)
          FROM cron.job
         WHERE jobname = 'financial-overdue-sync-daily'
      $sql$;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
      EXECUTE $sql$
        SELECT cron.schedule(
          'financial-overdue-sync-daily',
          '15 1 * * *',
          $cron$SELECT public.sync_financial_overdue_status(CURRENT_DATE);$cron$
        )
      $sql$;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_payments'
      AND policyname = 'Admins can manage all invoice payments'
  ) THEN
    CREATE POLICY "Admins can manage all invoice payments"
      ON public.invoice_payments
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
      AND tablename = 'invoice_payment_allocations'
      AND policyname = 'Users can view own invoice payment allocations'
  ) THEN
    CREATE POLICY "Users can view own invoice payment allocations"
      ON public.invoice_payment_allocations
      FOR SELECT
      USING (
        invoice_id IN (
          SELECT inv.id
            FROM public.invoices inv
           WHERE inv.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoice_payment_allocations'
      AND policyname = 'Admins can manage all invoice payment allocations'
  ) THEN
    CREATE POLICY "Admins can manage all invoice payment allocations"
      ON public.invoice_payment_allocations
      FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.compute_order_payment_status(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_order_payment_status(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_invoice_financial_state(UUID, DATE, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_financial_overdue_status(DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.compute_order_payment_status(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_order_payment_status(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_invoice_financial_state(UUID, DATE, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_financial_overdue_status(DATE) TO service_role;

-- ==================== STRICT PAYMENT WRITEOFF RPC ====================

CREATE OR REPLACE FUNCTION public.admin_record_installment_payment(
  p_installment_id UUID,
  p_amount NUMERIC(12,2),
  p_paid_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  installment_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  installment_number INTEGER,
  paid_amount NUMERIC,
  installment_status TEXT,
  invoice_status TEXT,
  invoice_paid_amount NUMERIC,
  invoice_open_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_inst RECORD;
  v_new_inst_paid NUMERIC(12,2);
  v_new_inst_status TEXT;
  v_remaining NUMERIC(12,2);
  v_payment_id UUID;
  v_financial_state RECORD;
  v_event_type TEXT;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada. Apenas administradores podem registrar pagamentos.';
  END IF;

  IF p_installment_id IS NULL THEN
    RAISE EXCEPTION 'installment_id obrigatorio.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero.';
  END IF;

  SELECT
    ii.id,
    ii.invoice_id,
    ii.installment_number,
    ii.due_date,
    ii.amount,
    COALESCE(
      (
        SELECT SUM(ipa.allocated_amount)
        FROM public.invoice_payment_allocations ipa
        WHERE ipa.installment_id = ii.id
      ),
      ii.paid_amount
    )::NUMERIC(12,2) AS paid_amount,
    ii.status,
    inv.status AS invoice_status,
    inv.invoice_number,
    inv.order_id,
    inv.store_id,
    inv.profile_id,
    inv.installment_count,
    inv.payment_method_id,
    inv.payment_method_name
  INTO v_inst
  FROM public.invoice_installments ii
  JOIN public.invoices inv
    ON inv.id = ii.invoice_id
  WHERE ii.id = p_installment_id
  FOR UPDATE OF ii, inv;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  IF v_inst.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Parcela ja esta com status "%". Nao e possivel registrar pagamento.', v_inst.status;
  END IF;

  IF v_inst.invoice_status IN ('cancelled', 'renegotiated') THEN
    RAISE EXCEPTION 'A fatura esta com status "%" e nao permite baixa.', v_inst.invoice_status;
  END IF;

  IF v_inst.status NOT IN ('open', 'overdue') THEN
    RAISE EXCEPTION 'Status da parcela "%" nao permite baixa.', v_inst.status;
  END IF;

  v_remaining := v_inst.amount - v_inst.paid_amount;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Parcela sem saldo em aberto.';
  END IF;

  IF p_amount > v_remaining THEN
    RAISE EXCEPTION
      'Valor do pagamento (%s) excede saldo da parcela (%s).',
      p_amount,
      v_remaining;
  END IF;

  v_new_inst_paid := v_inst.paid_amount + p_amount;

  IF v_new_inst_paid >= v_inst.amount THEN
    v_new_inst_status := 'paid';
  ELSIF v_inst.due_date < COALESCE(p_paid_date, CURRENT_DATE) THEN
    v_new_inst_status := 'overdue';
  ELSE
    v_new_inst_status := 'open';
  END IF;

  UPDATE public.invoice_installments ii
     SET paid_amount = v_new_inst_paid,
         status = v_new_inst_status,
         paid_at = CASE
           WHEN v_new_inst_status = 'paid' THEN COALESCE(p_paid_date::TIMESTAMPTZ, NOW())
           ELSE NULL
         END,
         notes = CASE
           WHEN p_notes IS NOT NULL THEN COALESCE(ii.notes || E'\n', '') || p_notes
           ELSE ii.notes
         END,
         updated_at = NOW()
   WHERE ii.id = p_installment_id;

  INSERT INTO public.invoice_payments (
    invoice_id,
    store_id,
    profile_id,
    payment_date,
    amount,
    payment_method_id,
    payment_method_name,
    notes,
    metadata,
    created_by
  )
  VALUES (
    v_inst.invoice_id,
    v_inst.store_id,
    v_inst.profile_id,
    COALESCE(p_paid_date, CURRENT_DATE),
    p_amount,
    v_inst.payment_method_id,
    v_inst.payment_method_name,
    p_notes,
    jsonb_build_object(
      'source', 'admin_record_installment_payment',
      'installment_id', p_installment_id,
      'installment_number', v_inst.installment_number
    ),
    v_auth_user
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.invoice_payment_allocations (
    payment_id,
    invoice_id,
    installment_id,
    allocated_amount
  )
  VALUES (
    v_payment_id,
    v_inst.invoice_id,
    p_installment_id,
    p_amount
  );

  SELECT *
    INTO v_financial_state
    FROM public.recompute_invoice_financial_state(
      v_inst.invoice_id,
      COALESCE(p_paid_date, CURRENT_DATE),
      FALSE
    );

  v_event_type := CASE
    WHEN p_amount < v_remaining THEN 'partial_payment'
    ELSE 'payment_received'
  END;

  INSERT INTO public.invoice_events (
    invoice_id,
    event_type,
    description,
    amount,
    metadata,
    created_by
  )
  VALUES (
    v_inst.invoice_id,
    v_event_type,
    FORMAT(
      'Pagamento de R$ %s registrado na parcela %s. Status da parcela: %s. Status da fatura: %s.',
      TO_CHAR(p_amount, 'FM999G999G999D00'),
      v_inst.installment_number,
      v_new_inst_status,
      v_financial_state.invoice_status
    ),
    p_amount,
    jsonb_build_object(
      'installment_id', p_installment_id,
      'installment_number', v_inst.installment_number,
      'payment_id', v_payment_id,
      'payment_amount', p_amount,
      'paid_date', COALESCE(p_paid_date, CURRENT_DATE),
      'new_installment_status', v_new_inst_status,
      'new_invoice_status', v_financial_state.invoice_status,
      'invoice_paid_total', v_financial_state.invoice_paid_amount,
      'invoice_open_total', v_financial_state.invoice_open_amount,
      'source', 'admin_record_installment_payment'
    ),
    v_auth_user
  );

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
    v_inst.profile_id,
    'financial',
    FORMAT('Pagamento registrado - Fatura %s', v_inst.invoice_number),
    FORMAT(
      'Pagamento de R$ %s registrado na parcela %s/%s da fatura %s.',
      TO_CHAR(p_amount, 'FM999G999G999D00'),
      v_inst.installment_number,
      v_inst.installment_count,
      v_inst.invoice_number
    ),
    '/invoices',
    v_inst.order_id,
    jsonb_build_object(
      'invoice_id', v_inst.invoice_id,
      'invoice_number', v_inst.invoice_number,
      'payment_id', v_payment_id,
      'payment_amount', p_amount,
      'installment_number', v_inst.installment_number,
      'source', 'admin_record_installment_payment'
    )
  );

  RETURN QUERY
  SELECT
    p_installment_id,
    v_inst.invoice_id,
    v_inst.invoice_number,
    v_inst.installment_number,
    v_new_inst_paid,
    v_new_inst_status,
    v_financial_state.invoice_status,
    v_financial_state.invoice_paid_amount,
    v_financial_state.invoice_open_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_installment_payment(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_installment_payment(UUID, NUMERIC, DATE, TEXT) TO authenticated, service_role;

