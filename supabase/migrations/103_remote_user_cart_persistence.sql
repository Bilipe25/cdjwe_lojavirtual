-- ============================================================
-- Remote User Cart Persistence
-- Persists customer cart drafts across devices and sessions.
-- ============================================================

CREATE TABLE public.user_cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cart_key TEXT NOT NULL,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size_option_id UUID NULL REFERENCES public.product_size_options(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  fabric_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  size_name TEXT NULL,
  size_price NUMERIC NULL,
  image_url TEXT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  item_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, cart_key)
);

CREATE INDEX idx_user_cart_items_profile_id ON public.user_cart_items(profile_id);
CREATE INDEX idx_user_cart_items_profile_updated_at ON public.user_cart_items(profile_id, item_updated_at DESC);

ALTER TABLE public.user_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cart items" ON public.user_cart_items
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own cart items" ON public.user_cart_items
  FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own cart items" ON public.user_cart_items
  FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own cart items" ON public.user_cart_items
  FOR DELETE USING (profile_id = auth.uid());

CREATE POLICY "Admins can view all cart items" ON public.user_cart_items
  FOR SELECT USING (public.is_admin());
