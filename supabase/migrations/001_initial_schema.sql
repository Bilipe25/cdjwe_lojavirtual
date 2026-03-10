-- ============================================================
-- CDJWE B2B System — Initial Database Schema
-- Supabase/PostgreSQL Migration
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== PROFILES (extends auth.users) ====================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    CASE 
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'client') = 'admin' THEN 'approved'
      ELSE 'pending'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== STORES (Clientes/Empresas) ====================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT NOT NULL,
  state_registration TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  region TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== SYSTEM SETTINGS ====================
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_name TEXT NOT NULL DEFAULT 'CDJWE Estofados',
  logo_url TEXT,
  cnpj TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  phone_secondary TEXT,
  email TEXT,
  min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_delivery_days INTEGER NOT NULL DEFAULT 30,
  show_prices_to_unapproved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.system_settings (system_name, min_order_amount, default_delivery_days)
VALUES ('CDJWE Estofados', 500.00, 30);

-- ==================== CATEGORIES ====================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== PRODUCTS ====================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  size TEXT,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== PRODUCT IMAGES ====================
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== FABRICS (Tecidos) ====================
CREATE TABLE public.fabrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_modifier NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== FABRIC COLORS (Cores por Tecido) ====================
CREATE TABLE public.fabric_colors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fabric_id UUID NOT NULL REFERENCES public.fabrics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hex_code TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== PRODUCT VARIANTS (Grade: Produto x Tecido x Cor) ====================
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  fabric_id UUID NOT NULL REFERENCES public.fabrics(id) ON DELETE RESTRICT,
  fabric_color_id UUID NOT NULL REFERENCES public.fabric_colors(id) ON DELETE RESTRICT,
  sku TEXT,
  price_override NUMERIC(10,2),
  image_url TEXT,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, fabric_id, fabric_color_id)
);

-- ==================== PRICE TABLES ====================
CREATE TABLE public.price_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default price table
INSERT INTO public.price_tables (name, description, is_default, discount_percentage)
VALUES ('Tabela Padrão', 'Tabela de preços padrão para novos clientes', true, 0);

-- ==================== PRICE TABLE ITEMS ====================
CREATE TABLE public.price_table_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  custom_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(price_table_id, product_variant_id)
);

-- ==================== STORE PRICE TABLES ====================
CREATE TABLE public.store_price_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, price_table_id)
);

-- ==================== PAYMENT CONDITIONS ====================
CREATE TABLE public.payment_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  installments INTEGER NOT NULL DEFAULT 1,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default payment conditions
INSERT INTO public.payment_conditions (name, description, installments, discount_percentage, sort_order) VALUES
  ('À Vista', 'Pagamento à vista com 5% de desconto', 1, 5.00, 1),
  ('30 dias', 'Pagamento em 30 dias', 1, 0, 2),
  ('30/60 dias', 'Pagamento em 2x (30/60 dias)', 2, 0, 3),
  ('30/60/90 dias', 'Pagamento em 3x (30/60/90 dias)', 3, 0, 4);

-- ==================== DISCOUNT COUPONS ====================
CREATE TABLE public.discount_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_order_amount NUMERIC(10,2),
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== ORDERS ====================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'in_production', 'shipped', 'delivered', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'overdue', 'cancelled')),
  payment_condition_id UUID REFERENCES public.payment_conditions(id),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  shipping_address TEXT,
  estimated_delivery DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.orders;
  
  NEW.order_number := 'PED' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION generate_order_number();

-- ==================== ORDER ITEMS ====================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  fabric_name TEXT NOT NULL,
  color_name TEXT NOT NULL,
  size TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== ORDER STATUS HISTORY ====================
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== INDEXES ====================
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_stores_profile_id ON public.stores(profile_id);
CREATE INDEX idx_stores_cnpj ON public.stores(cnpj);
CREATE INDEX idx_products_category_id ON public.products(category_id);
CREATE INDEX idx_products_slug ON public.products(slug);
CREATE INDEX idx_products_is_active ON public.products(is_active);
CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX idx_product_variants_fabric_id ON public.product_variants(fabric_id);
CREATE INDEX idx_fabric_colors_fabric_id ON public.fabric_colors(fabric_id);
CREATE INDEX idx_orders_store_id ON public.orders(store_id);
CREATE INDEX idx_orders_profile_id ON public.orders(profile_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);

-- ==================== ROW LEVEL SECURITY ====================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabric_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_table_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: check if user is approved client
CREATE OR REPLACE FUNCTION public.is_approved_client()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'client' AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());

-- STORES policies
CREATE POLICY "Users can view own store" ON public.stores FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own store" ON public.stores FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own store" ON public.stores FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Admins can view all stores" ON public.stores FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all stores" ON public.stores FOR UPDATE USING (public.is_admin());

