-- ============================================================
-- Migration 010: Marketing P0 Hardening
-- - Align campaigns.target_audience with UI/API ('specific')
-- - Add campaign processing status for scheduled dispatch lock
-- - Add queue-focused index for scheduled dispatch processing
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'campaigns_target_audience_check'
          AND conrelid = 'public.campaigns'::regclass
    ) THEN
        ALTER TABLE public.campaigns
            DROP CONSTRAINT campaigns_target_audience_check;
    END IF;
END$$;

ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_target_audience_check
    CHECK (target_audience IN ('all', 'segment', 'specific'));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'campaigns_status_check'
          AND conrelid = 'public.campaigns'::regclass
    ) THEN
        ALTER TABLE public.campaigns
            DROP CONSTRAINT campaigns_status_check;
    END IF;
END$$;

ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('draft', 'scheduled', 'processing', 'sent', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_campaigns_dispatch_queue
    ON public.campaigns (status, scheduled_at)
    WHERE send_type = 'scheduled';
