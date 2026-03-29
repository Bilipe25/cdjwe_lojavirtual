-- ============================================================
-- Migration 050: Financial P2 Collection Engine (Dunning + SLA)
-- Goals:
-- - Collection engine for pre-due, due-today and overdue escalation
-- - Strict de-duplication by installment + stage
-- - SLA tracking for first overdue contact
-- - Audit trail for collection operations
-- - Daily pg_cron schedule (after overdue sync)
-- ============================================================

-- ==================== COLLECTION SETTINGS ====================

CREATE TABLE IF NOT EXISTS public.store_collection_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pre_due_days INTEGER[] NOT NULL DEFAULT ARRAY[7,3,1],
  overdue_escalation_days INTEGER[] NOT NULL DEFAULT ARRAY[1,3,7,15,30],
  critical_overdue_days INTEGER NOT NULL DEFAULT 30 CHECK (critical_overdue_days >= 1),
  sla_first_overdue_contact_hours INTEGER NOT NULL DEFAULT 24 CHECK (sla_first_overdue_contact_hours >= 1),
  max_notifications_per_run INTEGER NOT NULL DEFAULT 500 CHECK (max_notifications_per_run BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_collection_settings_store_id
  ON public.store_collection_settings(store_id);

DROP TRIGGER IF EXISTS trg_update_store_collection_settings_updated_at
  ON public.store_collection_settings;

CREATE TRIGGER trg_update_store_collection_settings_updated_at
  BEFORE UPDATE ON public.store_collection_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.normalize_collection_settings_arrays()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_min_overdue_day INTEGER;
BEGIN
  SELECT COALESCE(array_agg(x ORDER BY x DESC), ARRAY[7,3,1]::INTEGER[])
    INTO NEW.pre_due_days
  FROM (
    SELECT DISTINCT v AS x
      FROM unnest(COALESCE(NEW.pre_due_days, ARRAY[7,3,1]::INTEGER[])) AS v
     WHERE v > 0
  ) s;

  SELECT COALESCE(array_agg(x ORDER BY x ASC), ARRAY[1,3,7,15,30]::INTEGER[])
    INTO NEW.overdue_escalation_days
  FROM (
    SELECT DISTINCT v AS x
      FROM unnest(COALESCE(NEW.overdue_escalation_days, ARRAY[1,3,7,15,30]::INTEGER[])) AS v
     WHERE v > 0
  ) s;

  SELECT MIN(v)
    INTO v_min_overdue_day
  FROM unnest(NEW.overdue_escalation_days) AS v;

  IF NEW.critical_overdue_days IS NULL OR NEW.critical_overdue_days < COALESCE(v_min_overdue_day, 1) THEN
    NEW.critical_overdue_days := COALESCE(v_min_overdue_day, 1);
  END IF;

  IF NEW.sla_first_overdue_contact_hours IS NULL OR NEW.sla_first_overdue_contact_hours < 1 THEN
    NEW.sla_first_overdue_contact_hours := 24;
  END IF;

  IF NEW.max_notifications_per_run IS NULL OR NEW.max_notifications_per_run < 1 THEN
    NEW.max_notifications_per_run := 500;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_collection_settings_arrays
  ON public.store_collection_settings;

CREATE TRIGGER trg_normalize_collection_settings_arrays
  BEFORE INSERT OR UPDATE OF pre_due_days, overdue_escalation_days, critical_overdue_days, sla_first_overdue_contact_hours, max_notifications_per_run
  ON public.store_collection_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_collection_settings_arrays();

INSERT INTO public.store_collection_settings (store_id)
SELECT s.id
  FROM public.stores s
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.store_collection_settings scs
    WHERE scs.store_id = s.id
 );

-- ==================== COLLECTION AUDIT TABLES ====================

CREATE TABLE IF NOT EXISTS public.collection_engine_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  run_status TEXT NOT NULL DEFAULT 'running' CHECK (run_status IN ('running', 'completed', 'failed')),
  processed_installments INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  escalations_sent INTEGER NOT NULL DEFAULT 0,
  sla_breaches INTEGER NOT NULL DEFAULT 0,
  sla_resolved INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_engine_runs_reference_date
  ON public.collection_engine_runs(reference_date DESC);

CREATE INDEX IF NOT EXISTS idx_collection_engine_runs_status
  ON public.collection_engine_runs(run_status, started_at DESC);