-- SYSTEM SETTINGS policies
CREATE POLICY "Anyone authenticated can view settings" ON public.system_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update settings" ON public.system_settings FOR UPDATE USING (public.is_admin());
CREATE POLICY "Admins can insert settings" ON public.system_settings FOR INSERT WITH CHECK (public.is_admin());

-- CATEGORIES policies
CREATE POLICY "Approved users can view active categories" ON public.categories FOR SELECT USING (is_active = true AND (public.is_admin() OR public.is_approved_client()));
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.is_admin());

-- PRODUCTS policies
CREATE POLICY "Approved users can view active products" ON public.products FOR SELECT USING (is_active = true AND (public.is_admin() OR public.is_approved_client()));
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.is_admin());

-- PRODUCT IMAGES policies
CREATE POLICY "Approved users can view product images" ON public.product_images FOR SELECT USING (public.is_admin() OR public.is_approved_client());
CREATE POLICY "Admins can manage product images" ON public.product_images FOR ALL USING (public.is_admin());

-- FABRICS policies
CREATE POLICY "Approved users can view active fabrics" ON public.fabrics FOR SELECT USING (is_active = true AND (public.is_admin() OR public.is_approved_client()));
CREATE POLICY "Admins can manage fabrics" ON public.fabrics FOR ALL USING (public.is_admin());

-- FABRIC COLORS policies
CREATE POLICY "Approved users can view active colors" ON public.fabric_colors FOR SELECT USING (is_active = true AND (public.is_admin() OR public.is_approved_client()));
CREATE POLICY "Admins can manage fabric colors" ON public.fabric_colors FOR ALL USING (public.is_admin());

-- PRODUCT VARIANTS policies
CREATE POLICY "Approved users can view active variants" ON public.product_variants FOR SELECT USING (is_active = true AND (public.is_admin() OR public.is_approved_client()));
CREATE POLICY "Admins can manage variants" ON public.product_variants FOR ALL USING (public.is_admin());

-- PRICE TABLES policies
CREATE POLICY "Admins can manage price tables" ON public.price_tables FOR ALL USING (public.is_admin());
CREATE POLICY "Users can view assigned price tables" ON public.price_tables FOR SELECT USING (
  public.is_admin() OR
  id IN (
    SELECT pt.price_table_id FROM public.store_price_tables pt
    JOIN public.stores s ON s.id = pt.store_id
    WHERE s.profile_id = auth.uid()
  )
);

-- PRICE TABLE ITEMS policies
CREATE POLICY "Admins can manage price table items" ON public.price_table_items FOR ALL USING (public.is_admin());

-- STORE PRICE TABLES policies
CREATE POLICY "Admins can manage store price tables" ON public.store_price_tables FOR ALL USING (public.is_admin());
CREATE POLICY "Users can view own store price tables" ON public.store_price_tables FOR SELECT USING (
  store_id IN (SELECT id FROM public.stores WHERE profile_id = auth.uid())
);

-- PAYMENT CONDITIONS policies
CREATE POLICY "Anyone authenticated can view active conditions" ON public.payment_conditions FOR SELECT USING (is_active = true AND auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage payment conditions" ON public.payment_conditions FOR ALL USING (public.is_admin());

-- DISCOUNT COUPONS policies
CREATE POLICY "Admins can manage coupons" ON public.discount_coupons FOR ALL USING (public.is_admin());
CREATE POLICY "Approved clients can view active coupons" ON public.discount_coupons FOR SELECT USING (is_active = true AND public.is_approved_client());

-- ORDERS policies
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING (public.is_admin());

-- ORDER ITEMS policies
CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT USING (
  order_id IN (SELECT id FROM public.orders WHERE profile_id = auth.uid())
);
CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM public.orders WHERE profile_id = auth.uid())
);
CREATE POLICY "Admins can view all order items" ON public.order_items FOR SELECT USING (public.is_admin());

-- ORDER STATUS HISTORY policies
CREATE POLICY "Users can view own order history" ON public.order_status_history FOR SELECT USING (
  order_id IN (SELECT id FROM public.orders WHERE profile_id = auth.uid())
);
CREATE POLICY "Admins can manage order history" ON public.order_status_history FOR ALL USING (public.is_admin());

-- ==================== UPDATED_AT TRIGGER ====================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==================== STORAGE BUCKETS ====================
-- Run these in the Supabase Dashboard > Storage section:
-- 1. Create bucket "product-images" (public)
-- 2. Create bucket "logos" (public)
-- 3. Create bucket "fabric-swatches" (public)
