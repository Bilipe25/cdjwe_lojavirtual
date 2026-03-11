-- ============================================================
-- User Favorites Table
-- Syncs favorites to the database so they persist across devices
-- ============================================================

CREATE TABLE public.user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, product_id)
);

-- Index for fast lookups by user
CREATE INDEX idx_user_favorites_profile_id ON public.user_favorites(profile_id);

-- Enable RLS
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- Users can view their own favorites
CREATE POLICY "Users can view own favorites" ON public.user_favorites
  FOR SELECT USING (profile_id = auth.uid());

-- Users can add favorites
CREATE POLICY "Users can insert own favorites" ON public.user_favorites
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Users can remove their own favorites
CREATE POLICY "Users can delete own favorites" ON public.user_favorites
  FOR DELETE USING (profile_id = auth.uid());

-- Admins can view all favorites
CREATE POLICY "Admins can view all favorites" ON public.user_favorites
  FOR SELECT USING (public.is_admin());
