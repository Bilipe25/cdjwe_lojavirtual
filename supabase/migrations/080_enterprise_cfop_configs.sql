-- ============================================================
-- Migration 080: Enterprise CFOP Configurations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_presumed_credit_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_label TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL DEFAULT 'seed',
    source_file_name TEXT,
    import_batch_label TEXT,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_presumed_credit_versions_active
    ON public.fiscal_ibscbs_presumed_credit_versions(is_active, valid_from DESC NULLS LAST, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_ibscbs_presumed_credit_versions_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_ibscbs_presumed_credit_versions
            ADD CONSTRAINT fiscal_ibscbs_presumed_credit_versions_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
                AND (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_presumed_credit_versions_updated_at
    ON public.fiscal_ibscbs_presumed_credit_versions;
CREATE TRIGGER update_fiscal_ibscbs_presumed_credit_versions_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_presumed_credit_versions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_ibscbs_presumed_credit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id UUID NOT NULL REFERENCES public.fiscal_ibscbs_presumed_credit_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    valid_from DATE,
    valid_to DATE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_ibscbs_presumed_credit_items_version_code_unique UNIQUE (version_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_ibscbs_presumed_credit_items_lookup
    ON public.fiscal_ibscbs_presumed_credit_items(version_id, is_active, sort_order, code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_ibscbs_presumed_credit_items_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_ibscbs_presumed_credit_items
            ADD CONSTRAINT fiscal_ibscbs_presumed_credit_items_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
                AND (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_ibscbs_presumed_credit_items_updated_at
    ON public.fiscal_ibscbs_presumed_credit_items;
CREATE TRIGGER update_fiscal_ibscbs_presumed_credit_items_updated_at
    BEFORE UPDATE ON public.fiscal_ibscbs_presumed_credit_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cfop_entry_id UUID NOT NULL REFERENCES public.fiscal_cfop_entries(id) ON DELETE CASCADE,
    cfop_version_id UUID NOT NULL REFERENCES public.fiscal_reference_versions(id) ON DELETE CASCADE,
    operation_group TEXT NOT NULL,
    general_description TEXT,
    default_note TEXT,
    operation_scope TEXT NOT NULL DEFAULT 'all',
    applies_to_own_manufacture BOOLEAN NOT NULL DEFAULT false,
    applies_to_resale BOOLEAN NOT NULL DEFAULT false,
    applies_outside_establishment BOOLEAN NOT NULL DEFAULT false,
    applies_consumer_final BOOLEAN NOT NULL DEFAULT false,
    applies_taxpayer BOOLEAN NOT NULL DEFAULT false,
    supports_st BOOLEAN NOT NULL DEFAULT false,
    impacts_icms BOOLEAN NOT NULL DEFAULT true,
    impacts_ibscbs BOOLEAN NOT NULL DEFAULT false,
    sum_operation_total_invoice BOOLEAN NOT NULL DEFAULT true,
    is_recommended BOOLEAN NOT NULL DEFAULT false,
    is_legacy BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    configuration_status TEXT NOT NULL DEFAULT 'pending',
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_cfop_configs_cfop_entry_unique UNIQUE (cfop_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_cfop_configs_version_status
    ON public.fiscal_cfop_configs(cfop_version_id, configuration_status, is_active);
CREATE INDEX IF NOT EXISTS idx_fiscal_cfop_configs_scope_group
    ON public.fiscal_cfop_configs(operation_scope, operation_group);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_configs_operation_group_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_configs
            ADD CONSTRAINT fiscal_cfop_configs_operation_group_check
            CHECK (
                operation_group IN (
                    'sale_own_manufacture',
                    'sale_resale',
                    'purchase_input',
                    'purchase_resale',
                    'transfer',
                    'return',
                    'service',
                    'other'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_configs_operation_scope_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_configs
            ADD CONSTRAINT fiscal_cfop_configs_operation_scope_check
            CHECK (operation_scope IN ('internal', 'interstate', 'external', 'all'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_configs_status_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_configs
            ADD CONSTRAINT fiscal_cfop_configs_status_check
            CHECK (configuration_status IN ('pending', 'partial', 'ready', 'legacy'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_configs_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_configs
            ADD CONSTRAINT fiscal_cfop_configs_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_cfop_configs_updated_at ON public.fiscal_cfop_configs;
CREATE TRIGGER update_fiscal_cfop_configs_updated_at
    BEFORE UPDATE ON public.fiscal_cfop_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_icms_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cfop_config_id UUID NOT NULL REFERENCES public.fiscal_cfop_configs(id) ON DELETE CASCADE,
    calculate_icms BOOLEAN NOT NULL DEFAULT true,
    simple_national_non_taxed BOOLEAN NOT NULL DEFAULT false,
    omit_icms_for_individual BOOLEAN NOT NULL DEFAULT false,
    highlight_st_on_invoice BOOLEAN NOT NULL DEFAULT false,
    st_collected_previously BOOLEAN NOT NULL DEFAULT false,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_cfop_icms_configs_cfop_config_unique UNIQUE (cfop_config_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_icms_configs_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_icms_configs
            ADD CONSTRAINT fiscal_cfop_icms_configs_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_cfop_icms_configs_updated_at ON public.fiscal_cfop_icms_configs;
CREATE TRIGGER update_fiscal_cfop_icms_configs_updated_at
    BEFORE UPDATE ON public.fiscal_cfop_icms_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_ibscbs_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cfop_config_id UUID NOT NULL REFERENCES public.fiscal_cfop_configs(id) ON DELETE CASCADE,
    cst_catalog_version_id UUID REFERENCES public.fiscal_ibscbs_cst_catalog_versions(id) ON DELETE SET NULL,
    cst_code TEXT,
    classification_version_id UUID REFERENCES public.fiscal_ibscbs_classification_versions(id) ON DELETE SET NULL,
    classification_code TEXT,
    regular_cst_code TEXT,
    regular_classification_code TEXT,
    presumed_credit_catalog_version_id UUID REFERENCES public.fiscal_ibscbs_presumed_credit_versions(id) ON DELETE SET NULL,
    presumed_credit_code TEXT,
    presumed_credit_rate NUMERIC(7,4),
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_cfop_ibscbs_configs_cfop_config_unique UNIQUE (cfop_config_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_ibscbs_configs_rate_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_ibscbs_configs
            ADD CONSTRAINT fiscal_cfop_ibscbs_configs_rate_check
            CHECK (presumed_credit_rate IS NULL OR presumed_credit_rate >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_ibscbs_configs_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_ibscbs_configs
            ADD CONSTRAINT fiscal_cfop_ibscbs_configs_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_cfop_ibscbs_configs_updated_at ON public.fiscal_cfop_ibscbs_configs;
CREATE TRIGGER update_fiscal_cfop_ibscbs_configs_updated_at
    BEFORE UPDATE ON public.fiscal_cfop_ibscbs_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_piscofins_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cfop_config_id UUID NOT NULL REFERENCES public.fiscal_cfop_configs(id) ON DELETE CASCADE,
    pis_cst_catalog_type TEXT NOT NULL DEFAULT 'pis_cst',
    pis_cst_code TEXT,
    cofins_cst_catalog_type TEXT NOT NULL DEFAULT 'cofins_cst',
    cofins_cst_code TEXT,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    future_tax_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fiscal_cfop_piscofins_configs_cfop_config_unique UNIQUE (cfop_config_id),
    CONSTRAINT fiscal_cfop_piscofins_configs_pis_catalog_type_check CHECK (pis_cst_catalog_type = 'pis_cst'),
    CONSTRAINT fiscal_cfop_piscofins_configs_cofins_catalog_type_check CHECK (cofins_cst_catalog_type = 'cofins_cst'),
    CONSTRAINT fiscal_cfop_piscofins_configs_pis_cst_fk
        FOREIGN KEY (pis_cst_catalog_type, pis_cst_code)
        REFERENCES public.fiscal_catalog_items(catalog_type, code),
    CONSTRAINT fiscal_cfop_piscofins_configs_cofins_cst_fk
        FOREIGN KEY (cofins_cst_catalog_type, cofins_cst_code)
        REFERENCES public.fiscal_catalog_items(catalog_type, code)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_piscofins_configs_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_piscofins_configs
            ADD CONSTRAINT fiscal_cfop_piscofins_configs_payload_check
            CHECK (
                jsonb_typeof(metadata_jsonb) = 'object'
                AND jsonb_typeof(future_tax_payload) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_cfop_piscofins_configs_updated_at ON public.fiscal_cfop_piscofins_configs;
CREATE TRIGGER update_fiscal_cfop_piscofins_configs_updated_at
    BEFORE UPDATE ON public.fiscal_cfop_piscofins_configs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_tax_profiles
    ADD COLUMN IF NOT EXISTS default_output_cfop_config_id UUID REFERENCES public.fiscal_cfop_configs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS default_input_cfop_config_id UUID REFERENCES public.fiscal_cfop_configs(id) ON DELETE SET NULL;

ALTER TABLE public.product_tax_profile_rules
    ADD COLUMN IF NOT EXISTS cfop_config_id UUID REFERENCES public.fiscal_cfop_configs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cfop_reference_id UUID REFERENCES public.fiscal_cfop_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cfop_version_id UUID REFERENCES public.fiscal_reference_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_default_output_cfop_config
    ON public.product_tax_profiles(default_output_cfop_config_id);
CREATE INDEX IF NOT EXISTS idx_product_tax_profiles_default_input_cfop_config
    ON public.product_tax_profiles(default_input_cfop_config_id);
CREATE INDEX IF NOT EXISTS idx_product_tax_profile_rules_cfop_config
    ON public.product_tax_profile_rules(cfop_config_id);

CREATE OR REPLACE FUNCTION public.compute_fiscal_cfop_configuration_status(
    p_operation_group TEXT,
    p_general_description TEXT,
    p_impacts_icms BOOLEAN DEFAULT true,
    p_impacts_ibscbs BOOLEAN DEFAULT false,
    p_is_legacy BOOLEAN DEFAULT false,
    p_icms_config JSONB DEFAULT '{}'::JSONB,
    p_ibscbs_config JSONB DEFAULT '{}'::JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_has_icms_payload BOOLEAN := COALESCE(jsonb_typeof(p_icms_config), 'null') = 'object'
        AND (
            COALESCE((p_icms_config ->> 'calculate_icms')::BOOLEAN, true) = false
            OR COALESCE((p_icms_config ->> 'simple_national_non_taxed')::BOOLEAN, false)
            OR COALESCE((p_icms_config ->> 'omit_icms_for_individual')::BOOLEAN, false)
            OR COALESCE((p_icms_config ->> 'highlight_st_on_invoice')::BOOLEAN, false)
            OR COALESCE((p_icms_config ->> 'st_collected_previously')::BOOLEAN, false)
        );
    v_has_ibscbs_payload BOOLEAN := COALESCE(jsonb_typeof(p_ibscbs_config), 'null') = 'object'
        AND NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'cst_code', '')), '') IS NOT NULL
        AND NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'classification_code', '')), '') IS NOT NULL;
BEGIN
    IF COALESCE(p_is_legacy, false) THEN
        RETURN 'legacy';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_operation_group, '')), '') IS NULL THEN
        RETURN 'pending';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_general_description, '')), '') IS NULL THEN
        RETURN 'partial';
    END IF;

    IF COALESCE(p_impacts_ibscbs, false) AND NOT v_has_ibscbs_payload THEN
        RETURN 'partial';
    END IF;

    IF COALESCE(p_impacts_icms, true) AND NOT v_has_icms_payload THEN
        RETURN 'partial';
    END IF;

    RETURN 'ready';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_product_tax_context(
    p_product_variant_id UUID,
    p_store_id UUID,
    p_operation_direction TEXT DEFAULT 'outbound',
    p_issue_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_profile_id UUID,
    tax_profile_version INTEGER,
    ncm TEXT,
    cest TEXT,
    origin_code TEXT,
    resolved_cfop TEXT,
    applied_rule_id UUID,
    context_jsonb JSONB,
    payload_jsonb JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_product_id UUID;
    v_destination_uf TEXT;
    v_profile RECORD;
    v_rule RECORD;
    v_selected_cfop_config RECORD;
    v_resolved_cfop TEXT;
BEGIN
    SELECT pv.product_id INTO v_product_id FROM public.product_variants pv WHERE pv.id = p_product_variant_id LIMIT 1;
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Product variant % not found', p_product_variant_id;
    END IF;

    SELECT UPPER(COALESCE(sa.state, s.state))
      INTO v_destination_uf
      FROM public.stores s
      LEFT JOIN LATERAL (
        SELECT state
          FROM public.store_addresses
         WHERE store_id = s.id
           AND is_main = true
         ORDER BY created_at ASC
         LIMIT 1
      ) sa ON true
     WHERE s.id = p_store_id
     LIMIT 1;

    SELECT tp.* INTO v_profile
      FROM public.products p
      LEFT JOIN public.product_tax_profiles tp
        ON tp.id = p.tax_profile_id
     WHERE p.id = v_product_id
     LIMIT 1;

    IF v_profile.id IS NULL THEN
        RETURN QUERY
        SELECT
            NULL::UUID,
            NULL::INTEGER,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::TEXT,
            NULL::UUID,
            jsonb_build_object(
                'operation_direction', COALESCE(p_operation_direction, 'outbound'),
                'destination_uf', v_destination_uf,
                'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
                'rule_applied', false
            ),
            '{}'::JSONB;
        RETURN;
    END IF;

    SELECT r.* INTO v_rule
      FROM public.product_tax_profile_rules r
     WHERE r.tax_profile_id = v_profile.id
       AND r.is_active = true
       AND r.operation_direction = COALESCE(p_operation_direction, 'outbound')
       AND (r.destination_uf IS NULL OR r.destination_uf = v_destination_uf)
       AND (r.effective_from IS NULL OR r.effective_from <= COALESCE(p_issue_date, CURRENT_DATE))
       AND (r.effective_to IS NULL OR r.effective_to >= COALESCE(p_issue_date, CURRENT_DATE))
     ORDER BY r.priority DESC, r.created_at DESC
     LIMIT 1;

    SELECT config.*, entry.code AS cfop_code, entry.description AS cfop_description, entry.operation_direction AS cfop_direction
      INTO v_selected_cfop_config
      FROM public.fiscal_cfop_configs config
      INNER JOIN public.fiscal_cfop_entries entry
        ON entry.id = config.cfop_entry_id
     WHERE config.id = COALESCE(
            v_rule.cfop_config_id,
            CASE
                WHEN COALESCE(p_operation_direction, 'outbound') = 'inbound' THEN v_profile.default_input_cfop_config_id
                ELSE v_profile.default_output_cfop_config_id
            END
        )
     LIMIT 1;

    IF v_selected_cfop_config.id IS NOT NULL THEN
        v_resolved_cfop := v_selected_cfop_config.cfop_code;
    ELSE
        v_resolved_cfop := COALESCE(
            NULLIF(TRIM(COALESCE(v_rule.cfop_override, '')), ''),
            CASE
                WHEN COALESCE(p_operation_direction, 'outbound') = 'inbound' THEN v_profile.default_input_cfop
                ELSE v_profile.default_output_cfop
            END
        );
    END IF;

    RETURN QUERY
    SELECT
        v_profile.id,
        v_profile.version,
        v_profile.ncm,
        v_profile.cest,
        v_profile.origin_code,
        v_resolved_cfop,
        v_rule.id,
        jsonb_strip_nulls(
            jsonb_build_object(
                'operation_direction', COALESCE(p_operation_direction, 'outbound'),
                'destination_uf', v_destination_uf,
                'issue_date', COALESCE(p_issue_date, CURRENT_DATE),
                'rule_applied', v_rule.id IS NOT NULL,
                'rule_priority', v_rule.priority,
                'tax_profile_version', v_profile.version,
                'resolved_cfop_config_id', v_selected_cfop_config.id,
                'resolved_cfop_reference_id', v_selected_cfop_config.cfop_entry_id,
                'resolved_cfop_version_id', v_selected_cfop_config.cfop_version_id
            )
        ),
        jsonb_strip_nulls(
            jsonb_build_object(
                'fiscal_type', v_profile.fiscal_type,
                'item_type', v_profile.item_type,
                'has_substitution_tax', v_profile.has_substitution_tax,
                'has_ipi', v_profile.has_ipi,
                'ipi_cst_out', v_profile.ipi_cst_out,
                'ipi_enquadramento_codigo', v_profile.ipi_enquadramento_codigo,
                'pis_cst', v_profile.pis_cst,
                'cofins_cst', v_profile.cofins_cst,
                'pis_aliquota', v_profile.pis_aliquota,
                'cofins_aliquota', v_profile.cofins_aliquota,
                'internal_fiscal_code', v_profile.internal_fiscal_code,
                'ncm_version_id', v_profile.ncm_version_id,
                'tipi_version_id', v_profile.tipi_version_id,
                'cest_version_id', v_profile.cest_version_id,
                'default_output_cfop_version_id', v_profile.default_output_cfop_version_id,
                'default_input_cfop_version_id', v_profile.default_input_cfop_version_id,
                'resolved_cfop_config', CASE
                    WHEN v_selected_cfop_config.id IS NULL THEN NULL
                    ELSE jsonb_build_object(
                        'config_id', v_selected_cfop_config.id,
                        'entry_id', v_selected_cfop_config.cfop_entry_id,
                        'version_id', v_selected_cfop_config.cfop_version_id,
                        'code', v_selected_cfop_config.cfop_code,
                        'description', v_selected_cfop_config.cfop_description,
                        'operation_direction', v_selected_cfop_config.cfop_direction,
                        'operation_group', v_selected_cfop_config.operation_group,
                        'operation_scope', v_selected_cfop_config.operation_scope,
                        'configuration_status', v_selected_cfop_config.configuration_status,
                        'supports_st', v_selected_cfop_config.supports_st,
                        'impacts_icms', v_selected_cfop_config.impacts_icms,
                        'impacts_ibscbs', v_selected_cfop_config.impacts_ibscbs
                    )
                END,
                'icms_base_id', v_profile.icms_base_id,
                'icms_base_code', (SELECT base.code FROM public.fiscal_icms_bases base WHERE base.id = v_profile.icms_base_id LIMIT 1),
                'icms_base_name', (SELECT base.name FROM public.fiscal_icms_bases base WHERE base.id = v_profile.icms_base_id LIMIT 1),
                'ibscbs_base_id', v_profile.ibscbs_base_id,
                'ibscbs_version_id', v_profile.ibscbs_version_id,
                'ibscbs_base_code', (SELECT base.code FROM public.fiscal_ibscbs_bases base WHERE base.id = v_profile.ibscbs_base_id LIMIT 1),
                'ibscbs_base_name', (SELECT base.name FROM public.fiscal_ibscbs_bases base WHERE base.id = v_profile.ibscbs_base_id LIMIT 1),
                'ibscbs_version_label', (SELECT version_row.version_label FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'ibscbs_valid_from', (SELECT version_row.valid_from FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'ibscbs_valid_to', (SELECT version_row.valid_to FROM public.fiscal_ibscbs_base_versions version_row WHERE version_row.id = v_profile.ibscbs_version_id LIMIT 1),
                'fiscal_reference_snapshot', v_profile.fiscal_reference_snapshot_jsonb
            )
            || COALESCE(v_profile.future_tax_payload, '{}'::JSONB)
            || COALESCE(v_rule.rule_payload_jsonb, '{}'::JSONB)
            || COALESCE(v_rule.future_tax_payload, '{}'::JSONB)
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_product_tax_profile_version(
    p_tax_profile_id UUID,
    p_change_type TEXT DEFAULT 'update',
    p_actor_profile_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_rules_snapshot JSONB := '[]'::JSONB;
BEGIN
    SELECT *
      INTO v_profile
      FROM public.product_tax_profiles
     WHERE id = p_tax_profile_id
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            to_jsonb(rule_row)
            ORDER BY rule_row.priority DESC, rule_row.created_at DESC
        ),
        '[]'::JSONB
    )
      INTO v_rules_snapshot
      FROM public.product_tax_profile_rules rule_row
     WHERE rule_row.tax_profile_id = p_tax_profile_id;

    INSERT INTO public.product_tax_profile_versions (
        tax_profile_id,
        version,
        change_type,
        snapshot,
        changed_by,
        notes
    )
    VALUES (
        v_profile.id,
        v_profile.version,
        COALESCE(NULLIF(TRIM(COALESCE(p_change_type, '')), ''), 'update'),
        to_jsonb(v_profile) || jsonb_build_object('rules', v_rules_snapshot),
        p_actor_profile_id,
        p_notes
    )
    ON CONFLICT (tax_profile_id, version) DO UPDATE
        SET change_type = EXCLUDED.change_type,
            snapshot = EXCLUDED.snapshot,
            changed_by = EXCLUDED.changed_by,
            notes = EXCLUDED.notes,
            changed_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_fiscal_cfop_config(
    p_cfop_config_id UUID DEFAULT NULL,
    p_cfop_entry_id UUID DEFAULT NULL,
    p_cfop_version_id UUID DEFAULT NULL,
    p_operation_group TEXT DEFAULT NULL,
    p_general_description TEXT DEFAULT NULL,
    p_default_note TEXT DEFAULT NULL,
    p_operation_scope TEXT DEFAULT 'all',
    p_applies_to_own_manufacture BOOLEAN DEFAULT false,
    p_applies_to_resale BOOLEAN DEFAULT false,
    p_applies_outside_establishment BOOLEAN DEFAULT false,
    p_applies_consumer_final BOOLEAN DEFAULT false,
    p_applies_taxpayer BOOLEAN DEFAULT false,
    p_supports_st BOOLEAN DEFAULT false,
    p_impacts_icms BOOLEAN DEFAULT true,
    p_impacts_ibscbs BOOLEAN DEFAULT false,
    p_sum_operation_total_invoice BOOLEAN DEFAULT true,
    p_is_recommended BOOLEAN DEFAULT false,
    p_is_legacy BOOLEAN DEFAULT false,
    p_is_active BOOLEAN DEFAULT true,
    p_icms_config JSONB DEFAULT '{}'::JSONB,
    p_ibscbs_config JSONB DEFAULT '{}'::JSONB,
    p_piscofins_config JSONB DEFAULT '{}'::JSONB,
    p_metadata_jsonb JSONB DEFAULT '{}'::JSONB,
    p_future_tax_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    cfop_config_id UUID,
    created BOOLEAN,
    configuration_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_created BOOLEAN := false;
    v_config_id UUID;
    v_entry RECORD;
    v_direction TEXT;
    v_operation_scope TEXT := COALESCE(NULLIF(TRIM(COALESCE(p_operation_scope, '')), ''), 'all');
    v_status TEXT;
    v_cst_catalog_version_id UUID;
    v_classification_version_id UUID;
    v_presumed_credit_version_id UUID;
    v_cst_code TEXT;
    v_regular_cst_code TEXT;
    v_classification_code TEXT;
    v_regular_classification_code TEXT;
    v_presumed_credit_code TEXT;
    v_pis_cst_code TEXT;
    v_cofins_cst_code TEXT;
BEGIN
    IF p_cfop_entry_id IS NULL THEN
        RAISE EXCEPTION 'p_cfop_entry_id is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_operation_group, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_operation_group is required';
    END IF;

    IF p_icms_config IS NULL OR jsonb_typeof(p_icms_config) <> 'object' THEN
        RAISE EXCEPTION 'p_icms_config must be a JSON object';
    END IF;

    IF p_ibscbs_config IS NULL OR jsonb_typeof(p_ibscbs_config) <> 'object' THEN
        RAISE EXCEPTION 'p_ibscbs_config must be a JSON object';
    END IF;

    IF p_piscofins_config IS NULL OR jsonb_typeof(p_piscofins_config) <> 'object' THEN
        RAISE EXCEPTION 'p_piscofins_config must be a JSON object';
    END IF;

    SELECT entry.*, version_row.id AS resolved_version_id
      INTO v_entry
      FROM public.fiscal_cfop_entries entry
      INNER JOIN public.fiscal_reference_versions version_row
        ON version_row.id = entry.version_id
     WHERE entry.id = p_cfop_entry_id
       AND (p_cfop_version_id IS NULL OR entry.version_id = p_cfop_version_id)
     LIMIT 1;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'CFOP entry % not found', p_cfop_entry_id;
    END IF;

    v_direction := COALESCE(v_entry.operation_direction, 'both');

    IF v_operation_scope = 'internal' AND LEFT(v_entry.code, 1) NOT IN ('1', '5') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com escopo interno', v_entry.code;
    END IF;

    IF v_operation_scope = 'interstate' AND LEFT(v_entry.code, 1) NOT IN ('2', '6') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com escopo interestadual', v_entry.code;
    END IF;

    IF v_operation_scope = 'external' AND LEFT(v_entry.code, 1) NOT IN ('3', '7') THEN
        RAISE EXCEPTION 'CFOP % nao e compativel com operacoes com exterior', v_entry.code;
    END IF;

    v_cst_catalog_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'cst_catalog_version_id', '')), '')::UUID;
    v_classification_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'classification_version_id', '')), '')::UUID;
    v_presumed_credit_version_id := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'presumed_credit_catalog_version_id', '')), '')::UUID;
    v_cst_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'cst_code', '')), '');
    v_regular_cst_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'regular_cst_code', '')), '');
    v_classification_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'classification_code', '')), '');
    v_regular_classification_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'regular_classification_code', '')), '');
    v_presumed_credit_code := NULLIF(TRIM(COALESCE(p_ibscbs_config ->> 'presumed_credit_code', '')), '');
    v_pis_cst_code := NULLIF(TRIM(COALESCE(p_piscofins_config ->> 'pis_cst_code', '')), '');
    v_cofins_cst_code := NULLIF(TRIM(COALESCE(p_piscofins_config ->> 'cofins_cst_code', '')), '');

    IF COALESCE(p_impacts_ibscbs, false) THEN
        IF v_cst_catalog_version_id IS NULL OR v_classification_version_id IS NULL THEN
            RAISE EXCEPTION 'Selecione versoes de catalogo ativas para IBS/CBS';
        END IF;

        IF v_cst_code IS NULL OR v_classification_code IS NULL THEN
            RAISE EXCEPTION 'CST e classificacao tributaria de IBS/CBS sao obrigatorios quando o bloco estiver ativo';
        END IF;

        IF LEFT(v_classification_code, 3) <> v_cst_code THEN
            RAISE EXCEPTION 'Classification code % must match IBS/CBS CST %', v_classification_code, v_cst_code;
        END IF;

        IF v_regular_classification_code IS NOT NULL AND v_regular_cst_code IS NULL THEN
            RAISE EXCEPTION 'Regular CST is required when regular classification is informed';
        END IF;

        IF v_regular_classification_code IS NOT NULL AND LEFT(v_regular_classification_code, 3) <> v_regular_cst_code THEN
            RAISE EXCEPTION 'Regular classification code % must match regular CST %', v_regular_classification_code, v_regular_cst_code;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_cst_catalog_items item
         WHERE item.catalog_version_id = v_cst_catalog_version_id
           AND item.code = v_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'IBS/CBS CST % not found in catalog version %', v_cst_code, v_cst_catalog_version_id;
        END IF;

        IF v_regular_cst_code IS NOT NULL THEN
            PERFORM 1
              FROM public.fiscal_ibscbs_cst_catalog_items item
             WHERE item.catalog_version_id = v_cst_catalog_version_id
               AND item.code = v_regular_cst_code
               AND item.is_active = true;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Regular IBS/CBS CST % not found in catalog version %', v_regular_cst_code, v_cst_catalog_version_id;
            END IF;
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_classification_items item
         WHERE item.catalog_version_id = v_classification_version_id
           AND item.code = v_classification_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'IBS/CBS classification % not found in catalog version %', v_classification_code, v_classification_version_id;
        END IF;

        IF v_regular_classification_code IS NOT NULL THEN
            PERFORM 1
              FROM public.fiscal_ibscbs_classification_items item
             WHERE item.catalog_version_id = v_classification_version_id
               AND item.code = v_regular_classification_code
               AND item.is_active = true;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Regular IBS/CBS classification % not found in catalog version %', v_regular_classification_code, v_classification_version_id;
            END IF;
        END IF;
    END IF;

    IF v_presumed_credit_code IS NOT NULL THEN
        IF v_presumed_credit_version_id IS NULL THEN
            RAISE EXCEPTION 'Presumed credit catalog version is required when presumed credit code is informed';
        END IF;

        PERFORM 1
          FROM public.fiscal_ibscbs_presumed_credit_items item
         WHERE item.catalog_version_id = v_presumed_credit_version_id
           AND item.code = v_presumed_credit_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Presumed credit code % not found in catalog version %', v_presumed_credit_code, v_presumed_credit_version_id;
        END IF;
    END IF;

    IF v_pis_cst_code IS NOT NULL THEN
        PERFORM 1
          FROM public.fiscal_catalog_items item
         WHERE item.catalog_type = 'pis_cst'
           AND item.code = v_pis_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PIS CST % not found in fiscal catalog', v_pis_cst_code;
        END IF;
    END IF;

    IF v_cofins_cst_code IS NOT NULL THEN
        PERFORM 1
          FROM public.fiscal_catalog_items item
         WHERE item.catalog_type = 'cofins_cst'
           AND item.code = v_cofins_cst_code
           AND item.is_active = true;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'COFINS CST % not found in fiscal catalog', v_cofins_cst_code;
        END IF;
    END IF;

    v_status := public.compute_fiscal_cfop_configuration_status(
        p_operation_group,
        p_general_description,
        p_impacts_icms,
        p_impacts_ibscbs,
        p_is_legacy,
        p_icms_config,
        p_ibscbs_config
    );

    IF p_cfop_config_id IS NULL THEN
        INSERT INTO public.fiscal_cfop_configs (
            cfop_entry_id,
            cfop_version_id,
            operation_group,
            general_description,
            default_note,
            operation_scope,
            applies_to_own_manufacture,
            applies_to_resale,
            applies_outside_establishment,
            applies_consumer_final,
            applies_taxpayer,
            supports_st,
            impacts_icms,
            impacts_ibscbs,
            sum_operation_total_invoice,
            is_recommended,
            is_legacy,
            is_active,
            configuration_status,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            p_cfop_entry_id,
            v_entry.version_id,
            TRIM(p_operation_group),
            NULLIF(TRIM(COALESCE(p_general_description, '')), ''),
            NULLIF(TRIM(COALESCE(p_default_note, '')), ''),
            v_operation_scope,
            COALESCE(p_applies_to_own_manufacture, false),
            COALESCE(p_applies_to_resale, false),
            COALESCE(p_applies_outside_establishment, false),
            COALESCE(p_applies_consumer_final, false),
            COALESCE(p_applies_taxpayer, false),
            COALESCE(p_supports_st, false),
            COALESCE(p_impacts_icms, true),
            COALESCE(p_impacts_ibscbs, false),
            COALESCE(p_sum_operation_total_invoice, true),
            COALESCE(p_is_recommended, false),
            COALESCE(p_is_legacy, false),
            COALESCE(p_is_active, true),
            v_status,
            COALESCE(p_metadata_jsonb, '{}'::JSONB),
            COALESCE(p_future_tax_payload, '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT (cfop_entry_id) DO UPDATE
            SET cfop_version_id = EXCLUDED.cfop_version_id,
                operation_group = EXCLUDED.operation_group,
                general_description = EXCLUDED.general_description,
                default_note = EXCLUDED.default_note,
                operation_scope = EXCLUDED.operation_scope,
                applies_to_own_manufacture = EXCLUDED.applies_to_own_manufacture,
                applies_to_resale = EXCLUDED.applies_to_resale,
                applies_outside_establishment = EXCLUDED.applies_outside_establishment,
                applies_consumer_final = EXCLUDED.applies_consumer_final,
                applies_taxpayer = EXCLUDED.applies_taxpayer,
                supports_st = EXCLUDED.supports_st,
                impacts_icms = EXCLUDED.impacts_icms,
                impacts_ibscbs = EXCLUDED.impacts_ibscbs,
                sum_operation_total_invoice = EXCLUDED.sum_operation_total_invoice,
                is_recommended = EXCLUDED.is_recommended,
                is_legacy = EXCLUDED.is_legacy,
                is_active = EXCLUDED.is_active,
                configuration_status = EXCLUDED.configuration_status,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW()
        RETURNING id INTO v_config_id;

        v_created := true;
    ELSE
        UPDATE public.fiscal_cfop_configs config
           SET cfop_entry_id = p_cfop_entry_id,
               cfop_version_id = v_entry.version_id,
               operation_group = TRIM(p_operation_group),
               general_description = NULLIF(TRIM(COALESCE(p_general_description, '')), ''),
               default_note = NULLIF(TRIM(COALESCE(p_default_note, '')), ''),
               operation_scope = v_operation_scope,
               applies_to_own_manufacture = COALESCE(p_applies_to_own_manufacture, false),
               applies_to_resale = COALESCE(p_applies_to_resale, false),
               applies_outside_establishment = COALESCE(p_applies_outside_establishment, false),
               applies_consumer_final = COALESCE(p_applies_consumer_final, false),
               applies_taxpayer = COALESCE(p_applies_taxpayer, false),
               supports_st = COALESCE(p_supports_st, false),
               impacts_icms = COALESCE(p_impacts_icms, true),
               impacts_ibscbs = COALESCE(p_impacts_ibscbs, false),
               sum_operation_total_invoice = COALESCE(p_sum_operation_total_invoice, true),
               is_recommended = COALESCE(p_is_recommended, false),
               is_legacy = COALESCE(p_is_legacy, false),
               is_active = COALESCE(p_is_active, true),
               configuration_status = v_status,
               metadata_jsonb = COALESCE(p_metadata_jsonb, '{}'::JSONB),
               future_tax_payload = COALESCE(p_future_tax_payload, '{}'::JSONB),
               updated_by = v_actor,
               updated_at = NOW()
         WHERE config.id = p_cfop_config_id
         RETURNING config.id INTO v_config_id;

        IF v_config_id IS NULL THEN
            RAISE EXCEPTION 'CFOP config % not found', p_cfop_config_id;
        END IF;
    END IF;

    INSERT INTO public.fiscal_cfop_icms_configs (
        cfop_config_id,
        calculate_icms,
        simple_national_non_taxed,
        omit_icms_for_individual,
        highlight_st_on_invoice,
        st_collected_previously,
        metadata_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    VALUES (
        v_config_id,
        COALESCE((p_icms_config ->> 'calculate_icms')::BOOLEAN, true),
        COALESCE((p_icms_config ->> 'simple_national_non_taxed')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'omit_icms_for_individual')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'highlight_st_on_invoice')::BOOLEAN, false),
        COALESCE((p_icms_config ->> 'st_collected_previously')::BOOLEAN, false),
        COALESCE(p_icms_config -> 'metadata_jsonb', '{}'::JSONB),
        COALESCE(p_icms_config -> 'future_tax_payload', '{}'::JSONB),
        v_actor,
        v_actor
    )
    ON CONFLICT ON CONSTRAINT fiscal_cfop_icms_configs_cfop_config_unique DO UPDATE
        SET calculate_icms = EXCLUDED.calculate_icms,
            simple_national_non_taxed = EXCLUDED.simple_national_non_taxed,
            omit_icms_for_individual = EXCLUDED.omit_icms_for_individual,
            highlight_st_on_invoice = EXCLUDED.highlight_st_on_invoice,
            st_collected_previously = EXCLUDED.st_collected_previously,
            metadata_jsonb = EXCLUDED.metadata_jsonb,
            future_tax_payload = EXCLUDED.future_tax_payload,
            updated_by = v_actor,
            updated_at = NOW();

    IF p_ibscbs_config <> '{}'::JSONB OR COALESCE(p_impacts_ibscbs, false) THEN
        INSERT INTO public.fiscal_cfop_ibscbs_configs (
            cfop_config_id,
            cst_catalog_version_id,
            cst_code,
            classification_version_id,
            classification_code,
            regular_cst_code,
            regular_classification_code,
            presumed_credit_catalog_version_id,
            presumed_credit_code,
            presumed_credit_rate,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_config_id,
            v_cst_catalog_version_id,
            v_cst_code,
            v_classification_version_id,
            v_classification_code,
            v_regular_cst_code,
            v_regular_classification_code,
            v_presumed_credit_version_id,
            v_presumed_credit_code,
            NULLIF(p_ibscbs_config ->> 'presumed_credit_rate', '')::NUMERIC,
            COALESCE(p_ibscbs_config -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_ibscbs_config -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT ON CONSTRAINT fiscal_cfop_ibscbs_configs_cfop_config_unique DO UPDATE
            SET cst_catalog_version_id = EXCLUDED.cst_catalog_version_id,
                cst_code = EXCLUDED.cst_code,
                classification_version_id = EXCLUDED.classification_version_id,
                classification_code = EXCLUDED.classification_code,
                regular_cst_code = EXCLUDED.regular_cst_code,
                regular_classification_code = EXCLUDED.regular_classification_code,
                presumed_credit_catalog_version_id = EXCLUDED.presumed_credit_catalog_version_id,
                presumed_credit_code = EXCLUDED.presumed_credit_code,
                presumed_credit_rate = EXCLUDED.presumed_credit_rate,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW();
    ELSE
        DELETE FROM public.fiscal_cfop_ibscbs_configs config WHERE config.cfop_config_id = v_config_id;
    END IF;

    IF p_piscofins_config <> '{}'::JSONB THEN
        INSERT INTO public.fiscal_cfop_piscofins_configs (
            cfop_config_id,
            pis_cst_code,
            cofins_cst_code,
            metadata_jsonb,
            future_tax_payload,
            created_by,
            updated_by
        )
        VALUES (
            v_config_id,
            v_pis_cst_code,
            v_cofins_cst_code,
            COALESCE(p_piscofins_config -> 'metadata_jsonb', '{}'::JSONB),
            COALESCE(p_piscofins_config -> 'future_tax_payload', '{}'::JSONB),
            v_actor,
            v_actor
        )
        ON CONFLICT ON CONSTRAINT fiscal_cfop_piscofins_configs_cfop_config_unique DO UPDATE
            SET pis_cst_code = EXCLUDED.pis_cst_code,
                cofins_cst_code = EXCLUDED.cofins_cst_code,
                metadata_jsonb = EXCLUDED.metadata_jsonb,
                future_tax_payload = EXCLUDED.future_tax_payload,
                updated_by = v_actor,
                updated_at = NOW();
    ELSE
        DELETE FROM public.fiscal_cfop_piscofins_configs config WHERE config.cfop_config_id = v_config_id;
    END IF;

    RETURN QUERY SELECT v_config_id, v_created, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_fiscal_cfop_config(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN,
    BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, JSONB, JSONB, JSONB, JSONB, JSONB
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_upsert_product_tax_profile(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN,
    TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, JSONB,
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB
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
    p_icms_base_id UUID DEFAULT NULL,
    p_ibscbs_base_id UUID DEFAULT NULL,
    p_ibscbs_version_id UUID DEFAULT NULL,
    p_default_output_cfop_config_id UUID DEFAULT NULL,
    p_default_input_cfop_config_id UUID DEFAULT NULL,
    p_fiscal_reference_snapshot_jsonb JSONB DEFAULT '{}'::JSONB,
    p_rules JSONB DEFAULT '[]'::JSONB
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
    v_rule JSONB;
    v_rule_id UUID;
    v_keep_rule_ids UUID[] := ARRAY[]::UUID[];
    v_default_output_cfop RECORD;
    v_default_input_cfop RECORD;
    v_rule_cfop RECORD;
    v_rule_cfop_config_id UUID;
    v_rule_cfop_reference_id UUID;
    v_rule_cfop_version_id UUID;
    v_rule_cfop_override TEXT;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_name is required';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_code, '')), '') IS NULL THEN
        RAISE EXCEPTION 'p_code is required';
    END IF;

    IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN
        RAISE EXCEPTION 'p_rules must be a JSON array';
    END IF;

    IF p_default_output_cfop_config_id IS NOT NULL THEN
        SELECT
            config.id AS config_id,
            config.cfop_entry_id AS reference_id,
            config.cfop_version_id AS version_id,
            config.is_active,
            entry.code,
            entry.operation_direction
        INTO v_default_output_cfop
        FROM public.fiscal_cfop_configs config
        INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
        WHERE config.id = p_default_output_cfop_config_id;

        IF v_default_output_cfop.config_id IS NULL THEN
            RAISE EXCEPTION 'Default output CFOP config % not found', p_default_output_cfop_config_id;
        END IF;

        IF COALESCE(v_default_output_cfop.is_active, false) = false THEN
            RAISE EXCEPTION 'Default output CFOP config % is inactive', COALESCE(v_default_output_cfop.code, p_default_output_cfop_config_id::TEXT);
        END IF;

        IF COALESCE(v_default_output_cfop.operation_direction, 'both') NOT IN ('outbound', 'both') THEN
            RAISE EXCEPTION 'CFOP config % cannot be used as default output', COALESCE(v_default_output_cfop.code, p_default_output_cfop_config_id::TEXT);
        END IF;

        p_default_output_cfop_reference_id := v_default_output_cfop.reference_id;
        p_default_output_cfop_version_id := v_default_output_cfop.version_id;
        p_default_output_cfop := v_default_output_cfop.code;
    END IF;

    IF p_default_input_cfop_config_id IS NOT NULL THEN
        SELECT
            config.id AS config_id,
            config.cfop_entry_id AS reference_id,
            config.cfop_version_id AS version_id,
            config.is_active,
            entry.code,
            entry.operation_direction
        INTO v_default_input_cfop
        FROM public.fiscal_cfop_configs config
        INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
        WHERE config.id = p_default_input_cfop_config_id;

        IF v_default_input_cfop.config_id IS NULL THEN
            RAISE EXCEPTION 'Default input CFOP config % not found', p_default_input_cfop_config_id;
        END IF;

        IF COALESCE(v_default_input_cfop.is_active, false) = false THEN
            RAISE EXCEPTION 'Default input CFOP config % is inactive', COALESCE(v_default_input_cfop.code, p_default_input_cfop_config_id::TEXT);
        END IF;

        IF COALESCE(v_default_input_cfop.operation_direction, 'both') NOT IN ('inbound', 'both') THEN
            RAISE EXCEPTION 'CFOP config % cannot be used as default input', COALESCE(v_default_input_cfop.code, p_default_input_cfop_config_id::TEXT);
        END IF;

        p_default_input_cfop_reference_id := v_default_input_cfop.reference_id;
        p_default_input_cfop_version_id := v_default_input_cfop.version_id;
        p_default_input_cfop := v_default_input_cfop.code;
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
            icms_base_id, ibscbs_base_id, ibscbs_version_id,
            default_output_cfop_config_id, default_input_cfop_config_id,
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
            p_icms_base_id, p_ibscbs_base_id, p_ibscbs_version_id,
            p_default_output_cfop_config_id, p_default_input_cfop_config_id,
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
               icms_base_id = p_icms_base_id,
               ibscbs_base_id = p_ibscbs_base_id,
               ibscbs_version_id = p_ibscbs_version_id,
               default_output_cfop_config_id = p_default_output_cfop_config_id,
               default_input_cfop_config_id = p_default_input_cfop_config_id,
               fiscal_reference_snapshot_jsonb = COALESCE(p_fiscal_reference_snapshot_jsonb, '{}'::JSONB),
               version = tp.version + 1,
               updated_by = v_actor
         WHERE tp.id = p_tax_profile_id
         RETURNING tp.id, tp.version INTO v_profile_id, v_version;

        IF v_profile_id IS NULL THEN
            RAISE EXCEPTION 'Tax profile % not found', p_tax_profile_id;
        END IF;
    END IF;

    FOR v_rule IN
        SELECT value FROM jsonb_array_elements(p_rules)
    LOOP
        IF NULLIF(TRIM(COALESCE(v_rule ->> 'rule_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'Every product tax profile rule requires rule_name';
        END IF;

        IF NULLIF(TRIM(COALESCE(v_rule ->> 'operation_direction', '')), '') NOT IN ('outbound', 'inbound') THEN
            RAISE EXCEPTION 'Every product tax profile rule requires operation_direction inbound/outbound';
        END IF;

        v_rule_cfop_config_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_config_id', '')), '')::UUID;
        v_rule_cfop_reference_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_reference_id', '')), '')::UUID;
        v_rule_cfop_version_id := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_version_id', '')), '')::UUID;
        v_rule_cfop_override := NULLIF(TRIM(COALESCE(v_rule ->> 'cfop_override', '')), '');

        IF v_rule_cfop_config_id IS NOT NULL THEN
            SELECT
                config.id AS config_id,
                config.cfop_entry_id AS reference_id,
                config.cfop_version_id AS version_id,
                config.is_active,
                entry.code,
                entry.operation_direction
            INTO v_rule_cfop
            FROM public.fiscal_cfop_configs config
            INNER JOIN public.fiscal_cfop_entries entry ON entry.id = config.cfop_entry_id
            WHERE config.id = v_rule_cfop_config_id;

            IF v_rule_cfop.config_id IS NULL THEN
                RAISE EXCEPTION 'Rule CFOP config % not found', v_rule_cfop_config_id;
            END IF;

            IF COALESCE(v_rule_cfop.is_active, false) = false THEN
                RAISE EXCEPTION 'Rule CFOP config % is inactive', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            IF
                TRIM(v_rule ->> 'operation_direction') = 'outbound'
                AND COALESCE(v_rule_cfop.operation_direction, 'both') NOT IN ('outbound', 'both')
            THEN
                RAISE EXCEPTION 'Rule CFOP config % is not compatible with outbound operation', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            IF
                TRIM(v_rule ->> 'operation_direction') = 'inbound'
                AND COALESCE(v_rule_cfop.operation_direction, 'both') NOT IN ('inbound', 'both')
            THEN
                RAISE EXCEPTION 'Rule CFOP config % is not compatible with inbound operation', COALESCE(v_rule_cfop.code, v_rule_cfop_config_id::TEXT);
            END IF;

            v_rule_cfop_reference_id := v_rule_cfop.reference_id;
            v_rule_cfop_version_id := v_rule_cfop.version_id;
            v_rule_cfop_override := v_rule_cfop.code;
        END IF;

        v_rule_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_rule ->> 'id', '')), '') IS NOT NULL THEN
            BEGIN
                UPDATE public.product_tax_profile_rules rule_row
                   SET rule_name = TRIM(v_rule ->> 'rule_name'),
                       operation_direction = TRIM(v_rule ->> 'operation_direction'),
                       origin_uf = NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'origin_uf', ''))), ''),
                       destination_uf = NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'destination_uf', ''))), ''),
                       customer_type_id = NULLIF(TRIM(COALESCE(v_rule ->> 'customer_type_id', '')), '')::UUID,
                       person_type = NULLIF(TRIM(COALESCE(v_rule ->> 'person_type', '')), ''),
                       taxpayer_indicator = NULLIF(TRIM(COALESCE(v_rule ->> 'taxpayer_indicator', '')), ''),
                       cfop_override = v_rule_cfop_override,
                       cfop_config_id = v_rule_cfop_config_id,
                       cfop_reference_id = v_rule_cfop_reference_id,
                       cfop_version_id = v_rule_cfop_version_id,
                       priority = COALESCE(NULLIF(v_rule ->> 'priority', '')::INTEGER, 0),
                       is_active = COALESCE((v_rule ->> 'is_active')::BOOLEAN, true),
                       effective_from = NULLIF(v_rule ->> 'effective_from', '')::DATE,
                       effective_to = NULLIF(v_rule ->> 'effective_to', '')::DATE,
                       rule_payload_jsonb = COALESCE(v_rule -> 'rule_payload_jsonb', COALESCE(v_rule -> 'rule_payload', '{}'::JSONB)),
                       future_tax_payload = COALESCE(v_rule -> 'future_tax_payload', '{}'::JSONB),
                       version = rule_row.version + 1,
                       updated_by = v_actor,
                       updated_at = NOW()
                 WHERE rule_row.id = (v_rule ->> 'id')::UUID
                   AND rule_row.tax_profile_id = v_profile_id
                 RETURNING rule_row.id INTO v_rule_id;
            EXCEPTION WHEN invalid_text_representation THEN
                v_rule_id := NULL;
            END;
        END IF;

        IF v_rule_id IS NULL THEN
            INSERT INTO public.product_tax_profile_rules (
                tax_profile_id,
                rule_name,
                operation_direction,
                origin_uf,
                destination_uf,
                customer_type_id,
                person_type,
                taxpayer_indicator,
                cfop_override,
                cfop_config_id,
                cfop_reference_id,
                cfop_version_id,
                priority,
                is_active,
                effective_from,
                effective_to,
                rule_payload_jsonb,
                future_tax_payload,
                created_by,
                updated_by
            )
            VALUES (
                v_profile_id,
                TRIM(v_rule ->> 'rule_name'),
                TRIM(v_rule ->> 'operation_direction'),
                NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'origin_uf', ''))), ''),
                NULLIF(UPPER(TRIM(COALESCE(v_rule ->> 'destination_uf', ''))), ''),
                NULLIF(TRIM(COALESCE(v_rule ->> 'customer_type_id', '')), '')::UUID,
                NULLIF(TRIM(COALESCE(v_rule ->> 'person_type', '')), ''),
                NULLIF(TRIM(COALESCE(v_rule ->> 'taxpayer_indicator', '')), ''),
                v_rule_cfop_override,
                v_rule_cfop_config_id,
                v_rule_cfop_reference_id,
                v_rule_cfop_version_id,
                COALESCE(NULLIF(v_rule ->> 'priority', '')::INTEGER, 0),
                COALESCE((v_rule ->> 'is_active')::BOOLEAN, true),
                NULLIF(v_rule ->> 'effective_from', '')::DATE,
                NULLIF(v_rule ->> 'effective_to', '')::DATE,
                COALESCE(v_rule -> 'rule_payload_jsonb', COALESCE(v_rule -> 'rule_payload', '{}'::JSONB)),
                COALESCE(v_rule -> 'future_tax_payload', '{}'::JSONB),
                v_actor,
                v_actor
            )
            RETURNING id INTO v_rule_id;
        END IF;

        v_keep_rule_ids := array_append(v_keep_rule_ids, v_rule_id);
    END LOOP;

    DELETE FROM public.product_tax_profile_rules
     WHERE tax_profile_id = v_profile_id
       AND (
            array_length(v_keep_rule_ids, 1) IS NULL
            OR id <> ALL(v_keep_rule_ids)
       );

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
    UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, UUID, JSONB, JSONB
) TO authenticated, service_role;

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
        icms_base_id, ibscbs_base_id, ibscbs_version_id,
        default_output_cfop_config_id, default_input_cfop_config_id,
        fiscal_reference_snapshot_jsonb,
        created_by, updated_by
    )
    VALUES (
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '-COPIA'),
        v_source.description,
        v_source.ncm,
        v_source.cest,
        v_source.origin_code,
        v_source.commercial_unit,
        v_source.tax_unit,
        v_source.ean_gtin,
        v_source.tax_ean_gtin,
        v_source.default_fiscal_description,
        v_source.fiscal_type,
        v_source.item_type,
        v_source.has_substitution_tax,
        v_source.requires_cest,
        v_source.has_ipi,
        v_source.ipi_cst_out,
        v_source.ipi_enquadramento_codigo,
        v_source.pis_cst,
        v_source.cofins_cst,
        v_source.pis_aliquota,
        v_source.cofins_aliquota,
        v_source.default_output_cfop,
        v_source.default_input_cfop,
        v_source.internal_fiscal_code,
        v_source.default_fiscal_notes,
        false,
        v_source.requires_tax_configuration,
        COALESCE(v_source.future_tax_payload, '{}'::JSONB),
        COALESCE(v_source.metadata_jsonb, '{}'::JSONB),
        v_source.ncm_reference_id,
        v_source.ncm_version_id,
        v_source.tipi_reference_id,
        v_source.tipi_version_id,
        v_source.cest_reference_id,
        v_source.cest_version_id,
        v_source.default_output_cfop_reference_id,
        v_source.default_output_cfop_version_id,
        v_source.default_input_cfop_reference_id,
        v_source.default_input_cfop_version_id,
        v_source.icms_base_id,
        v_source.ibscbs_base_id,
        v_source.ibscbs_version_id,
        v_source.default_output_cfop_config_id,
        v_source.default_input_cfop_config_id,
        COALESCE(v_source.fiscal_reference_snapshot_jsonb, '{}'::JSONB),
        v_actor,
        v_actor
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.product_tax_profile_rules (
        tax_profile_id,
        rule_name,
        operation_direction,
        origin_uf,
        destination_uf,
        customer_type_id,
        person_type,
        taxpayer_indicator,
        cfop_override,
        cfop_config_id,
        cfop_reference_id,
        cfop_version_id,
        priority,
        is_active,
        effective_from,
        effective_to,
        rule_payload_jsonb,
        future_tax_payload,
        created_by,
        updated_by
    )
    SELECT
        v_new_id,
        rule_name,
        operation_direction,
        origin_uf,
        destination_uf,
        customer_type_id,
        person_type,
        taxpayer_indicator,
        cfop_override,
        cfop_config_id,
        cfop_reference_id,
        cfop_version_id,
        priority,
        is_active,
        effective_from,
        effective_to,
        rule_payload_jsonb,
        future_tax_payload,
        v_actor,
        v_actor
      FROM public.product_tax_profile_rules
     WHERE tax_profile_id = p_tax_profile_id;

    PERFORM public.persist_product_tax_profile_version(
        v_new_id,
        'duplicate',
        v_actor,
        'Duplicated from existing profile'
    );

    RETURN QUERY
    SELECT
        v_new_id,
        COALESCE(NULLIF(TRIM(COALESCE(p_new_name, '')), ''), v_source.name || ' (Copia)'),
        COALESCE(NULLIF(TRIM(COALESCE(p_new_code, '')), ''), v_source.code || '-COPIA');
END;
$$;
