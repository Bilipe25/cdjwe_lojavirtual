-- ============================================================
-- CDJWE B2B System — Marketing & Communication Module
-- Supabase/PostgreSQL Migration
-- ============================================================

-- ==================== CAMPAIGNS ====================
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  message TEXT,
  image_url TEXT,
  channels TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  send_type TEXT NOT NULL DEFAULT 'immediate' CHECK (send_type IN ('immediate', 'scheduled')),
  scheduled_at TIMESTAMPTZ,
  display_from TIMESTAMPTZ,
  display_until TIMESTAMPTZ,
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'segment')),
  target_segment JSONB,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_scheduled_at ON public.campaigns(scheduled_at);
CREATE INDEX idx_campaigns_created_at ON public.campaigns(created_at);

-- ==================== CLIENT NOTIFICATIONS ====================
CREATE TABLE public.client_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('order_status', 'campaign', 'system', 'promo')),
  title TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_notifications_profile ON public.client_notifications(profile_id);
CREATE INDEX idx_client_notifications_read ON public.client_notifications(profile_id, is_read);
CREATE INDEX idx_client_notifications_type ON public.client_notifications(type);
CREATE INDEX idx_client_notifications_created ON public.client_notifications(created_at);

-- ==================== PROMOTIONAL POPUPS ====================
CREATE TABLE public.promotional_popups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  button_text TEXT,
  button_link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  display_from TIMESTAMPTZ,
  display_until TIMESTAMPTZ,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_popups_active ON public.promotional_popups(is_active);

-- ==================== PUSH SUBSCRIPTIONS ====================
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, endpoint)
);

CREATE INDEX idx_push_subs_profile ON public.push_subscriptions(profile_id);

-- ==================== CAMPAIGN SEND HISTORY ====================
CREATE TABLE public.campaign_send_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'notification', 'push', 'popup')),
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'opened')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_send_history_campaign ON public.campaign_send_history(campaign_id);
CREATE INDEX idx_send_history_channel ON public.campaign_send_history(channel);
CREATE INDEX idx_send_history_sent_at ON public.campaign_send_history(sent_at);

-- ==================== ROW LEVEL SECURITY ====================

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_send_history ENABLE ROW LEVEL SECURITY;

-- CAMPAIGNS policies (admin-only management, no client access)
CREATE POLICY "Admins can manage campaigns" ON public.campaigns FOR ALL USING (public.is_admin());

-- CLIENT NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications" ON public.client_notifications FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.client_notifications FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own notifications" ON public.client_notifications FOR DELETE USING (profile_id = auth.uid());
CREATE POLICY "Admins can manage all notifications" ON public.client_notifications FOR ALL USING (public.is_admin());

-- PROMOTIONAL POPUPS policies
CREATE POLICY "Approved users can view active popups" ON public.promotional_popups FOR SELECT USING (
  is_active = true AND (public.is_admin() OR public.is_approved_client())
);
CREATE POLICY "Admins can manage popups" ON public.promotional_popups FOR ALL USING (public.is_admin());

-- PUSH SUBSCRIPTIONS policies
CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions FOR ALL USING (profile_id = auth.uid());
CREATE POLICY "Admins can view all push subscriptions" ON public.push_subscriptions FOR SELECT USING (public.is_admin());

-- CAMPAIGN SEND HISTORY policies
CREATE POLICY "Admins can manage send history" ON public.campaign_send_history FOR ALL USING (public.is_admin());

-- ==================== UPDATED_AT TRIGGERS ====================
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_popups_updated_at BEFORE UPDATE ON public.promotional_popups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== STORAGE ====================
-- Run in Supabase Dashboard > Storage:
-- Create bucket "campaign-images" (public)
