-- ============================================================
-- Migration 124: Representative ready-delivery stock enterprise
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.representative_stock_transfer_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.representative_receipt_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.representative_day_closing_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.representative_stock (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  size_option_id UUID REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_representative_stock_variant_without_size
  ON public.representative_stock(representative_id, product_variant_id)
  WHERE size_option_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_representative_stock_variant_with_size
  ON public.representative_stock(representative_id, product_variant_id, size_option_id)
  WHERE size_option_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_representative_stock_rep_available
  ON public.representative_stock(representative_id, quantity_available DESC);

CREATE INDEX IF NOT EXISTS idx_representative_stock_variant
  ON public.representative_stock(product_variant_id, size_option_id);

DROP TRIGGER IF EXISTS update_representative_stock_updated_at ON public.representative_stock;
CREATE TRIGGER update_representative_stock_updated_at
  BEFORE UPDATE ON public.representative_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.representative_stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number TEXT NOT NULL UNIQUE DEFAULT ('TRF' || LPAD(nextval('public.representative_stock_transfer_number_seq')::TEXT, 6, '0')),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_representative_stock_transfers_rep
  ON public.representative_stock_transfers(representative_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_representative_stock_transfers_status
  ON public.representative_stock_transfers(status, created_at DESC);

DROP TRIGGER IF EXISTS update_representative_stock_transfers_updated_at ON public.representative_stock_transfers;
CREATE TRIGGER update_representative_stock_transfers_updated_at
  BEFORE UPDATE ON public.representative_stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.representative_stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES public.representative_stock_transfers(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  size_option_id UUID REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_representative_stock_transfer_items_transfer
  ON public.representative_stock_transfer_items(transfer_id);

CREATE INDEX IF NOT EXISTS idx_representative_stock_transfer_items_variant
  ON public.representative_stock_transfer_items(product_variant_id, size_option_id);

CREATE TABLE IF NOT EXISTS public.representative_stock_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  size_option_id UUID REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  order_draft_id TEXT NOT NULL,
  cart_key TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_representative_stock_reservations_active
  ON public.representative_stock_reservations(representative_id, product_variant_id, size_option_id, expires_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_representative_stock_reservations_draft
  ON public.representative_stock_reservations(representative_id, order_draft_id, status);

DROP TRIGGER IF EXISTS update_representative_stock_reservations_updated_at ON public.representative_stock_reservations;
CREATE TRIGGER update_representative_stock_reservations_updated_at
  BEFORE UPDATE ON public.representative_stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.representative_day_closings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  closing_number TEXT NOT NULL UNIQUE DEFAULT ('FEC' || LPAD(nextval('public.representative_day_closing_number_seq')::TEXT, 6, '0')),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  business_date DATE NOT NULL DEFAULT CURRENT_DATE,
  route_label TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('open', 'submitted', 'approved', 'reopened', 'cancelled')),
  orders_count INTEGER NOT NULL DEFAULT 0 CHECK (orders_count >= 0),
  items_count INTEGER NOT NULL DEFAULT 0 CHECK (items_count >= 0),
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  received_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_representative_day_closings_unique_active_day
  ON public.representative_day_closings(representative_id, business_date, COALESCE(route_label, ''))
  WHERE status IN ('open', 'submitted', 'approved');

CREATE INDEX IF NOT EXISTS idx_representative_day_closings_rep_date
  ON public.representative_day_closings(representative_id, business_date DESC);

DROP TRIGGER IF EXISTS update_representative_day_closings_updated_at ON public.representative_day_closings;
CREATE TRIGGER update_representative_day_closings_updated_at
  BEFORE UPDATE ON public.representative_day_closings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.representative_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_number TEXT NOT NULL UNIQUE DEFAULT ('REC' || LPAD(nextval('public.representative_receipt_number_seq')::TEXT, 6, '0')),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  representative_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled', 'reissued')),
  pdf_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_representative_receipts_rep
  ON public.representative_receipts(representative_id, issued_at DESC);

DROP TRIGGER IF EXISTS update_representative_receipts_updated_at ON public.representative_receipts;
CREATE TRIGGER update_representative_receipts_updated_at
  BEFORE UPDATE ON public.representative_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.representative_stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  representative_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  size_option_id UUID REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'TRANSFER_IN',
      'RESERVATION_CREATE',
      'RESERVATION_RELEASE',
      'RESERVATION_EXPIRE',
      'READY_DELIVERY_SALE',
      'SALE_CANCEL_REVERSAL',
      'RETURN_QUARANTINE',
      'ADJUSTMENT',
      'DAY_CLOSING'
    )
  ),
  quantity_delta INTEGER NOT NULL,
  quantity_available_after INTEGER NOT NULL CHECK (quantity_available_after >= 0),
  quantity_reserved_after INTEGER NOT NULL CHECK (quantity_reserved_after >= 0),
  quantity_sold_after INTEGER NOT NULL CHECK (quantity_sold_after >= 0),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  transfer_id UUID REFERENCES public.representative_stock_transfers(id) ON DELETE SET NULL,
  transfer_item_id UUID REFERENCES public.representative_stock_transfer_items(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.representative_stock_reservations(id) ON DELETE SET NULL,
  closing_id UUID REFERENCES public.representative_day_closings(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_representative_stock_movements_rep_created
  ON public.representative_stock_movements(representative_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_representative_stock_movements_variant
  ON public.representative_stock_movements(product_variant_id, size_option_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_representative_stock_movements_order
  ON public.representative_stock_movements(order_id);

CREATE OR REPLACE FUNCTION public.prevent_representative_stock_movement_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.representative_id IS NOT DISTINCT FROM OLD.representative_id
     AND NEW.product_variant_id IS NOT DISTINCT FROM OLD.product_variant_id
     AND NEW.size_option_id IS NOT DISTINCT FROM OLD.size_option_id
     AND NEW.movement_type IS NOT DISTINCT FROM OLD.movement_type
     AND NEW.quantity_delta IS NOT DISTINCT FROM OLD.quantity_delta
     AND NEW.quantity_available_after IS NOT DISTINCT FROM OLD.quantity_available_after
     AND NEW.quantity_reserved_after IS NOT DISTINCT FROM OLD.quantity_reserved_after
     AND NEW.quantity_sold_after IS NOT DISTINCT FROM OLD.quantity_sold_after
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND (NEW.order_id IS NULL OR NEW.order_id IS NOT DISTINCT FROM OLD.order_id)
     AND (NEW.order_item_id IS NULL OR NEW.order_item_id IS NOT DISTINCT FROM OLD.order_item_id)
     AND (NEW.transfer_id IS NULL OR NEW.transfer_id IS NOT DISTINCT FROM OLD.transfer_id)
     AND (NEW.transfer_item_id IS NULL OR NEW.transfer_item_id IS NOT DISTINCT FROM OLD.transfer_item_id)
     AND (NEW.reservation_id IS NULL OR NEW.reservation_id IS NOT DISTINCT FROM OLD.reservation_id)
     AND (NEW.closing_id IS NULL OR NEW.closing_id IS NOT DISTINCT FROM OLD.closing_id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Movimentacoes de estoque do representante sao append-only.';
END;
$$;

DROP TRIGGER IF EXISTS trg_representative_stock_movements_append_only ON public.representative_stock_movements;
CREATE TRIGGER trg_representative_stock_movements_append_only
  BEFORE UPDATE OR DELETE ON public.representative_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_representative_stock_movement_mutation();

ALTER TABLE public.representative_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_day_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representative_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS representative_stock_admin_all ON public.representative_stock;
CREATE POLICY representative_stock_admin_all
  ON public.representative_stock
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_stock_rep_select_own ON public.representative_stock;
CREATE POLICY representative_stock_rep_select_own
  ON public.representative_stock
  FOR SELECT
  USING (representative_id = auth.uid());

DROP POLICY IF EXISTS representative_stock_transfers_admin_all ON public.representative_stock_transfers;
CREATE POLICY representative_stock_transfers_admin_all
  ON public.representative_stock_transfers
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_stock_transfers_rep_select_own ON public.representative_stock_transfers;
CREATE POLICY representative_stock_transfers_rep_select_own
  ON public.representative_stock_transfers
  FOR SELECT
  USING (representative_id = auth.uid());

DROP POLICY IF EXISTS representative_stock_transfer_items_admin_all ON public.representative_stock_transfer_items;
CREATE POLICY representative_stock_transfer_items_admin_all
  ON public.representative_stock_transfer_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_stock_transfer_items_rep_select_own ON public.representative_stock_transfer_items;
CREATE POLICY representative_stock_transfer_items_rep_select_own
  ON public.representative_stock_transfer_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.representative_stock_transfers t
       WHERE t.id = representative_stock_transfer_items.transfer_id
         AND t.representative_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS representative_stock_reservations_admin_all ON public.representative_stock_reservations;
CREATE POLICY representative_stock_reservations_admin_all
  ON public.representative_stock_reservations
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_stock_reservations_rep_select_own ON public.representative_stock_reservations;
CREATE POLICY representative_stock_reservations_rep_select_own
  ON public.representative_stock_reservations
  FOR SELECT
  USING (representative_id = auth.uid());

DROP POLICY IF EXISTS representative_stock_movements_admin_all ON public.representative_stock_movements;
CREATE POLICY representative_stock_movements_admin_all
  ON public.representative_stock_movements
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_stock_movements_rep_select_own ON public.representative_stock_movements;
CREATE POLICY representative_stock_movements_rep_select_own
  ON public.representative_stock_movements
  FOR SELECT
  USING (representative_id = auth.uid());

DROP POLICY IF EXISTS representative_day_closings_admin_all ON public.representative_day_closings;
CREATE POLICY representative_day_closings_admin_all
  ON public.representative_day_closings
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_day_closings_rep_select_own ON public.representative_day_closings;
CREATE POLICY representative_day_closings_rep_select_own
  ON public.representative_day_closings
  FOR SELECT
  USING (representative_id = auth.uid());

DROP POLICY IF EXISTS representative_receipts_admin_all ON public.representative_receipts;
CREATE POLICY representative_receipts_admin_all
  ON public.representative_receipts
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS representative_receipts_rep_select_own ON public.representative_receipts;
CREATE POLICY representative_receipts_rep_select_own
  ON public.representative_receipts
  FOR SELECT
  USING (representative_id = auth.uid());

CREATE OR REPLACE FUNCTION public.ensure_representative_stock_row(
  p_representative_id UUID,
  p_product_variant_id UUID,
  p_size_option_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id UUID;
BEGIN
  IF p_representative_id IS NULL OR p_product_variant_id IS NULL THEN
    RAISE EXCEPTION 'Representante e variante sao obrigatorios.';
  END IF;

  IF p_size_option_id IS NULL THEN
    INSERT INTO public.representative_stock (
      representative_id,
      product_variant_id,
      size_option_id
    )
    VALUES (
      p_representative_id,
      p_product_variant_id,
      NULL
    )
    ON CONFLICT (representative_id, product_variant_id) WHERE size_option_id IS NULL
    DO UPDATE SET updated_at = public.representative_stock.updated_at
    RETURNING id INTO v_stock_id;
  ELSE
    INSERT INTO public.representative_stock (
      representative_id,
      product_variant_id,
      size_option_id
    )
    VALUES (
      p_representative_id,
      p_product_variant_id,
      p_size_option_id
    )
    ON CONFLICT (representative_id, product_variant_id, size_option_id) WHERE size_option_id IS NOT NULL
    DO UPDATE SET updated_at = public.representative_stock.updated_at
    RETURNING id INTO v_stock_id;
  END IF;

  RETURN v_stock_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_representative_stock_movement(
  p_representative_id UUID,
  p_product_variant_id UUID,
  p_size_option_id UUID,
  p_movement_type TEXT,
  p_quantity_delta INTEGER,
  p_order_id UUID DEFAULT NULL,
  p_order_item_id UUID DEFAULT NULL,
  p_transfer_id UUID DEFAULT NULL,
  p_transfer_item_id UUID DEFAULT NULL,
  p_reservation_id UUID DEFAULT NULL,
  p_closing_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock RECORD;
  v_idempotency_key TEXT;
BEGIN
  v_idempotency_key := COALESCE(
    NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), ''),
    CONCAT_WS(':', p_movement_type, p_representative_id, p_product_variant_id, COALESCE(p_size_option_id::TEXT, 'legacy'), clock_timestamp()::TEXT)
  );

  SELECT quantity_available, quantity_reserved, quantity_sold
    INTO v_stock
    FROM public.representative_stock
   WHERE representative_id = p_representative_id
     AND product_variant_id = p_product_variant_id
     AND (
       (size_option_id IS NULL AND p_size_option_id IS NULL)
       OR size_option_id = p_size_option_id
     )
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque do representante nao encontrado para registrar movimentacao.';
  END IF;

  INSERT INTO public.representative_stock_movements (
    representative_id,
    product_variant_id,
    size_option_id,
    movement_type,
    quantity_delta,
    quantity_available_after,
    quantity_reserved_after,
    quantity_sold_after,
    order_id,
    order_item_id,
    transfer_id,
    transfer_item_id,
    reservation_id,
    closing_id,
    idempotency_key,
    notes,
    metadata,
    created_by
  )
  VALUES (
    p_representative_id,
    p_product_variant_id,
    p_size_option_id,
    p_movement_type,
    p_quantity_delta,
    v_stock.quantity_available,
    v_stock.quantity_reserved,
    v_stock.quantity_sold,
    p_order_id,
    p_order_item_id,
    p_transfer_id,
    p_transfer_item_id,
    p_reservation_id,
    p_closing_id,
    v_idempotency_key,
    p_notes,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_by
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_representative_stock_reservations(
  p_representative_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
  v_stock_id UUID;
  v_expired_count INTEGER := 0;
BEGIN
  FOR v_reservation IN
    SELECT *
      FROM public.representative_stock_reservations
     WHERE status = 'active'
       AND expires_at <= NOW()
       AND (p_representative_id IS NULL OR representative_id = p_representative_id)
     ORDER BY expires_at ASC
     FOR UPDATE
  LOOP
    v_stock_id := public.ensure_representative_stock_row(
      v_reservation.representative_id,
      v_reservation.product_variant_id,
      v_reservation.size_option_id
    );

    PERFORM 1
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available + v_reservation.quantity,
           quantity_reserved = GREATEST(0, quantity_reserved - v_reservation.quantity),
           updated_at = NOW()
     WHERE id = v_stock_id;

    UPDATE public.representative_stock_reservations
       SET status = 'expired',
           updated_at = NOW()
     WHERE id = v_reservation.id;

    PERFORM public.insert_representative_stock_movement(
      v_reservation.representative_id,
      v_reservation.product_variant_id,
      v_reservation.size_option_id,
      'RESERVATION_EXPIRE',
      v_reservation.quantity,
      NULL,
      NULL,
      NULL,
      NULL,
      v_reservation.id,
      NULL,
      'reservation-expire:' || v_reservation.id::TEXT,
      'Reserva expirada automaticamente.',
      jsonb_build_object('order_draft_id', v_reservation.order_draft_id),
      v_reservation.created_by
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.representative_release_stock_reservation_atomic(
  p_order_draft_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_role TEXT;
  v_status TEXT;
  v_reservation RECORD;
  v_stock_id UUID;
  v_released_count INTEGER := 0;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  SELECT role, status
    INTO v_role, v_status
    FROM public.profiles
   WHERE id = v_auth_user;

  IF v_role <> 'representative' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Apenas representantes aprovados podem liberar reservas.';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_order_draft_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Identificador do rascunho obrigatorio.';
  END IF;

  FOR v_reservation IN
    SELECT *
      FROM public.representative_stock_reservations
     WHERE representative_id = v_auth_user
       AND order_draft_id = p_order_draft_id
       AND status = 'active'
     FOR UPDATE
  LOOP
    v_stock_id := public.ensure_representative_stock_row(
      v_reservation.representative_id,
      v_reservation.product_variant_id,
      v_reservation.size_option_id
    );

    PERFORM 1
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available + v_reservation.quantity,
           quantity_reserved = GREATEST(0, quantity_reserved - v_reservation.quantity),
           updated_at = NOW()
     WHERE id = v_stock_id;

    UPDATE public.representative_stock_reservations
       SET status = 'released',
           updated_at = NOW()
     WHERE id = v_reservation.id;

    PERFORM public.insert_representative_stock_movement(
      v_reservation.representative_id,
      v_reservation.product_variant_id,
      v_reservation.size_option_id,
      'RESERVATION_RELEASE',
      v_reservation.quantity,
      NULL,
      NULL,
      NULL,
      NULL,
      v_reservation.id,
      NULL,
      'reservation-release:' || v_reservation.id::TEXT,
      'Reserva liberada pelo builder do representante.',
      jsonb_build_object('order_draft_id', p_order_draft_id),
      v_auth_user
    );

    v_released_count := v_released_count + 1;
  END LOOP;

  RETURN v_released_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.representative_reserve_stock_atomic(
  p_order_draft_id TEXT,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_ttl_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(
  product_variant_id UUID,
  size_option_id UUID,
  quantity_available INTEGER,
  quantity_reserved INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_role TEXT;
  v_status TEXT;
  v_item RECORD;
  v_stock_id UUID;
  v_stock RECORD;
  v_reservation_id UUID;
  v_ttl_minutes INTEGER;
BEGIN
  v_auth_user := auth.uid();
  v_ttl_minutes := LEAST(60, GREATEST(1, COALESCE(p_ttl_minutes, 15)));

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  SELECT role, status
    INTO v_role, v_status
    FROM public.profiles
   WHERE id = v_auth_user;

  IF v_role <> 'representative' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Apenas representantes aprovados podem reservar estoque.';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_order_draft_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Identificador do rascunho obrigatorio.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens para reserva devem ser um array.';
  END IF;

  PERFORM public.expire_representative_stock_reservations(v_auth_user);
  PERFORM public.representative_release_stock_reservation_atomic(p_order_draft_id);

  FOR v_item IN
    SELECT
      item.product_variant_id,
      item.size_option_id,
      COALESCE(NULLIF(MIN(item.cart_key), ''), item.product_variant_id::TEXT || '::' || COALESCE(item.size_option_id::TEXT, 'legacy')) AS cart_key,
      SUM(item.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS item(
      product_variant_id UUID,
      size_option_id UUID,
      cart_key TEXT,
      quantity INTEGER
    )
    GROUP BY item.product_variant_id, item.size_option_id
  LOOP
    IF v_item.product_variant_id IS NULL THEN
      RAISE EXCEPTION 'Item de reserva sem variante.';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade de reserva invalida.';
    END IF;

    v_stock_id := public.ensure_representative_stock_row(
      v_auth_user,
      v_item.product_variant_id,
      v_item.size_option_id
    );

    SELECT *
      INTO v_stock
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    IF v_stock.quantity_available < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para pronta entrega. Disponivel: %, solicitado: %.',
        v_stock.quantity_available,
        v_item.quantity;
    END IF;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available - v_item.quantity,
           quantity_reserved = quantity_reserved + v_item.quantity,
           updated_at = NOW()
     WHERE id = v_stock_id;

    INSERT INTO public.representative_stock_reservations (
      representative_id,
      product_variant_id,
      size_option_id,
      order_draft_id,
      cart_key,
      quantity,
      expires_at,
      created_by
    )
    VALUES (
      v_auth_user,
      v_item.product_variant_id,
      v_item.size_option_id,
      p_order_draft_id,
      v_item.cart_key,
      v_item.quantity,
      NOW() + make_interval(mins => v_ttl_minutes),
      v_auth_user
    )
    RETURNING id INTO v_reservation_id;

    PERFORM public.insert_representative_stock_movement(
      v_auth_user,
      v_item.product_variant_id,
      v_item.size_option_id,
      'RESERVATION_CREATE',
      -v_item.quantity,
      NULL,
      NULL,
      NULL,
      NULL,
      v_reservation_id,
      NULL,
      'reservation-create:' || v_reservation_id::TEXT,
      'Reserva temporaria criada no builder do representante.',
      jsonb_build_object('order_draft_id', p_order_draft_id, 'ttl_minutes', v_ttl_minutes),
      v_auth_user
    );
  END LOOP;

  RETURN QUERY
  SELECT
    rs.product_variant_id,
    rs.size_option_id,
    rs.quantity_available,
    rs.quantity_reserved
  FROM public.representative_stock rs
  WHERE rs.representative_id = v_auth_user
    AND EXISTS (
      SELECT 1
        FROM public.representative_stock_reservations rr
       WHERE rr.representative_id = v_auth_user
         AND rr.order_draft_id = p_order_draft_id
         AND rr.product_variant_id = rs.product_variant_id
         AND (
           (rr.size_option_id IS NULL AND rs.size_option_id IS NULL)
           OR rr.size_option_id = rs.size_option_id
         )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_transfer_representative_stock_atomic(
  p_representative_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(transfer_id UUID, transfer_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item RECORD;
  v_transfer_item_id UUID;
  v_stock_id UUID;
  v_variant_stock INTEGER;
  v_rep_role TEXT;
  v_rep_status TEXT;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  IF p_representative_id IS NULL THEN
    RAISE EXCEPTION 'Representante obrigatorio.';
  END IF;

  SELECT role, status
    INTO v_rep_role, v_rep_status
    FROM public.profiles
   WHERE id = p_representative_id;

  IF NOT FOUND OR v_rep_role <> 'representative' THEN
    RAISE EXCEPTION 'Representante nao encontrado.';
  END IF;

  IF v_rep_status <> 'approved' THEN
    RAISE EXCEPTION 'Representante precisa estar aprovado para receber estoque.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Itens da transferencia sao obrigatorios.';
  END IF;

  INSERT INTO public.representative_stock_transfers (
    representative_id,
    status,
    notes,
    created_by,
    sent_at
  )
  VALUES (
    p_representative_id,
    'sent',
    p_notes,
    v_auth_user,
    NOW()
  )
  RETURNING id, representative_stock_transfers.transfer_number
    INTO v_transfer_id, v_transfer_number;

  FOR v_item IN
    SELECT
      item.product_variant_id,
      item.size_option_id,
      SUM(item.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS item(
      product_variant_id UUID,
      size_option_id UUID,
      quantity INTEGER
    )
    GROUP BY item.product_variant_id, item.size_option_id
  LOOP
    IF v_item.product_variant_id IS NULL THEN
      RAISE EXCEPTION 'Item da transferencia sem variante.';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantidade invalida na transferencia.';
    END IF;

    UPDATE public.product_variants
       SET stock_quantity = stock_quantity - v_item.quantity,
           updated_at = NOW()
     WHERE id = v_item.product_variant_id
       AND stock_quantity >= v_item.quantity
     RETURNING stock_quantity INTO v_variant_stock;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque geral insuficiente para transferir a variante %.', v_item.product_variant_id;
    END IF;

    INSERT INTO public.representative_stock_transfer_items (
      transfer_id,
      product_variant_id,
      size_option_id,
      quantity,
      quantity_received
    )
    VALUES (
      v_transfer_id,
      v_item.product_variant_id,
      v_item.size_option_id,
      v_item.quantity,
      v_item.quantity
    )
    RETURNING id INTO v_transfer_item_id;

    v_stock_id := public.ensure_representative_stock_row(
      p_representative_id,
      v_item.product_variant_id,
      v_item.size_option_id
    );

    PERFORM 1
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available + v_item.quantity,
           updated_at = NOW()
     WHERE id = v_stock_id;

    PERFORM public.insert_representative_stock_movement(
      p_representative_id,
      v_item.product_variant_id,
      v_item.size_option_id,
      'TRANSFER_IN',
      v_item.quantity,
      NULL,
      NULL,
      v_transfer_id,
      v_transfer_item_id,
      NULL,
      NULL,
      'transfer-in:' || v_transfer_item_id::TEXT,
      'Transferencia de estoque para representante.',
      jsonb_build_object('transfer_number', v_transfer_number, 'global_stock_after', v_variant_stock),
      v_auth_user
    );
  END LOOP;

  UPDATE public.representative_stock_transfers
     SET status = 'received',
         received_by = p_representative_id,
         received_at = NOW(),
         updated_at = NOW()
   WHERE id = v_transfer_id;

  RETURN QUERY SELECT v_transfer_id, v_transfer_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.representative_submit_day_closing_atomic(
  p_business_date DATE DEFAULT CURRENT_DATE,
  p_route_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user UUID;
  v_role TEXT;
  v_status TEXT;
  v_orders_count INTEGER := 0;
  v_items_count INTEGER := 0;
  v_gross_amount NUMERIC(12,2) := 0;
  v_closing_id UUID;
  v_snapshot JSONB;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado.';
  END IF;

  SELECT role, status
    INTO v_role, v_status
    FROM public.profiles
   WHERE id = v_auth_user;

  IF v_role <> 'representative' OR v_status <> 'approved' THEN
    RAISE EXCEPTION 'Apenas representantes aprovados podem fechar o dia.';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(o.total), 0)::NUMERIC(12,2)
    INTO v_orders_count, v_gross_amount
  FROM public.orders o
  WHERE o.order_type = 'PRONTA_ENTREGA'
    AND o.created_by_profile_id = v_auth_user
    AND o.status <> 'cancelled'
    AND (o.created_at AT TIME ZONE 'America/Fortaleza')::DATE = COALESCE(p_business_date, CURRENT_DATE);

  SELECT COALESCE(SUM(oi.quantity), 0)::INTEGER
    INTO v_items_count
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.order_type = 'PRONTA_ENTREGA'
    AND o.created_by_profile_id = v_auth_user
    AND o.status <> 'cancelled'
    AND (o.created_at AT TIME ZONE 'America/Fortaleza')::DATE = COALESCE(p_business_date, CURRENT_DATE);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'total', o.total,
      'status', o.status,
      'created_at', o.created_at
    )
    ORDER BY o.created_at
  ), '[]'::jsonb)
    INTO v_snapshot
  FROM public.orders o
  WHERE o.order_type = 'PRONTA_ENTREGA'
    AND o.created_by_profile_id = v_auth_user
    AND o.status <> 'cancelled'
    AND (o.created_at AT TIME ZONE 'America/Fortaleza')::DATE = COALESCE(p_business_date, CURRENT_DATE);

  INSERT INTO public.representative_day_closings (
    representative_id,
    business_date,
    route_label,
    status,
    orders_count,
    items_count,
    gross_amount,
    received_amount,
    snapshot,
    submitted_by,
    submitted_at
  )
  VALUES (
    v_auth_user,
    COALESCE(p_business_date, CURRENT_DATE),
    NULLIF(BTRIM(COALESCE(p_route_label, '')), ''),
    'submitted',
    v_orders_count,
    v_items_count,
    v_gross_amount,
    v_gross_amount,
    jsonb_build_object('orders', v_snapshot),
    v_auth_user,
    NOW()
  )
  ON CONFLICT (representative_id, business_date, (COALESCE(route_label, '')))
  WHERE status IN ('open', 'submitted', 'approved')
  DO UPDATE SET
    status = 'submitted',
    orders_count = EXCLUDED.orders_count,
    items_count = EXCLUDED.items_count,
    gross_amount = EXCLUDED.gross_amount,
    received_amount = EXCLUDED.received_amount,
    snapshot = EXCLUDED.snapshot,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_closing_id;

  RETURN v_closing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_representative_stock_for_ready_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_stock_rep UUID;
  v_stock_id UUID;
  v_stock RECORD;
  v_reservation RECORD;
  v_quantity_needed INTEGER;
  v_reserved_to_consume INTEGER := 0;
  v_take INTEGER;
  v_available_to_consume INTEGER;
BEGIN
  SELECT
    o.id,
    o.order_type,
    o.created_by_profile_id,
    s.representative_id AS store_representative_id,
    p.role AS creator_role
    INTO v_order
  FROM public.orders o
  JOIN public.stores s ON s.id = o.store_id
  LEFT JOIN public.profiles p ON p.id = o.created_by_profile_id
  WHERE o.id = NEW.order_id;

  IF NOT FOUND OR v_order.order_type <> 'PRONTA_ENTREGA' THEN
    RETURN NEW;
  END IF;

  v_stock_rep := CASE
    WHEN v_order.creator_role = 'representative' THEN v_order.created_by_profile_id
    ELSE v_order.store_representative_id
  END;

  IF v_stock_rep IS NULL THEN
    RAISE EXCEPTION 'Pedido pronta entrega sem representante para baixa de estoque.';
  END IF;

  PERFORM public.expire_representative_stock_reservations(v_stock_rep);

  v_stock_id := public.ensure_representative_stock_row(
    v_stock_rep,
    NEW.product_variant_id,
    NEW.size_option_id
  );

  SELECT *
    INTO v_stock
    FROM public.representative_stock
   WHERE id = v_stock_id
   FOR UPDATE;

  v_quantity_needed := NEW.quantity;

  FOR v_reservation IN
    SELECT *
      FROM public.representative_stock_reservations
     WHERE representative_id = v_stock_rep
       AND product_variant_id = NEW.product_variant_id
       AND (
         (size_option_id IS NULL AND NEW.size_option_id IS NULL)
         OR size_option_id = NEW.size_option_id
       )
       AND status = 'active'
       AND expires_at > NOW()
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_reserved_to_consume >= v_quantity_needed;

    v_take := LEAST(v_reservation.quantity, v_quantity_needed - v_reserved_to_consume);

    IF v_take = v_reservation.quantity THEN
      UPDATE public.representative_stock_reservations
         SET status = 'consumed',
             updated_at = NOW()
       WHERE id = v_reservation.id;
    ELSE
      UPDATE public.representative_stock_reservations
         SET quantity = quantity - v_take,
             updated_at = NOW()
       WHERE id = v_reservation.id;
    END IF;

    v_reserved_to_consume := v_reserved_to_consume + v_take;
  END LOOP;

  v_available_to_consume := v_quantity_needed - v_reserved_to_consume;

  IF v_stock.quantity_reserved < v_reserved_to_consume THEN
    RAISE EXCEPTION 'Reserva inconsistente para pronta entrega.';
  END IF;

  IF v_stock.quantity_available < v_available_to_consume THEN
    RAISE EXCEPTION 'Estoque do representante insuficiente para pronta entrega. Disponivel: %, solicitado: %.',
      v_stock.quantity_available,
      v_available_to_consume;
  END IF;

  UPDATE public.representative_stock
     SET quantity_available = quantity_available - v_available_to_consume,
         quantity_reserved = quantity_reserved - v_reserved_to_consume,
         quantity_sold = quantity_sold + v_quantity_needed,
         updated_at = NOW()
   WHERE id = v_stock_id;

  PERFORM public.insert_representative_stock_movement(
    v_stock_rep,
    NEW.product_variant_id,
    NEW.size_option_id,
    'READY_DELIVERY_SALE',
    -v_quantity_needed,
    NEW.order_id,
    NEW.id,
    NULL,
    NULL,
    NULL,
    NULL,
    'ready-sale:' || NEW.order_id::TEXT || ':' || NEW.id::TEXT,
    'Baixa automatica de pronta entrega.',
    jsonb_build_object('reserved_consumed', v_reserved_to_consume, 'available_consumed', v_available_to_consume),
    v_order.created_by_profile_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consume_representative_stock_for_ready_delivery ON public.order_items;
CREATE TRIGGER trg_consume_representative_stock_for_ready_delivery
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.consume_representative_stock_for_ready_delivery();

CREATE OR REPLACE FUNCTION public.restore_representative_stock_on_ready_delivery_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_rep UUID;
  v_creator_role TEXT;
  v_item RECORD;
  v_stock_id UUID;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' OR NEW.order_type <> 'PRONTA_ENTREGA' THEN
    RETURN NEW;
  END IF;

  SELECT role
    INTO v_creator_role
    FROM public.profiles
   WHERE id = NEW.created_by_profile_id;

  v_stock_rep := CASE
    WHEN v_creator_role = 'representative' THEN NEW.created_by_profile_id
    ELSE (
      SELECT s.representative_id
        FROM public.stores s
       WHERE s.id = NEW.store_id
    )
  END;

  IF v_stock_rep IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_item IN
    SELECT *
      FROM public.order_items
     WHERE order_id = NEW.id
  LOOP
    IF EXISTS (
      SELECT 1
        FROM public.representative_stock_movements
       WHERE idempotency_key = 'ready-cancel:' || NEW.id::TEXT || ':' || v_item.id::TEXT
    ) THEN
      CONTINUE;
    END IF;

    v_stock_id := public.ensure_representative_stock_row(
      v_stock_rep,
      v_item.product_variant_id,
      v_item.size_option_id
    );

    PERFORM 1
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available + v_item.quantity,
           quantity_sold = GREATEST(0, quantity_sold - v_item.quantity),
           updated_at = NOW()
     WHERE id = v_stock_id;

    PERFORM public.insert_representative_stock_movement(
      v_stock_rep,
      v_item.product_variant_id,
      v_item.size_option_id,
      'SALE_CANCEL_REVERSAL',
      v_item.quantity,
      NEW.id,
      v_item.id,
      NULL,
      NULL,
      NULL,
      NULL,
      'ready-cancel:' || NEW.id::TEXT || ':' || v_item.id::TEXT,
      'Estorno automatico por cancelamento de pronta entrega.',
      jsonb_build_object('order_status', NEW.status),
      auth.uid()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_representative_stock_on_ready_delivery_cancel ON public.orders;
CREATE TRIGGER trg_restore_representative_stock_on_ready_delivery_cancel
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restore_representative_stock_on_ready_delivery_cancel();

CREATE OR REPLACE FUNCTION public.restore_representative_stock_on_ready_delivery_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_rep UUID;
  v_creator_role TEXT;
  v_item RECORD;
  v_stock_id UUID;
BEGIN
  IF OLD.order_type <> 'PRONTA_ENTREGA' OR OLD.status = 'cancelled' THEN
    RETURN OLD;
  END IF;

  SELECT role
    INTO v_creator_role
    FROM public.profiles
   WHERE id = OLD.created_by_profile_id;

  v_stock_rep := CASE
    WHEN v_creator_role = 'representative' THEN OLD.created_by_profile_id
    ELSE (
      SELECT s.representative_id
        FROM public.stores s
       WHERE s.id = OLD.store_id
    )
  END;

  IF v_stock_rep IS NULL THEN
    RETURN OLD;
  END IF;

  FOR v_item IN
    SELECT *
      FROM public.order_items
     WHERE order_id = OLD.id
  LOOP
    IF EXISTS (
      SELECT 1
        FROM public.representative_stock_movements
       WHERE idempotency_key IN (
         'ready-cancel:' || OLD.id::TEXT || ':' || v_item.id::TEXT,
         'ready-delete:' || OLD.id::TEXT || ':' || v_item.id::TEXT
       )
    ) THEN
      CONTINUE;
    END IF;

    v_stock_id := public.ensure_representative_stock_row(
      v_stock_rep,
      v_item.product_variant_id,
      v_item.size_option_id
    );

    PERFORM 1
      FROM public.representative_stock
     WHERE id = v_stock_id
     FOR UPDATE;

    UPDATE public.representative_stock
       SET quantity_available = quantity_available + v_item.quantity,
           quantity_sold = GREATEST(0, quantity_sold - v_item.quantity),
           updated_at = NOW()
     WHERE id = v_stock_id;

    PERFORM public.insert_representative_stock_movement(
      v_stock_rep,
      v_item.product_variant_id,
      v_item.size_option_id,
      'SALE_CANCEL_REVERSAL',
      v_item.quantity,
      OLD.id,
      v_item.id,
      NULL,
      NULL,
      NULL,
      NULL,
      'ready-delete:' || OLD.id::TEXT || ':' || v_item.id::TEXT,
      'Estorno automatico por exclusao de pronta entrega nao cancelada.',
      jsonb_build_object('order_status', OLD.status),
      auth.uid()
    );
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_representative_stock_on_ready_delivery_delete ON public.orders;
CREATE TRIGGER trg_restore_representative_stock_on_ready_delivery_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.restore_representative_stock_on_ready_delivery_delete();

CREATE OR REPLACE FUNCTION public.create_representative_receipt_for_ready_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_role TEXT;
  v_stock_rep UUID;
BEGIN
  IF NEW.order_type <> 'PRONTA_ENTREGA' THEN
    RETURN NEW;
  END IF;

  SELECT role
    INTO v_creator_role
    FROM public.profiles
   WHERE id = NEW.created_by_profile_id;

  v_stock_rep := CASE
    WHEN v_creator_role = 'representative' THEN NEW.created_by_profile_id
    ELSE (
      SELECT s.representative_id
        FROM public.stores s
       WHERE s.id = NEW.store_id
    )
  END;

  INSERT INTO public.representative_receipts (
    order_id,
    representative_id,
    status,
    issued_by,
    metadata
  )
  VALUES (
    NEW.id,
    v_stock_rep,
    'issued',
    NEW.created_by_profile_id,
    jsonb_build_object('order_number', NEW.order_number, 'source', 'ready_delivery_order_trigger')
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_representative_receipt_for_ready_delivery ON public.orders;
CREATE TRIGGER trg_create_representative_receipt_for_ready_delivery
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_representative_receipt_for_ready_delivery();

GRANT SELECT ON public.representative_stock TO authenticated, service_role;
GRANT SELECT ON public.representative_stock_transfers TO authenticated, service_role;
GRANT SELECT ON public.representative_stock_transfer_items TO authenticated, service_role;
GRANT SELECT ON public.representative_stock_reservations TO authenticated, service_role;
GRANT SELECT ON public.representative_stock_movements TO authenticated, service_role;
GRANT SELECT ON public.representative_day_closings TO authenticated, service_role;
GRANT SELECT ON public.representative_receipts TO authenticated, service_role;

GRANT ALL ON public.representative_stock TO service_role;
GRANT ALL ON public.representative_stock_transfers TO service_role;
GRANT ALL ON public.representative_stock_transfer_items TO service_role;
GRANT ALL ON public.representative_stock_reservations TO service_role;
GRANT ALL ON public.representative_stock_movements TO service_role;
GRANT ALL ON public.representative_day_closings TO service_role;
GRANT ALL ON public.representative_receipts TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.representative_stock_transfer_number_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.representative_receipt_number_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.representative_day_closing_number_seq TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_reserve_stock_atomic(TEXT, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.representative_reserve_stock_atomic(TEXT, JSONB, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_release_stock_reservation_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.representative_release_stock_reservation_atomic(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.expire_representative_stock_reservations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_representative_stock_reservations(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_transfer_representative_stock_atomic(UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_transfer_representative_stock_atomic(UUID, JSONB, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.representative_submit_day_closing_atomic(DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.representative_submit_day_closing_atomic(DATE, TEXT) TO authenticated, service_role;
