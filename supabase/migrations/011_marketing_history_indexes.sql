-- ============================================================
-- Migration 011: Marketing History Indexes
-- - Speed up history filtering by channel/status/period
-- - Speed up campaign retry lookups for failed recipients
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_send_history_channel_status_sent_at
    ON public.campaign_send_history (channel, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_send_history_status_sent_at
    ON public.campaign_send_history (status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_send_history_campaign_status_recipient
    ON public.campaign_send_history (campaign_id, status, recipient_id);
