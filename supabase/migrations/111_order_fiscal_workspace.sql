BEGIN;

CREATE TABLE IF NOT EXISTS public.natureza_operacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao TEXT NOT NULL,
    tipo_operacao TEXT NOT NULL DEFAULT 'outbound'
        CHECK (tipo_operacao IN ('outbound', 'inbound')),
    aplica_st BOOLEAN NOT NULL DEFAULT FALSE,
    aplica_difal BOOLEAN NOT NULL DEFAULT FALSE,
    aplica_devolucao BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natureza_operacao_descricao_unique
    ON public.natureza_operacao (lower(descricao));

CREATE TABLE IF NOT EXISTS public.natureza_operacao_cfops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    natureza_operacao_id UUID NOT NULL REFERENCES public.natureza_operacao(id) ON DELETE CASCADE,
    cfop_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT natureza_operacao_cfops_cfop_code_check CHECK (cfop_code ~ '^[1-7][0-9]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natureza_operacao_cfops_unique
    ON public.natureza_operacao_cfops (natureza_operacao_id, cfop_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_natureza_operacao_cfops_code_unique
    ON public.natureza_operacao_cfops (cfop_code);

CREATE TABLE IF NOT EXISTS public.order_fiscal_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    cfop_global_code TEXT NULL CHECK (cfop_global_code IS NULL OR cfop_global_code ~ '^[1-7][0-9]{3}$'),
    natureza_operacao_id UUID NULL REFERENCES public.natureza_operacao(id) ON DELETE SET NULL,
    natureza_operacao_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    operation_direction TEXT NOT NULL DEFAULT 'outbound'
        CHECK (operation_direction IN ('outbound', 'inbound')),
    finalidade_nfe TEXT NOT NULL DEFAULT 'normal'
        CHECK (finalidade_nfe IN ('normal', 'complementar', 'ajuste', 'devolucao')),
    presenca_comprador TEXT NOT NULL DEFAULT 'internet'
        CHECK (
            presenca_comprador IN (
                'nao_se_aplica',
                'presencial',
                'internet',
                'teleatendimento',
                'entrega_domicilio',
                'presencial_fora_estabelecimento',
                'outros'
            )
        ),
    consumidor_final BOOLEAN NOT NULL DEFAULT FALSE,
    freight_mode TEXT NOT NULL DEFAULT 'sem_frete'
        CHECK (
            freight_mode IN (
                'emitente',
                'destinatario',
                'terceiros',
                'proprio_remetente',
                'proprio_destinatario',
                'sem_frete'
            )
        ),
    delivery_form TEXT NOT NULL DEFAULT 'nao_informado'
        CHECK (
            delivery_form IN (
                'nao_informado',
                'retirada',
                'transportadora',
                'frota_propria',
                'correios',
                'entrega_expressa',
                'balcao'
            )
        ),
    transporter_name TEXT NULL,
    transporter_document TEXT NULL,
    vehicle_plate TEXT NULL,
    vehicle_uf TEXT NULL,
    antt_code TEXT NULL,
    freight_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    insurance_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_expenses_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    last_recalculated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT order_fiscal_settings_vehicle_uf_check CHECK (
        vehicle_uf IS NULL OR vehicle_uf ~ '^[A-Z]{2}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_order_fiscal_settings_order_id
    ON public.order_fiscal_settings (order_id);

CREATE TABLE IF NOT EXISTS public.order_fiscal_volumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_fiscal_settings_id UUID NOT NULL REFERENCES public.order_fiscal_settings(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    species TEXT NOT NULL,
    brand TEXT NULL,
    numbering TEXT NULL,
    gross_weight NUMERIC(14,3) NULL,
    net_weight NUMERIC(14,3) NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_order_fiscal_volumes_settings
    ON public.order_fiscal_volumes (order_fiscal_settings_id, sort_order, created_at);

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS cfop_override_code TEXT NULL CHECK (cfop_override_code IS NULL OR cfop_override_code ~ '^[1-7][0-9]{3}$'),
    ADD COLUMN IF NOT EXISTS effective_cfop_code TEXT NULL CHECK (effective_cfop_code IS NULL OR effective_cfop_code ~ '^[1-7][0-9]{3}$'),
    ADD COLUMN IF NOT EXISTS cfop_source TEXT NULL CHECK (
        cfop_source IS NULL OR cfop_source IN (
            'item_override',
            'order_global',
            'rule_override',
            'profile_default',
            'geographic_inference'
        )
    );

INSERT INTO public.natureza_operacao (
    descricao,
    tipo_operacao,
    aplica_st,
    aplica_difal,
    aplica_devolucao,
    sort_order
)
SELECT *
FROM (
    VALUES
        ('Venda de producao propria', 'outbound', FALSE, TRUE, FALSE, 10),
        ('Venda de mercadoria adquirida de terceiros', 'outbound', FALSE, TRUE, FALSE, 20),
        ('Venda sujeita a substituicao tributaria', 'outbound', TRUE, FALSE, FALSE, 30),
        ('Devolucao de mercadoria', 'inbound', FALSE, FALSE, TRUE, 40),
        ('Transferencia de mercadoria', 'outbound', FALSE, FALSE, FALSE, 50),
        ('Remessa para demonstracao', 'outbound', FALSE, FALSE, FALSE, 60)
) AS seed(descricao, tipo_operacao, aplica_st, aplica_difal, aplica_devolucao, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.natureza_operacao existing
    WHERE lower(existing.descricao) = lower(seed.descricao)
);

WITH naturezas AS (
    SELECT id, lower(descricao) AS descricao
    FROM public.natureza_operacao
)
INSERT INTO public.natureza_operacao_cfops (natureza_operacao_id, cfop_code)
SELECT n.id, cfop_code
FROM (
    VALUES
        ('venda de producao propria', '5101'),
        ('venda de producao propria', '6101'),
        ('venda de mercadoria adquirida de terceiros', '5102'),
        ('venda de mercadoria adquirida de terceiros', '6102'),
        ('venda sujeita a substituicao tributaria', '5405'),
        ('venda sujeita a substituicao tributaria', '6404'),
        ('devolucao de mercadoria', '1202'),
        ('devolucao de mercadoria', '2202'),
        ('transferencia de mercadoria', '5152'),
        ('transferencia de mercadoria', '6152'),
        ('remessa para demonstracao', '5912'),
        ('remessa para demonstracao', '6912')
) AS seed(descricao, cfop_code)
JOIN naturezas n
    ON n.descricao = seed.descricao
WHERE NOT EXISTS (
    SELECT 1
    FROM public.natureza_operacao_cfops existing
    WHERE existing.natureza_operacao_id = n.id
      AND existing.cfop_code = seed.cfop_code
);

COMMIT;
