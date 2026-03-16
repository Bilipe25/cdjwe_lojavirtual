-- ============================================================
-- Migration 020: Admin Products Observability / Audit Trail
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_product_audit_log (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id uuid NOT NULL,
    actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    action text NOT NULL,
    stage text NOT NULL DEFAULT 'application',
    success boolean NOT NULL DEFAULT true,
    message text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_product_audit_operation_created
    ON public.admin_product_audit_log(operation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_product_audit_product_created
    ON public.admin_product_audit_log(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_product_audit_actor_created
    ON public.admin_product_audit_log(actor_profile_id, created_at DESC);

ALTER TABLE public.admin_product_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read product audit log" ON public.admin_product_audit_log;
CREATE POLICY "Admins can read product audit log"
    ON public.admin_product_audit_log
    FOR SELECT
    USING (public.is_admin());
