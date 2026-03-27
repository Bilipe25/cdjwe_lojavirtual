-- Tabela singleton para configurações globais de custo de logística
CREATE TABLE IF NOT EXISTS public.logistics_cost_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuel_price_per_liter NUMERIC(10, 2) NOT NULL DEFAULT 5.50,
    fuel_tax_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    additional_tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 150.00,
    notes TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.logistics_cost_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (apenas admins do Tenant logistica_admin podem ver e editar)
CREATE POLICY "Acesso leitura settings custos para membros da empresa"
  ON public.logistics_cost_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_employees ce
      WHERE ce.user_id = auth.uid() AND ce.status = 'active'
    )
  );

CREATE POLICY "Acesso total settings custos para admins"
  ON public.logistics_cost_settings ALL
  USING (
    EXISTS (
      SELECT 1 FROM company_employees ce
      JOIN company_roles cr ON cr.id = ce.role_id
      WHERE ce.user_id = auth.uid() AND ce.status = 'active'
        AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%Logística%')
    )
  );

-- Adicionar colunas de combustível em vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fuel_consumption_km_l NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'diesel';

-- Inserir registro singleton padrão se não existir nenhum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.logistics_cost_settings) THEN
        INSERT INTO public.logistics_cost_settings(fuel_price_per_liter, fuel_tax_pct, daily_rate)
        VALUES (5.50, 0, 150.00);
    END IF;
END $$;