CREATE TABLE IF NOT EXISTS public.collection_notification_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installment_id UUID NOT NULL REFERENCES public.invoice_installments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notification_id UUID REFERENCES public.client_notifications(id) ON DELETE SET NULL,
  notification_kind TEXT NOT NULL,
  stage_day INTEGER NOT NULL,
  reference_date DATE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  dispatch_status TEXT NOT NULL DEFAULT 'sent' CHECK (dispatch_status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(installment_id, notification_kind, stage_day)
);

CREATE INDEX IF NOT EXISTS idx_collection_dispatches_invoice_id
  ON public.collection_notification_dispatches(invoice_id);

CREATE INDEX IF NOT EXISTS idx_collection_dispatches_store_created
  ON public.collection_notification_dispatches(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_dispatches_profile_created
  ON public.collection_notification_dispatches(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_dispatches_reference_date
  ON public.collection_notification_dispatches(reference_date, notification_kind);

CREATE TABLE IF NOT EXISTS public.collection_sla_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installment_id UUID NOT NULL UNIQUE REFERENCES public.invoice_installments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sla_type TEXT NOT NULL DEFAULT 'first_overdue_contact' CHECK (sla_type IN ('first_overdue_contact')),
  expected_until TIMESTAMPTZ NOT NULL,
  breached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_contact_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_delay_minutes INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_sla_violations_store
  ON public.collection_sla_violations(store_id, breached_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_sla_violations_resolution
  ON public.collection_sla_violations(resolved_at, breached_at DESC);

CREATE TABLE IF NOT EXISTS public.collection_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.invoice_installments(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('pre_due_notice', 'due_today_notice', 'overdue_notice', 'overdue_escalation', 'sla_breach', 'sla_resolved')),
  notification_kind TEXT,
  stage_day INTEGER,
  notification_id UUID REFERENCES public.client_notifications(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_events_invoice_created
  ON public.collection_events(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_events_profile_created
  ON public.collection_events(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_events_store_created
  ON public.collection_events(store_id, created_at DESC);

-- ==================== COLLECTION ENGINE ====================

CREATE OR REPLACE FUNCTION public.run_collection_engine(
  p_reference_date DATE DEFAULT CURRENT_DATE,
  p_store_id UUID DEFAULT NULL,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  processed_installments INTEGER,
  sent_notifications INTEGER,
  escalated_notifications INTEGER,
  sla_breaches INTEGER,
  sla_resolved INTEGER,
  run_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_now TIMESTAMPTZ := NOW();
  v_run_id UUID;
  v_candidate RECORD;
  v_store_key TEXT;
  v_store_sent INTEGER;
  v_store_counters JSONB := '{}'::JSONB;
  v_processed_installments INTEGER := 0;
  v_sent_notifications INTEGER := 0;
  v_escalated_notifications INTEGER := 0;
  v_sla_breaches INTEGER := 0;
  v_sla_resolved INTEGER := 0;
  v_stage_threshold INTEGER;
  v_stage_day INTEGER;
  v_days_to_due INTEGER;
  v_days_overdue INTEGER;
  v_notification_kind TEXT;
  v_priority TEXT;
  v_event_type TEXT;
  v_title TEXT;
  v_message TEXT;
  v_dispatch_id UUID;
  v_notification_id UUID;
  v_first_overdue_contact_at TIMESTAMPTZ;
  v_expected_until TIMESTAMPTZ;
  v_resolution_delay_minutes INTEGER;
BEGIN
  IF p_reference_date IS NULL THEN
    p_reference_date := CURRENT_DATE;
  END IF;

  v_auth_user := auth.uid();

  IF v_auth_user IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;

  INSERT INTO public.collection_engine_runs (
    reference_date,
    run_status,
    metadata,
    triggered_by
  )
  VALUES (
    p_reference_date,
    'running',
    jsonb_build_object(
      'store_id', p_store_id,
      'force', p_force,
      'source', 'run_collection_engine'
    ),
    v_auth_user
  )
  RETURNING id INTO v_run_id;

  FOR v_candidate IN
    SELECT
      ii.id AS installment_id,
      ii.invoice_id,
      ii.installment_number,
      ii.due_date,
      ii.amount,
      ii.paid_amount,
      GREATEST(ii.amount - ii.paid_amount, 0)::NUMERIC(12,2) AS remaining_amount,
      inv.invoice_number,
      inv.store_id,
      inv.profile_id,
      inv.order_id,
      inv.installment_count,
      COALESCE(o.order_number, '-') AS order_number,
      COALESCE(s.company_name, p.full_name, 'Cliente') AS customer_name,
      COALESCE(scs.is_enabled, TRUE) AS collection_enabled,
      COALESCE(scs.pre_due_days, ARRAY[7,3,1]::INTEGER[]) AS pre_due_days,
      COALESCE(scs.overdue_escalation_days, ARRAY[1,3,7,15,30]::INTEGER[]) AS overdue_escalation_days,
      COALESCE(scs.critical_overdue_days, 30) AS critical_overdue_days,
      COALESCE(scs.sla_first_overdue_contact_hours, 24) AS sla_first_overdue_contact_hours,
      COALESCE(scs.max_notifications_per_run, 500) AS max_notifications_per_run
    FROM public.invoice_installments ii
    JOIN public.invoices inv
      ON inv.id = ii.invoice_id
    JOIN public.profiles p
      ON p.id = inv.profile_id
    LEFT JOIN public.orders o
      ON o.id = inv.order_id
    LEFT JOIN public.stores s
      ON s.id = inv.store_id
    LEFT JOIN public.store_collection_settings scs
      ON scs.store_id = inv.store_id
    WHERE (p_store_id IS NULL OR inv.store_id = p_store_id)
      AND inv.status NOT IN ('cancelled', 'renegotiated', 'paid')
      AND ii.status IN ('open', 'overdue')
      AND ii.amount > ii.paid_amount
    ORDER BY ii.due_date ASC, inv.created_at ASC, ii.installment_number ASC
  LOOP
    IF NOT v_candidate.collection_enabled THEN
      CONTINUE;
    END IF;

    v_processed_installments := v_processed_installments + 1;

    v_store_key := COALESCE(v_candidate.store_id::TEXT, 'unknown-store');
    v_store_sent := COALESCE((v_store_counters ->> v_store_key)::INTEGER, 0);

    IF v_store_sent >= v_candidate.max_notifications_per_run THEN
      CONTINUE;
    END IF;

    v_stage_threshold := NULL;
    v_stage_day := NULL;
    v_days_to_due := NULL;
    v_days_overdue := NULL;
    v_notification_kind := NULL;
    v_priority := 'normal';
    v_event_type := NULL;
    v_title := NULL;
    v_message := NULL;
    v_dispatch_id := NULL;
    v_notification_id := NULL;

    IF v_candidate.due_date > p_reference_date THEN
      v_days_to_due := (v_candidate.due_date - p_reference_date);

      SELECT MIN(x)
        INTO v_stage_threshold
      FROM unnest(v_candidate.pre_due_days) AS x
      WHERE x > 0
        AND x >= v_days_to_due
        AND (
          p_force
          OR NOT EXISTS (
            SELECT 1
              FROM public.collection_notification_dispatches d
             WHERE d.installment_id = v_candidate.installment_id
               AND d.notification_kind = 'invoice_due_soon'
               AND d.stage_day = -x
          )
        );

      IF v_stage_threshold IS NOT NULL THEN
        v_stage_day := -v_stage_threshold;
        v_notification_kind := 'invoice_due_soon';
        v_priority := 'normal';
        v_event_type := 'pre_due_notice';
        v_title := FORMAT('Fatura %s vence em %s dia(s)', v_candidate.invoice_number, v_days_to_due);
        v_message := FORMAT(
          'Parcela %s/%s no valor de R$ %s vence em %s. Pedido %s.',
          v_candidate.installment_number,
          v_candidate.installment_count,
          TO_CHAR(v_candidate.remaining_amount, 'FM999G999G999D00'),
          TO_CHAR(v_candidate.due_date, 'DD/MM/YYYY'),
          v_candidate.order_number
        );
      END IF;

    ELSIF v_candidate.due_date = p_reference_date THEN
      IF p_force
         OR NOT EXISTS (
           SELECT 1
             FROM public.collection_notification_dispatches d
            WHERE d.installment_id = v_candidate.installment_id
              AND d.notification_kind = 'invoice_due_today'
              AND d.stage_day = 0
         )
      THEN
        v_stage_day := 0;
        v_notification_kind := 'invoice_due_today';
        v_priority := 'normal';
        v_event_type := 'due_today_notice';
        v_title := FORMAT('Fatura %s vence hoje', v_candidate.invoice_number);
        v_message := FORMAT(
          'Parcela %s/%s no valor de R$ %s vence hoje (%s).',
          v_candidate.installment_number,
          v_candidate.installment_count,
          TO_CHAR(v_candidate.remaining_amount, 'FM999G999G999D00'),
          TO_CHAR(v_candidate.due_date, 'DD/MM/YYYY')
        );
      END IF;

    ELSE
      v_days_overdue := (p_reference_date - v_candidate.due_date);

      SELECT MAX(x)
        INTO v_stage_threshold
      FROM unnest(v_candidate.overdue_escalation_days) AS x
      WHERE x > 0
        AND x <= v_days_overdue
        AND (
          p_force
          OR NOT EXISTS (
            SELECT 1
              FROM public.collection_notification_dispatches d
             WHERE d.installment_id = v_candidate.installment_id
               AND d.stage_day = x
               AND d.notification_kind IN ('invoice_overdue', 'payment_overdue', 'critical_overdue')
          )
        );

      IF v_stage_threshold IS NOT NULL THEN
        v_stage_day := v_stage_threshold;

        IF v_stage_threshold >= v_candidate.critical_overdue_days THEN
          v_notification_kind := 'critical_overdue';
          v_priority := 'critical';
          v_event_type := 'overdue_escalation';
        ELSIF v_stage_threshold >= 7 THEN
          v_notification_kind := 'payment_overdue';
          v_priority := 'high';
          v_event_type := 'overdue_escalation';
        ELSE
          v_notification_kind := 'invoice_overdue';
          v_priority := 'high';
          v_event_type := 'overdue_notice';
        END IF;

        v_title := FORMAT('Fatura %s em atraso (%s dia(s))', v_candidate.invoice_number, v_days_overdue);
        v_message := FORMAT(
          'Parcela %s/%s no valor de R$ %s esta vencida ha %s dia(s). Regularize para evitar bloqueio financeiro.',
          v_candidate.installment_number,
          v_candidate.installment_count,
          TO_CHAR(v_candidate.remaining_amount, 'FM999G999G999D00'),
          v_days_overdue
        );
      END IF;
    END IF;

    IF v_stage_day IS NOT NULL AND v_notification_kind IS NOT NULL THEN
      BEGIN
        INSERT INTO public.collection_notification_dispatches (
          installment_id,
          invoice_id,
          order_id,
          store_id,
          profile_id,
          notification_kind,
          stage_day,
          reference_date,
          priority,
          dispatch_status,
          metadata
        )
        VALUES (
          v_candidate.installment_id,
          v_candidate.invoice_id,
          v_candidate.order_id,
          v_candidate.store_id,
          v_candidate.profile_id,
          v_notification_kind,
          v_stage_day,
          p_reference_date,
          v_priority,
          'sent',
          jsonb_build_object(
            'engine_run_id', v_run_id,
            'source', 'collection_engine_v1',
            'stage_day', v_stage_day,
            'days_to_due', v_days_to_due,
            'days_overdue', v_days_overdue,
            'remaining_amount', v_candidate.remaining_amount
          )
        )
        ON CONFLICT (installment_id, notification_kind, stage_day) DO NOTHING
        RETURNING id INTO v_dispatch_id;

        IF v_dispatch_id IS NOT NULL THEN
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
            v_candidate.profile_id,
            'financial',
            v_notification_kind,
            v_priority,
            v_title,
            v_message,
            '/invoices',
            v_candidate.order_id,
            jsonb_build_object(
              'source', 'collection_engine_v1',
              'engine_run_id', v_run_id,
              'invoice_id', v_candidate.invoice_id,
              'invoice_number', v_candidate.invoice_number,
              'installment_id', v_candidate.installment_id,
              'installment_number', v_candidate.installment_number,
              'installment_count', v_candidate.installment_count,
              'due_date', v_candidate.due_date,
              'remaining_amount', v_candidate.remaining_amount,
              'stage_day', v_stage_day,
              'notification_kind', v_notification_kind
            )
          )
          RETURNING id INTO v_notification_id;

          UPDATE public.collection_notification_dispatches
             SET notification_id = v_notification_id,
                 dispatch_status = 'sent'
           WHERE id = v_dispatch_id;

          INSERT INTO public.collection_events (
            invoice_id,
            installment_id,
            order_id,
            store_id,
            profile_id,
            event_type,
            notification_kind,
            stage_day,
            notification_id,
            description,
            metadata
          )
          VALUES (
            v_candidate.invoice_id,
            v_candidate.installment_id,
            v_candidate.order_id,
            v_candidate.store_id,
            v_candidate.profile_id,
            v_event_type,
            v_notification_kind,
            v_stage_day,
            v_notification_id,
            v_title,
            jsonb_build_object(
              'engine_run_id', v_run_id,
              'reference_date', p_reference_date,
              'customer_name', v_candidate.customer_name,
              'order_number', v_candidate.order_number,
              'remaining_amount', v_candidate.remaining_amount
            )
          );

          v_sent_notifications := v_sent_notifications + 1;

          IF v_stage_day > 0 THEN
            v_escalated_notifications := v_escalated_notifications + 1;
          END IF;

          v_store_counters := jsonb_set(
            v_store_counters,
            ARRAY[v_store_key],
            to_jsonb(v_store_sent + 1),
            true
          );
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          IF v_dispatch_id IS NOT NULL THEN
            UPDATE public.collection_notification_dispatches
               SET dispatch_status = 'failed',
                   error_message = LEFT(SQLERRM, 500)
             WHERE id = v_dispatch_id;
          END IF;
      END;
    END IF;

    IF v_candidate.due_date < p_reference_date THEN
      v_expected_until := (v_candidate.due_date::TIMESTAMPTZ + INTERVAL '1 day')
                          + make_interval(hours => v_candidate.sla_first_overdue_contact_hours);

      SELECT MIN(d.created_at)
        INTO v_first_overdue_contact_at
      FROM public.collection_notification_dispatches d
      WHERE d.installment_id = v_candidate.installment_id
        AND d.dispatch_status = 'sent'
        AND d.notification_kind IN ('invoice_overdue', 'payment_overdue', 'critical_overdue');

      IF v_first_overdue_contact_at IS NULL AND v_now > v_expected_until THEN
        INSERT INTO public.collection_sla_violations (
          installment_id,
          invoice_id,
          order_id,
          store_id,
          profile_id,
          sla_type,
          expected_until,
          breached_at,
          metadata
        )
        VALUES (
          v_candidate.installment_id,
          v_candidate.invoice_id,
          v_candidate.order_id,
          v_candidate.store_id,
          v_candidate.profile_id,
          'first_overdue_contact',
          v_expected_until,
          v_now,
          jsonb_build_object(
            'engine_run_id', v_run_id,
            'reference_date', p_reference_date,
            'days_overdue', (p_reference_date - v_candidate.due_date)
          )
        )
        ON CONFLICT (installment_id) DO NOTHING;

        IF FOUND THEN
          v_sla_breaches := v_sla_breaches + 1;

          INSERT INTO public.collection_events (
            invoice_id,
            installment_id,
            order_id,
            store_id,
            profile_id,
            event_type,
            notification_kind,
            stage_day,
            notification_id,
            description,
            metadata
          )
          VALUES (
            v_candidate.invoice_id,
            v_candidate.installment_id,
            v_candidate.order_id,
            v_candidate.store_id,
            v_candidate.profile_id,
            'sla_breach',
            'sla_breach',
            (p_reference_date - v_candidate.due_date),
            NULL,
            FORMAT(
              'SLA de primeiro contato violado para fatura %s (parcela %s).',
              v_candidate.invoice_number,
              v_candidate.installment_number
            ),
            jsonb_build_object(
              'engine_run_id', v_run_id,
              'expected_until', v_expected_until,
              'first_contact_at', v_first_overdue_contact_at
            )
          );
        END IF;
      ELSIF v_first_overdue_contact_at IS NOT NULL THEN
        UPDATE public.collection_sla_violations v
           SET first_contact_at = COALESCE(v.first_contact_at, v_first_overdue_contact_at),
               resolved_at = COALESCE(v.resolved_at, v_now),
               resolution_delay_minutes = GREATEST(
                 ROUND(EXTRACT(EPOCH FROM (COALESCE(v_first_overdue_contact_at, v_now) - v.expected_until)) / 60.0)::INTEGER,
                 0
               ),
               metadata = v.metadata || jsonb_build_object(
                 'resolved_by_engine_run', v_run_id,
                 'resolved_reference_date', p_reference_date
               )
         WHERE v.installment_id = v_candidate.installment_id
           AND v.resolved_at IS NULL
         RETURNING v.resolution_delay_minutes
          INTO v_resolution_delay_minutes;

        IF FOUND THEN
          v_sla_resolved := v_sla_resolved + 1;

          INSERT INTO public.collection_events (
            invoice_id,
            installment_id,
            order_id,
            store_id,
            profile_id,
            event_type,
            notification_kind,
            stage_day,
            notification_id,
            description,
            metadata
          )
          VALUES (
            v_candidate.invoice_id,
            v_candidate.installment_id,
            v_candidate.order_id,
            v_candidate.store_id,
            v_candidate.profile_id,
            'sla_resolved',
            'sla_breach',
            (p_reference_date - v_candidate.due_date),
            NULL,
            FORMAT(
              'SLA de primeiro contato resolvido para fatura %s (parcela %s).',
              v_candidate.invoice_number,
              v_candidate.installment_number
            ),
            jsonb_build_object(
              'engine_run_id', v_run_id,
              'first_contact_at', v_first_overdue_contact_at,
              'resolution_delay_minutes', v_resolution_delay_minutes
            )
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.collection_engine_runs
     SET finished_at = NOW(),
         run_status = 'completed',
         processed_installments = v_processed_installments,
         notifications_sent = v_sent_notifications,
         escalations_sent = v_escalated_notifications,
         sla_breaches = v_sla_breaches,
         sla_resolved = v_sla_resolved,
         metadata = metadata || jsonb_build_object(
           'store_notification_counters', v_store_counters
         )
   WHERE id = v_run_id;

  RETURN QUERY
  SELECT
    v_processed_installments,
    v_sent_notifications,
    v_escalated_notifications,
    v_sla_breaches,
    v_sla_resolved,
    v_run_id;

EXCEPTION
  WHEN OTHERS THEN
    IF v_run_id IS NOT NULL THEN
      UPDATE public.collection_engine_runs
         SET finished_at = NOW(),
             run_status = 'failed',
             processed_installments = v_processed_installments,
             notifications_sent = v_sent_notifications,
             escalations_sent = v_escalated_notifications,
             sla_breaches = v_sla_breaches,
             sla_resolved = v_sla_resolved,
             error_message = LEFT(SQLERRM, 500)
       WHERE id = v_run_id;
    END IF;

    RAISE;
END;
$$;

-- First run materialization
SELECT * FROM public.run_collection_engine(CURRENT_DATE, NULL, FALSE);

-- ==================== SCHEDULE ====================

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
         WHERE jobname = 'financial-collection-engine-daily'
      $sql$;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
      EXECUTE $sql$
        SELECT cron.schedule(
          'financial-collection-engine-daily',
          '25 1 * * *',
          $cron$SELECT * FROM public.run_collection_engine(CURRENT_DATE, NULL, FALSE);$cron$
        )
      $sql$;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
END $$;

-- ==================== RLS ====================

ALTER TABLE public.store_collection_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_engine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_sla_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'store_collection_settings'
       AND policyname = 'Admins can manage store collection settings'
  ) THEN
    CREATE POLICY "Admins can manage store collection settings"
      ON public.store_collection_settings FOR ALL
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
       AND tablename = 'collection_engine_runs'
       AND policyname = 'Admins can manage collection engine runs'
  ) THEN
    CREATE POLICY "Admins can manage collection engine runs"
      ON public.collection_engine_runs FOR ALL
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
       AND tablename = 'collection_notification_dispatches'
       AND policyname = 'Users can view own collection dispatches'
  ) THEN
    CREATE POLICY "Users can view own collection dispatches"
      ON public.collection_notification_dispatches FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'collection_notification_dispatches'
       AND policyname = 'Admins can manage collection dispatches'
  ) THEN
    CREATE POLICY "Admins can manage collection dispatches"
      ON public.collection_notification_dispatches FOR ALL
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
       AND tablename = 'collection_sla_violations'
       AND policyname = 'Users can view own collection sla violations'
  ) THEN
    CREATE POLICY "Users can view own collection sla violations"
      ON public.collection_sla_violations FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'collection_sla_violations'
       AND policyname = 'Admins can manage collection sla violations'
  ) THEN
    CREATE POLICY "Admins can manage collection sla violations"
      ON public.collection_sla_violations FOR ALL
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
       AND tablename = 'collection_events'
       AND policyname = 'Users can view own collection events'
  ) THEN
    CREATE POLICY "Users can view own collection events"
      ON public.collection_events FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'collection_events'
       AND policyname = 'Admins can manage collection events'
  ) THEN
    CREATE POLICY "Admins can manage collection events"
      ON public.collection_events FOR ALL
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ==================== PERMISSIONS ====================

REVOKE ALL ON FUNCTION public.run_collection_engine(DATE, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_collection_engine(DATE, UUID, BOOLEAN) TO authenticated, service_role;
