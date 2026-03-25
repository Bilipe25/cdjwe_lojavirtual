-- ============================================================
-- Migration 039: Financial Payment Write-off (Baixa de Pagamento)
-- Goal:
-- - Atomic RPC for recording installment payments
-- - Updates installment + invoice paid/open amounts and statuses
-- - Creates audit event + client notification
-- ============================================================

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
  v_invoice RECORD;
  v_new_inst_paid NUMERIC(12,2);
  v_new_inst_status TEXT;
  v_new_inv_paid NUMERIC(12,2);
  v_new_inv_open NUMERIC(12,2);
  v_new_inv_status TEXT;
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

  -- Fetch installment with lock
  SELECT
    ii.id,
    ii.invoice_id,
    ii.installment_number,
    ii.amount,
    ii.paid_amount,
    ii.status
  INTO v_inst
  FROM public.invoice_installments ii
  WHERE ii.id = p_installment_id
  FOR UPDATE OF ii;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  IF v_inst.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Parcela ja esta com status "%". Nao e possivel registrar pagamento.', v_inst.status;
  END IF;

  -- Calculate new paid amount (cap at installment amount)
  v_new_inst_paid := LEAST(v_inst.paid_amount + p_amount, v_inst.amount);

  -- Determine new installment status
  IF v_new_inst_paid >= v_inst.amount THEN
    v_new_inst_status := 'paid';
  ELSE
    v_new_inst_status := 'open'; -- still open (partial payment)
  END IF;

  -- Update installment
  UPDATE public.invoice_installments
  SET
    paid_amount = v_new_inst_paid,
    status = v_new_inst_status,
    paid_at = CASE WHEN v_new_inst_status = 'paid' THEN COALESCE(p_paid_date::TIMESTAMPTZ, NOW()) ELSE paid_at END,
    notes = CASE WHEN p_notes IS NOT NULL THEN COALESCE(notes || E'\n', '') || p_notes ELSE notes END,
    updated_at = NOW()
  WHERE id = p_installment_id;

  -- Recalculate invoice totals from all installments
  SELECT
    COALESCE(SUM(ii.paid_amount), 0),
    inv.total_amount - COALESCE(SUM(ii.paid_amount), 0)
  INTO v_new_inv_paid, v_new_inv_open
  FROM public.invoice_installments ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  WHERE ii.invoice_id = v_inst.invoice_id
  GROUP BY inv.total_amount;

  -- Ensure non-negative
  IF v_new_inv_open < 0 THEN
    v_new_inv_open := 0;
  END IF;

  -- Determine new invoice status
  IF v_new_inv_open <= 0 THEN
    v_new_inv_status := 'paid';
  ELSIF v_new_inv_paid > 0 THEN
    v_new_inv_status := 'partial';
  ELSE
    v_new_inv_status := 'open';
  END IF;

  -- Update invoice
  UPDATE public.invoices
  SET
    paid_amount = v_new_inv_paid,
    open_amount = v_new_inv_open,
    status = v_new_inv_status,
    updated_at = NOW()
  WHERE id = v_inst.invoice_id
  RETURNING * INTO v_invoice;

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
    v_inst.invoice_id,
    'payment_received',
    FORMAT('Pagamento de R$ %s registrado na parcela %s. Status da parcela: %s. Status da fatura: %s.',
      TO_CHAR(p_amount, 'FM999G999G999D00'),
      v_inst.installment_number,
      v_new_inst_status,
      v_new_inv_status
    ),
    p_amount,
    jsonb_build_object(
      'installment_id', p_installment_id,
      'installment_number', v_inst.installment_number,
      'payment_amount', p_amount,
      'paid_date', COALESCE(p_paid_date, CURRENT_DATE),
      'new_installment_status', v_new_inst_status,
      'new_invoice_status', v_new_inv_status,
      'invoice_paid_total', v_new_inv_paid,
      'invoice_open_total', v_new_inv_open,
      'source', 'admin_record_installment_payment'
    ),
    v_auth_user
  );

  -- Notify client
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
    v_invoice.profile_id,
    'financial',
    FORMAT('Pagamento registrado — Fatura %s', v_invoice.invoice_number),
    FORMAT('Pagamento de R$ %s registrado na parcela %s/%s da fatura %s.',
      TO_CHAR(p_amount, 'FM999G999G999D00'),
      v_inst.installment_number,
      v_invoice.installment_count,
      v_invoice.invoice_number
    ),
    '/invoices',
    v_invoice.order_id,
    jsonb_build_object(
      'invoice_id', v_inst.invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'payment_amount', p_amount,
      'installment_number', v_inst.installment_number,
      'source', 'admin_record_installment_payment'
    )
  );

  RETURN QUERY SELECT
    p_installment_id,
    v_inst.invoice_id,
    v_invoice.invoice_number,
    v_inst.installment_number,
    v_new_inst_paid,
    v_new_inst_status,
    v_new_inv_status,
    v_new_inv_paid,
    v_new_inv_open;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_installment_payment(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_installment_payment(UUID, NUMERIC, DATE, TEXT) TO authenticated, service_role;
