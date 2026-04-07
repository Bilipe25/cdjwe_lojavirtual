-- ============================================================
-- Migration 066: Enterprise Fiscal Reference Bases
-- ============================================================

-- 1) Reference base settings
CREATE TABLE IF NOT EXISTS public.fiscal_reference_type_settings (
    table_type TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    recommended_refresh_days INTEGER NOT NULL DEFAULT 180,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_type_settings_table_type_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_type_settings
            ADD CONSTRAINT fiscal_reference_type_settings_table_type_check
            CHECK (table_type IN ('ncm', 'tipi', 'cest', 'cfop'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_type_settings_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_type_settings
            ADD CONSTRAINT fiscal_reference_type_settings_payload_check
            CHECK (jsonb_typeof(metadata_jsonb) = 'object');
    END IF;
END $$;

-- 2) Import batches + preview items
CREATE TABLE IF NOT EXISTS public.fiscal_import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    source_file_name TEXT,
    source_type TEXT NOT NULL DEFAULT 'csv',
    imported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    invalid_rows INTEGER NOT NULL DEFAULT 0,
    error_summary_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_import_batches_table_type
    ON public.fiscal_import_batches(table_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_import_batches_status
    ON public.fiscal_import_batches(status, started_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batches_table_type_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batches
            ADD CONSTRAINT fiscal_import_batches_table_type_check
            CHECK (table_type IN ('ncm', 'tipi', 'cest', 'cfop'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batches_status_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batches
            ADD CONSTRAINT fiscal_import_batches_status_check
            CHECK (status IN ('draft', 'imported', 'failed', 'cancelled'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batches_source_type_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batches
            ADD CONSTRAINT fiscal_import_batches_source_type_check
            CHECK (source_type IN ('csv', 'manual', 'api'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batches_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batches
            ADD CONSTRAINT fiscal_import_batches_payload_check
            CHECK (jsonb_typeof(error_summary_jsonb) = 'object');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_import_batches_updated_at ON public.fiscal_import_batches;
CREATE TRIGGER update_fiscal_import_batches_updated_at
    BEFORE UPDATE ON public.fiscal_import_batches
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_import_batch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES public.fiscal_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'valid',
    raw_payload_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    normalized_payload_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    validation_errors_jsonb JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_import_batch_items_batch
    ON public.fiscal_import_batch_items(batch_id, row_number ASC);
CREATE INDEX IF NOT EXISTS idx_fiscal_import_batch_items_status
    ON public.fiscal_import_batch_items(batch_id, validation_status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batch_items_status_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batch_items
            ADD CONSTRAINT fiscal_import_batch_items_status_check
            CHECK (validation_status IN ('valid', 'invalid'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_import_batch_items_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_import_batch_items
            ADD CONSTRAINT fiscal_import_batch_items_payload_check
            CHECK (
                jsonb_typeof(raw_payload_jsonb) = 'object'
                AND jsonb_typeof(normalized_payload_jsonb) = 'object'
                AND jsonb_typeof(validation_errors_jsonb) = 'array'
            );
    END IF;
END $$;

-- 3) Versioned fiscal references
CREATE TABLE IF NOT EXISTS public.fiscal_reference_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_type TEXT NOT NULL,
    version_label TEXT NOT NULL,
    import_batch_id UUID UNIQUE REFERENCES public.fiscal_import_batches(id) ON DELETE SET NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    imported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    source_file_name TEXT,
    source_type TEXT NOT NULL DEFAULT 'csv',
    row_count INTEGER NOT NULL DEFAULT 0,
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_reference_versions_table_type
    ON public.fiscal_reference_versions(table_type, imported_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_reference_versions_active
    ON public.fiscal_reference_versions(table_type)
    WHERE is_active = true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_versions_table_type_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_versions
            ADD CONSTRAINT fiscal_reference_versions_table_type_check
            CHECK (table_type IN ('ncm', 'tipi', 'cest', 'cfop'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_versions_source_type_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_versions
            ADD CONSTRAINT fiscal_reference_versions_source_type_check
            CHECK (source_type IN ('csv', 'manual', 'api'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_versions_validity_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_versions
            ADD CONSTRAINT fiscal_reference_versions_validity_check
            CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_reference_versions_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_reference_versions
            ADD CONSTRAINT fiscal_reference_versions_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_reference_versions_updated_at ON public.fiscal_reference_versions;
CREATE TRIGGER update_fiscal_reference_versions_updated_at
    BEFORE UPDATE ON public.fiscal_reference_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Reference entry tables
CREATE TABLE IF NOT EXISTS public.fiscal_ncm_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES public.fiscal_reference_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    full_description TEXT,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_entries_version_code
    ON public.fiscal_ncm_entries(version_id, code);
CREATE INDEX IF NOT EXISTS idx_fiscal_ncm_entries_code
    ON public.fiscal_ncm_entries(code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_ncm_entries_code_check'
    ) THEN
        ALTER TABLE public.fiscal_ncm_entries
            ADD CONSTRAINT fiscal_ncm_entries_code_check
            CHECK (code ~ '^\d{8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_ncm_entries_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_ncm_entries
            ADD CONSTRAINT fiscal_ncm_entries_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fiscal_tipi_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES public.fiscal_reference_versions(id) ON DELETE CASCADE,
    ncm_code TEXT NOT NULL,
    ex_tipi TEXT,
    description TEXT NOT NULL,
    ipi_rate NUMERIC(7,4) NOT NULL DEFAULT 0,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, ncm_code, ex_tipi)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_tipi_entries_version_ncm
    ON public.fiscal_tipi_entries(version_id, ncm_code);
CREATE INDEX IF NOT EXISTS idx_fiscal_tipi_entries_ncm
    ON public.fiscal_tipi_entries(ncm_code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_tipi_entries_ncm_check'
    ) THEN
        ALTER TABLE public.fiscal_tipi_entries
            ADD CONSTRAINT fiscal_tipi_entries_ncm_check
            CHECK (ncm_code ~ '^\d{8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_tipi_entries_rate_check'
    ) THEN
        ALTER TABLE public.fiscal_tipi_entries
            ADD CONSTRAINT fiscal_tipi_entries_rate_check
            CHECK (ipi_rate >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_tipi_entries_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_tipi_entries
            ADD CONSTRAINT fiscal_tipi_entries_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fiscal_cest_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES public.fiscal_reference_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    segment TEXT,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_cest_entries_version_code
    ON public.fiscal_cest_entries(version_id, code);
CREATE INDEX IF NOT EXISTS idx_fiscal_cest_entries_code
    ON public.fiscal_cest_entries(code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cest_entries_code_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_entries
            ADD CONSTRAINT fiscal_cest_entries_code_check
            CHECK (code ~ '^\d{7}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cest_entries_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_entries
            ADD CONSTRAINT fiscal_cest_entries_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fiscal_cest_ncm_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cest_entry_id UUID NOT NULL REFERENCES public.fiscal_cest_entries(id) ON DELETE CASCADE,
    ncm_code TEXT NOT NULL,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cest_entry_id, ncm_code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_cest_ncm_links_ncm
    ON public.fiscal_cest_ncm_links(ncm_code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cest_ncm_links_ncm_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            ADD CONSTRAINT fiscal_cest_ncm_links_ncm_check
            CHECK (ncm_code ~ '^\d{8}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cest_ncm_links_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cest_ncm_links
            ADD CONSTRAINT fiscal_cest_ncm_links_payload_check
            CHECK (jsonb_typeof(metadata_jsonb) = 'object');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES public.fiscal_reference_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    operation_direction TEXT NOT NULL DEFAULT 'both',
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_cfop_entries_version_code
    ON public.fiscal_cfop_entries(version_id, code);
CREATE INDEX IF NOT EXISTS idx_fiscal_cfop_entries_code
    ON public.fiscal_cfop_entries(code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_entries_code_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_entries
            ADD CONSTRAINT fiscal_cfop_entries_code_check
            CHECK (code ~ '^\d{4}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_entries_direction_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_entries
            ADD CONSTRAINT fiscal_cfop_entries_direction_check
            CHECK (operation_direction IN ('outbound', 'inbound', 'both'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_entries_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_entries
            ADD CONSTRAINT fiscal_cfop_entries_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

-- 5) Controlled catalogs
CREATE TABLE IF NOT EXISTS public.fiscal_catalog_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_type TEXT NOT NULL,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (catalog_type, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_catalog_items_type_sort
    ON public.fiscal_catalog_items(catalog_type, sort_order ASC, label ASC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_catalog_items_type_check'
    ) THEN
        ALTER TABLE public.fiscal_catalog_items
            ADD CONSTRAINT fiscal_catalog_items_type_check
            CHECK (
                catalog_type IN (
                    'origin', 'commercial_unit', 'tax_unit', 'pis_cst', 'cofins_cst',
                    'ipi_cst', 'taxpayer_indicator', 'person_type', 'item_type', 'fiscal_type'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_catalog_items_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_catalog_items
            ADD CONSTRAINT fiscal_catalog_items_payload_check
            CHECK (jsonb_typeof(metadata_jsonb) = 'object');
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_catalog_items_updated_at ON public.fiscal_catalog_items;
CREATE TRIGGER update_fiscal_catalog_items_updated_at
    BEFORE UPDATE ON public.fiscal_catalog_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fiscal_catalog_items (catalog_type, code, label, description, sort_order, is_active)
VALUES
    ('origin', '0', '0 - Nacional', 'Mercadoria nacional, exceto as indicadas nos codigos 3, 4, 5 e 8', 1, true),
    ('origin', '1', '1 - Estrangeira - Importacao direta', 'Mercadoria estrangeira importada diretamente', 2, true),
    ('origin', '2', '2 - Estrangeira - Mercado interno', 'Mercadoria estrangeira adquirida no mercado interno', 3, true),
    ('origin', '3', '3 - Nacional - Conteudo > 40%', 'Mercadoria nacional com conteudo de importacao superior a 40%', 4, true),
    ('origin', '4', '4 - Nacional - Producao conforme PPB', 'Producao conforme processos produtivos basicos', 5, true),
    ('origin', '5', '5 - Nacional - Conteudo <= 40%', 'Mercadoria nacional com conteudo de importacao de ate 40%', 6, true),
    ('origin', '6', '6 - Estrangeira - Sem similar nacional', 'Importada sem similar nacional', 7, true),
    ('origin', '7', '7 - Estrangeira - Mercado interno sem similar', 'Adquirida no mercado interno sem similar nacional', 8, true),
    ('origin', '8', '8 - Nacional - Conteudo > 70%', 'Mercadoria nacional com conteudo de importacao superior a 70%', 9, true),

    ('commercial_unit', 'UN', 'UN', 'Unidade', 10, true),
    ('commercial_unit', 'PC', 'PC', 'Peca', 20, true),
    ('commercial_unit', 'CJ', 'CJ', 'Conjunto', 30, true),
    ('commercial_unit', 'CX', 'CX', 'Caixa', 40, true),
    ('commercial_unit', 'KG', 'KG', 'Quilograma', 50, true),
    ('commercial_unit', 'M', 'M', 'Metro', 60, true),
    ('commercial_unit', 'M2', 'M2', 'Metro quadrado', 70, true),
    ('commercial_unit', 'M3', 'M3', 'Metro cubico', 80, true),
    ('commercial_unit', 'PAR', 'PAR', 'Par', 90, true),

    ('tax_unit', 'UN', 'UN', 'Unidade', 10, true),
    ('tax_unit', 'PC', 'PC', 'Peca', 20, true),
    ('tax_unit', 'CJ', 'CJ', 'Conjunto', 30, true),
    ('tax_unit', 'CX', 'CX', 'Caixa', 40, true),
    ('tax_unit', 'KG', 'KG', 'Quilograma', 50, true),
    ('tax_unit', 'M', 'M', 'Metro', 60, true),
    ('tax_unit', 'M2', 'M2', 'Metro quadrado', 70, true),
    ('tax_unit', 'M3', 'M3', 'Metro cubico', 80, true),
    ('tax_unit', 'PAR', 'PAR', 'Par', 90, true),

    ('ipi_cst', '00', '00', 'Entrada com recuperacao de credito', 10, true),
    ('ipi_cst', '01', '01', 'Entrada tributada com aliquota zero', 20, true),
    ('ipi_cst', '02', '02', 'Entrada isenta', 30, true),
    ('ipi_cst', '03', '03', 'Entrada nao-tributada', 40, true),
    ('ipi_cst', '04', '04', 'Entrada imune', 50, true),
    ('ipi_cst', '05', '05', 'Entrada com suspensao', 60, true),
    ('ipi_cst', '49', '49', 'Outras entradas', 70, true),
    ('ipi_cst', '50', '50', 'Saida tributada', 80, true),
    ('ipi_cst', '51', '51', 'Saida tributada com aliquota zero', 90, true),
    ('ipi_cst', '52', '52', 'Saida isenta', 100, true),
    ('ipi_cst', '53', '53', 'Saida nao-tributada', 110, true),
    ('ipi_cst', '54', '54', 'Saida imune', 120, true),
    ('ipi_cst', '55', '55', 'Saida com suspensao', 130, true),
    ('ipi_cst', '99', '99', 'Outras saidas', 140, true),

    ('pis_cst', '01', '01', 'Operacao tributavel com aliquota basica', 10, true),
    ('pis_cst', '02', '02', 'Operacao tributavel com aliquota diferenciada', 20, true),
    ('pis_cst', '03', '03', 'Operacao tributavel por unidade', 30, true),
    ('pis_cst', '04', '04', 'Operacao tributavel monofasica - revenda a aliquota zero', 40, true),
    ('pis_cst', '05', '05', 'Operacao tributavel por substituicao tributaria', 50, true),
    ('pis_cst', '06', '06', 'Operacao tributavel a aliquota zero', 60, true),
    ('pis_cst', '07', '07', 'Operacao isenta', 70, true),
    ('pis_cst', '08', '08', 'Operacao sem incidencia', 80, true),
    ('pis_cst', '09', '09', 'Operacao com suspensao', 90, true),
    ('pis_cst', '49', '49', 'Outras operacoes de saida', 100, true),

    ('cofins_cst', '01', '01', 'Operacao tributavel com aliquota basica', 10, true),
    ('cofins_cst', '02', '02', 'Operacao tributavel com aliquota diferenciada', 20, true),
    ('cofins_cst', '03', '03', 'Operacao tributavel por unidade', 30, true),
    ('cofins_cst', '04', '04', 'Operacao tributavel monofasica - revenda a aliquota zero', 40, true),
    ('cofins_cst', '05', '05', 'Operacao tributavel por substituicao tributaria', 50, true),
    ('cofins_cst', '06', '06', 'Operacao tributavel a aliquota zero', 60, true),
    ('cofins_cst', '07', '07', 'Operacao isenta', 70, true),
    ('cofins_cst', '08', '08', 'Operacao sem incidencia', 80, true),
    ('cofins_cst', '09', '09', 'Operacao com suspensao', 90, true),
    ('cofins_cst', '49', '49', 'Outras operacoes de saida', 100, true),

    ('taxpayer_indicator', 'contributor', 'Contribuinte', 'Cliente contribuinte', 10, true),
    ('taxpayer_indicator', 'non_contributor', 'Nao contribuinte', 'Cliente nao contribuinte', 20, true),
    ('taxpayer_indicator', 'exempt', 'Isento', 'Cliente contribuinte isento', 30, true),

    ('person_type', 'individual', 'Pessoa Fisica', 'Cliente pessoa fisica', 10, true),
    ('person_type', 'legal_entity', 'Pessoa Juridica', 'Cliente pessoa juridica', 20, true),

    ('item_type', 'goods', 'Mercadoria', 'Item classificado como mercadoria', 10, true),
    ('item_type', 'service', 'Servico', 'Item classificado como servico', 20, true),
    ('item_type', 'other', 'Outro', 'Outras classificacoes', 30, true),

    ('fiscal_type', 'goods', 'Mercadoria', 'Natureza tributaria de mercadoria', 10, true),
    ('fiscal_type', 'service', 'Servico', 'Natureza tributaria de servico', 20, true),
    ('fiscal_type', 'other', 'Outro', 'Demais naturezas', 30, true)
ON CONFLICT (catalog_type, code) DO UPDATE
   SET label = EXCLUDED.label,
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       updated_at = NOW();

-- 6) Product tax profiles now reference fiscal bases
ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS ncm_reference_id UUID REFERENCES public.fiscal_ncm_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ncm_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tipi_reference_id UUID REFERENCES public.fiscal_tipi_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tipi_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cest_reference_id UUID REFERENCES public.fiscal_cest_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cest_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_output_cfop_reference_id UUID REFERENCES public.fiscal_cfop_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_output_cfop_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_input_cfop_reference_id UUID REFERENCES public.fiscal_cfop_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_input_cfop_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fiscal_reference_snapshot_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_tax_profiles_reference_snapshot_check'
    ) THEN
        ALTER TABLE public.product_tax_profiles
            ADD CONSTRAINT product_tax_profiles_reference_snapshot_check
            CHECK (jsonb_typeof(fiscal_reference_snapshot_jsonb) = 'object');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_ncm_reference_id
    ON public.product_tax_profiles(ncm_reference_id);
CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_cest_reference_id
    ON public.product_tax_profiles(cest_reference_id);
CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_default_output_cfop_reference_id
    ON public.product_tax_profiles(default_output_cfop_reference_id);

-- 7) Atomic activation helper
CREATE OR REPLACE FUNCTION public.admin_activate_fiscal_reference_version(
    p_version_id UUID
)
RETURNS TABLE (
    version_id UUID,
    table_type TEXT,
    is_active BOOLEAN,
    deactivated_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_target RECORD;
    v_deactivated_count INTEGER := 0;
BEGIN
    SELECT *
      INTO v_target
      FROM public.fiscal_reference_versions
     WHERE id = p_version_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal reference version % not found', p_version_id;
    END IF;

    UPDATE public.fiscal_reference_versions
       SET is_active = false,
           valid_to = COALESCE(valid_to, CURRENT_DATE),
           updated_at = NOW()
     WHERE table_type = v_target.table_type
       AND is_active = true
       AND id <> p_version_id;

    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    UPDATE public.fiscal_reference_versions
       SET is_active = true,
           valid_from = COALESCE(valid_from, CURRENT_DATE),
           valid_to = NULL,
           activated_at = NOW(),
           activated_by = v_actor,
           updated_at = NOW()
     WHERE id = p_version_id;

    RETURN QUERY
    SELECT
        v_target.id,
        v_target.table_type,
        true,
        v_deactivated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_activate_fiscal_reference_version(UUID)
TO authenticated, service_role;

-- 8) Replace product tax profile upsert RPC with fiscal references support
DROP FUNCTION IF EXISTS public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB
);

CREATE OR REPLACE FUNCTION public.admin_upsert_product_tax_profile(
    p_tax_profile_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_ncm TEXT DEFAULT NULL,
    p_cest TEXT DEFAULT NULL,
    p_origin_code TEXT DEFAULT '0',
    p_commercial_unit TEXT DEFAULT NULL,
    p_tax_unit TEXT DEFAULT NULL,
    p_ean_gtin TEXT DEFAULT NULL,
    p_tax_ean_gtin TEXT DEFAULT NULL,
    p_default_fiscal_description TEXT DEFAULT NULL,
    p_fiscal_type TEXT DEFAULT 'goods',
    p_item_type TEXT DEFAULT 'goods',
    p_has_substitution_tax BOOLEAN DEFAULT false,
    p_requires_cest BOOLEAN DEFAULT false,
    p_has_ipi BOOLEAN DEFAULT false,
    p_ipi_cst_out TEXT DEFAULT NULL,
    p_ipi_enquadramento_codigo TEXT DEFAULT NULL,
    p_pis_cst TEXT DEFAULT NULL,
    p_cofins_cst TEXT DEFAULT NULL,
    p_pis_aliquota NUMERIC DEFAULT NULL,
    p_cofins_aliquota NUMERIC DEFAULT NULL,
    p_default_output_cfop TEXT DEFAULT NULL,
    p_default_input_cfop TEXT DEFAULT NULL,
    p_internal_fiscal_code TEXT DEFAULT NULL,
    p_default_fiscal_notes TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT true,
    p_requires_tax_configuration BOOLEAN DEFAULT true,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_ncm_reference_id UUID DEFAULT NULL,
    p_ncm_version_id UUID DEFAULT NULL,
    p_tipi_reference_id UUID DEFAULT NULL,
    p_tipi_version_id UUID DEFAULT NULL,
    p_cest_reference_id UUID DEFAULT NULL,
    p_cest_version_id UUID DEFAULT NULL,
    p_default_output_cfop_reference_id UUID DEFAULT NULL,
    p_default_output_cfop_version_id UUID DEFAULT NULL,
    p_default_input_cfop_reference_id UUID DEFAULT NULL,
    p_default_input_cfop_version_id UUID DEFAULT NULL,
    p_fiscal_reference_snapshot_jsonb JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    tax_profile_id UUID,
    created BOOLEAN,
    version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_profile_id UUID;
    v_version INTEGER;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_tax_profile_id IS NULL THEN
        INSERT INTO public.product_tax_profiles (
            name, code, description, ncm, cest, origin_code,
            commercial_unit, tax_unit, ean_gtin, tax_ean_gtin,
            default_fiscal_description, fiscal_type, item_type,
            has_substitution_tax, requires_cest, has_ipi,
            ipi_cst_out, ipi_enquadramento_codigo, pis_cst, cofins_cst,
            pis_aliquota, cofins_aliquota, default_output_cfop, default_input_cfop,
            internal_fiscal_code, default_fiscal_notes, is_active,
            requires_tax_configuration, future_tax_payload, metadata_jsonb,
            ncm_reference_id, ncm_version_id, tipi_reference_id, tipi_version_id,
            cest_reference_id, cest_version_id,
            default_output_cfop_reference_id, default_output_cfop_version_id,
            default_input_cfop_reference_id, default_input_cfop_version_id,
            fiscal_reference_snapshot_jsonb,
            created_by, updated_by
        )
        VALUES (
            p_name, p_code, p_description, p_ncm, p_cest, COALESCE(p_origin_code, '0'),
            p_commercial_unit, p_tax_unit, p_ean_gtin, p_tax_ean_gtin,
            p_default_fiscal_description, COALESCE(p_fiscal_type, 'goods'), COALESCE(p_item_type, 'goods'),
            COALESCE(p_has_substitution_tax, false), COALESCE(p_requires_cest, false), COALESCE(p_has_ipi, false),
            p_ipi_cst_out, p_ipi_enquadramento_codigo, p_pis_cst, p_cofins_cst,
            p_pis_aliquota, p_cofins_aliquota, p_default_output_cfop, p_default_input_cfop,
            p_internal_fiscal_code, p_default_fiscal_notes, COALESCE(p_is_active, true),
            COALESCE(p_requires_tax_configuration, true),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            p_ncm_reference_id, p_ncm_version_id, p_tipi_reference_id, p_tipi_version_id,
            p_cest_reference_id, p_cest_version_id,
            p_default_output_cfop_reference_id, p_default_output_cfop_version_id,
            p_default_input_cfop_reference_id, p_default_input_cfop_version_id,
            COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
            v_actor, v_actor
        )
        RETURNING id, version INTO v_profile_id, v_version;

        v_created := true;
    ELSE
        UPDATE public.product_tax_profiles tp
           SET name = p_name,
               code = p_code,
               description = p_description,
               ncm = p_ncm,
               cest = p_cest,
               origin_code = COALESCE(p_origin_code, '0'),
               commercial_unit = p_commercial_unit,
               tax_unit = p_tax_unit,
               ean_gtin = p_ean_gtin,
               tax_ean_gtin = p_tax_ean_gtin,
               default_fiscal_description = p_default_fiscal_description,
               fiscal_type = COALESCE(p_fiscal_type, 'goods'),
               item_type = COALESCE(p_item_type, 'goods'),
               has_substitution_tax = COALESCE(p_has_substitution_tax, false),
               requires_cest = COALESCE(p_requires_cest, false),
               has_ipi = COALESCE(p_has_ipi, false),
               ipi_cst_out = p_ipi_cst_out,
               ipi_enquadramento_codigo = p_ipi_enquadramento_codigo,
               pis_cst = p_pis_cst,
               cofins_cst = p_cofins_cst,
               pis_aliquota = p_pis_aliquota,
               cofins_aliquota = p_cofins_aliquota,
               default_output_cfop = p_default_output_cfop,
               default_input_cfop = p_default_input_cfop,
               internal_fiscal_code = p_internal_fiscal_code,
               default_fiscal_notes = p_default_fiscal_notes,
               is_active = COALESCE(p_is_active, true),
               requires_tax_configuration = COALESCE(p_requires_tax_configuration, true),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               ncm_reference_id = p_ncm_reference_id,
               ncm_version_id = p_ncm_version_id,
               tipi_reference_id = p_tipi_reference_id,
               tipi_version_id = p_tipi_version_id,
               cest_reference_id = p_cest_reference_id,
               cest_version_id = p_cest_version_id,
               default_output_cfop_reference_id = p_default_output_cfop_reference_id,
               default_output_cfop_version_id = p_default_output_cfop_version_id,
               default_input_cfop_reference_id = p_default_input_cfop_reference_id,
               default_input_cfop_version_id = p_default_input_cfop_version_id,
               fiscal_reference_snapshot_jsonb = COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
               version = tp.version + 1,
               updated_by = v_actor
         WHERE tp.id = p_tax_profile_id
         RETURNING tp.id, tp.version INTO v_profile_id, v_version;

        IF v_profile_id IS NULL THEN
            RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
        END IF;
    END IF;

    PERFORM public.persist_product_tax_profile_version(
        v_profile_id,
        CASE WHEN v_created THEN 'create' ELSE 'update' END,
        v_actor,
        NULL
    );

    RETURN QUERY SELECT v_profile_id, v_created, v_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB,
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
) TO authenticated, service_role;

-- 9) Duplicate profile now keeps reference bindings
CREATE OR REPLACE FUNCTION public.admin_duplicate_product_tax_profile(
    p_tax_profile_id UUID,
    p_new_name TEXT DEFAULT NULL,
    p_new_code TEXT DEFAULT NULL
)
RETURNS TABLE (
    new_tax_profile_id UUID,
    new_name TEXT,
    new_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_source RECORD;
    v_new_id UUID;
BEGIN
    SELECT * INTO v_source
      FROM public.product_tax_profiles
     WHERE id = p_tax_profile_id
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
    END IF;

    INSERT INTO public.product_tax_profiles (
        name, code, description, ncm, cest, origin_code,
        commercial_unit, tax_unit, ean_gtin, tax_ean_gtin,
        default_fiscal_description, fiscal_type, item_type,
        has_substitution_tax, requires_cest, has_ipi,
        ipi_cst_out, ipi_enquadramento_codigo, pis_cst, cofins_cst,
        pis_aliquota, cofins_aliquota, default_output_cfop, default_input_cfop,
        internal_fiscal_code, default_fiscal_notes, is_active,
        requires_tax_configuration, future_tax_payload, metadata_jsonb,
        ncm_reference_id, ncm_version_id, tipi_reference_id, tipi_version_id,
        cest_reference_id, cest_version_id,
        default_output_cfop_reference_id, default_output_cfop_version_id,
        default_input_cfop_reference_id, default_input_cfop_version_id,
        fiscal_reference_snapshot_jsonb,
        created_by, updated_by
    )
    VALUES (
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '_COPY_' || SUBSTRING(REPLACE(v_source.id::TEXT, '-', '') FROM 1 FOR 6)),
        v_source.description, v_source.ncm, v_source.cest, v_source.origin_code,
        v_source.commercial_unit, v_source.tax_unit, v_source.ean_gtin, v_source.tax_ean_gtin,
        v_source.default_fiscal_description, v_source.fiscal_type, v_source.item_type,
        v_source.has_substitution_tax, v_source.requires_cest, v_source.has_ipi,
        v_source.ipi_cst_out, v_source.ipi_enquadramento_codigo, v_source.pis_cst, v_source.cofins_cst,
        v_source.pis_aliquota, v_source.cofins_aliquota, v_source.default_output_cfop, v_source.default_input_cfop,
        v_source.internal_fiscal_code, v_source.default_fiscal_notes, v_source.is_active,
        v_source.requires_tax_configuration, v_source.future_tax_payload, v_source.metadata_jsonb,
        v_source.ncm_reference_id, v_source.ncm_version_id, v_source.tipi_reference_id, v_source.tipi_version_id,
        v_source.cest_reference_id, v_source.cest_version_id,
        v_source.default_output_cfop_reference_id, v_source.default_output_cfop_version_id,
        v_source.default_input_cfop_reference_id, v_source.default_input_cfop_version_id,
        v_source.fiscal_reference_snapshot_jsonb,
        v_actor, v_actor
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.product_tax_profile_rules (
        tax_profile_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override,
        priority, is_active, effective_from, effective_to,
        rule_payload_jsonb, future_tax_payload, created_by, updated_by
    )
    SELECT
        v_new_id, rule_name, operation_direction, origin_uf, destination_uf,
        customer_type_id, person_type, taxpayer_indicator, cfop_override,
        priority, is_active, effective_from, effective_to,
        rule_payload_jsonb, future_tax_payload, v_actor, v_actor
    FROM public.product_tax_profile_rules
    WHERE tax_profile_id = p_tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(v_new_id, 'create', v_actor, 'Created by duplication');
    PERFORM public.persist_product_tax_profile_version(v_new_id, 'duplicate', v_actor, 'Duplicated from existing profile');

    RETURN QUERY
    SELECT
        v_new_id,
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '_COPY_' || SUBSTRING(REPLACE(v_source.id::TEXT, '-', '') FROM 1 FOR 6));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_duplicate_product_tax_profile(UUID, TEXT, TEXT)
TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_fiscal_reference_type_settings_updated_at ON public.fiscal_reference_type_settings;
CREATE TRIGGER update_fiscal_reference_type_settings_updated_at
    BEFORE UPDATE ON public.fiscal_reference_type_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fiscal_reference_type_settings (
    table_type,
    label,
    description,
    sort_order,
    recommended_refresh_days,
    is_enabled
)
VALUES
    ('ncm', 'NCM', 'Nomenclatura Comum do Mercosul', 1, 180, true),
    ('tipi', 'TIPI / IPI', 'Tabela de incidencia do IPI por NCM', 2, 180, true),
    ('cest', 'CEST', 'Codigo Especificador da Substituicao Tributaria', 3, 180, true),
    ('cfop', 'CFOP', 'Codigo Fiscal de Operacoes e Prestacoes', 4, 365, true)
ON CONFLICT (table_type) DO UPDATE
   SET label = EXCLUDED.label,
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       recommended_refresh_days = EXCLUDED.recommended_refresh_days,
       is_enabled = EXCLUDED.is_enabled,
       updated_at = NOW();

