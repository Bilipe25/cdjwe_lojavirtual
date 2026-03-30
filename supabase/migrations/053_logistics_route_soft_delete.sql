-- ============================================================
-- Migration 053: Logistics route soft delete
-- - Allows removing routes from operational views without
--   deleting relational/audit history
-- ============================================================

ALTER TABLE public.delivery_routes
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_routes_active_planned_date
  ON public.delivery_routes(planned_date DESC, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_delivery_routes_active_status_planned
  ON public.delivery_routes(status, planned_date DESC)
  WHERE is_deleted = FALSE;
