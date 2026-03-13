-- Migration 006: Store Addresses Evolution

-- 1. Create store_addresses table
CREATE TABLE IF NOT EXISTS public.store_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL, -- e.g., "Sede", "Filial Centro", "Entrega Padrão"
    is_main BOOLEAN NOT NULL DEFAULT false, -- Só um pode ser verdadeiro por loja
    zip_code VARCHAR(20) NOT NULL,
    address VARCHAR(255) NOT NULL,
    number VARCHAR(50),
    complement VARCHAR(150),
    neighborhood VARCHAR(150),
    city VARCHAR(150) NOT NULL,
    state VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Index for quick store_id lookups
CREATE INDEX IF NOT EXISTS idx_store_addresses_store_id ON public.store_addresses(store_id);

-- 3. Trigger to ensure only one is_main = true per store_id
CREATE OR REPLACE FUNCTION ensure_single_main_address()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o novo endereço está sendo definido como principal
    IF NEW.is_main = true THEN
        -- Desmarque todos os outros endereços desta loja como não-principais
        UPDATE public.store_addresses
        SET is_main = false,
            updated_at = timezone('utc'::text, now())
        WHERE store_id = NEW.store_id
          AND id != NEW.id
          AND is_main = true;
    END IF;
    
    -- Se está inserindo e é o primeiro endereço da loja, force como principal
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM public.store_addresses WHERE store_id = NEW.store_id) THEN
            NEW.is_main := true;
        END IF;
    END IF;

    -- Update updated_at
    NEW.updated_at := timezone('utc'::text, now());
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_single_main_address ON public.store_addresses;
CREATE TRIGGER trg_ensure_single_main_address
    BEFORE INSERT OR UPDATE ON public.store_addresses
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_main_address();

-- 4. Initial Data Migration
-- Copiar os dados existentes da tabela stores para a nova tabela
INSERT INTO public.store_addresses (
    store_id, title, is_main, zip_code, address, city, state
)
SELECT 
    id as store_id, 
    'Endereço Principal' as title, 
    true as is_main, 
    zip_code, 
    address, 
    city, 
    state
FROM public.stores
WHERE address IS NOT NULL AND address != ''
ON CONFLICT DO NOTHING; -- No conflict mechanism defined, but just in case of future reruns.

-- 5. RLS Policies
ALTER TABLE public.store_addresses ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "store_addresses_admin_all" ON public.store_addresses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can read their own store's addresses
CREATE POLICY "store_addresses_client_select" ON public.store_addresses
    FOR SELECT USING (
        store_id IN (
            SELECT id FROM public.stores WHERE profile_id = auth.uid()
        )
    );

-- Users can insert into their own store
CREATE POLICY "store_addresses_client_insert" ON public.store_addresses
    FOR INSERT WITH CHECK (
        store_id IN (
            SELECT id FROM public.stores WHERE profile_id = auth.uid()
        )
    );

-- Users can update their own store's addresses
CREATE POLICY "store_addresses_client_update" ON public.store_addresses
    FOR UPDATE USING (
        store_id IN (
            SELECT id FROM public.stores WHERE profile_id = auth.uid()
        )
    );

-- Users can delete their own store's addresses
CREATE POLICY "store_addresses_client_delete" ON public.store_addresses
    FOR DELETE USING (
        store_id IN (
            SELECT id FROM public.stores WHERE profile_id = auth.uid()
        )
    );
