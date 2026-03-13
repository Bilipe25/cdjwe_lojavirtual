-- Migration 005: B2B Advanced Features - Tags & Representatives

-- 1. Create customer_tags table
CREATE TABLE IF NOT EXISTS public.customer_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800 border-gray-200',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Popular tags iniciais comuns no B2B
INSERT INTO public.customer_tags (name, color) VALUES
    ('VIP', 'bg-purple-100 text-purple-800 border-purple-200'),
    ('Atacado', 'bg-blue-100 text-blue-800 border-blue-200'),
    ('Grande Comprador', 'bg-green-100 text-green-800 border-green-200'),
    ('Inativo', 'bg-red-100 text-red-800 border-red-200'),
    ('Novo Cliente', 'bg-teal-100 text-teal-800 border-teal-200');

-- 2. Add representative_id to stores table
ALTER TABLE public.stores 
ADD COLUMN representative_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Create store_tags relation table (N:M)
CREATE TABLE IF NOT EXISTS public.store_tags (
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.customer_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (store_id, tag_id)
);

-- RLS Policies

-- customer_tags: Anyone authenticated can read (useful for forms)
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_tags_select_all" ON public.customer_tags
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "customer_tags_admin_write" ON public.customer_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- store_tags: Admins manage, owners/reps can select
ALTER TABLE public.store_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_tags_select_all" ON public.store_tags
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "store_tags_admin_write" ON public.store_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Add Index for representative
CREATE INDEX IF NOT EXISTS idx_stores_representative_id ON public.stores(representative_id);
