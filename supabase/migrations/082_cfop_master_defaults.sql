-- Migration 082: CFOP master defaults and assisted autofill

CREATE TABLE IF NOT EXISTS public.fiscal_cfop_master_defaults (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cfop_code TEXT NOT NULL UNIQUE,
    default_description TEXT NOT NULL,
    inferred_direction TEXT NOT NULL,
    inferred_scope TEXT NOT NULL,
    operation_group TEXT NOT NULL,
    primary_context TEXT NOT NULL,
    default_general_description TEXT,
    default_note TEXT,
    properties_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    default_icms_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    default_ibscbs_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    default_piscofins_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    internal_notes TEXT,
    seed_version TEXT NOT NULL DEFAULT '2026.04',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata_jsonb JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_cfop_master_defaults_active_code
    ON public.fiscal_cfop_master_defaults(is_active, cfop_code);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_master_defaults_code_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_master_defaults
            ADD CONSTRAINT fiscal_cfop_master_defaults_code_check
            CHECK (cfop_code ~ '^\d{4}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_master_defaults_direction_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_master_defaults
            ADD CONSTRAINT fiscal_cfop_master_defaults_direction_check
            CHECK (inferred_direction IN ('outbound', 'inbound', 'both'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_master_defaults_scope_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_master_defaults
            ADD CONSTRAINT fiscal_cfop_master_defaults_scope_check
            CHECK (inferred_scope IN ('internal', 'interstate', 'external', 'all'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_master_defaults_operation_group_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_master_defaults
            ADD CONSTRAINT fiscal_cfop_master_defaults_operation_group_check
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
        SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_cfop_master_defaults_payload_check'
    ) THEN
        ALTER TABLE public.fiscal_cfop_master_defaults
            ADD CONSTRAINT fiscal_cfop_master_defaults_payload_check
            CHECK (
                jsonb_typeof(properties_jsonb) = 'object'
                AND jsonb_typeof(default_icms_config) = 'object'
                AND jsonb_typeof(default_ibscbs_config) = 'object'
                AND jsonb_typeof(default_piscofins_config) = 'object'
                AND jsonb_typeof(metadata_jsonb) = 'object'
            );
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_fiscal_cfop_master_defaults_updated_at ON public.fiscal_cfop_master_defaults;
CREATE TRIGGER update_fiscal_cfop_master_defaults_updated_at
    BEFORE UPDATE ON public.fiscal_cfop_master_defaults
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH seed (
    cfop_code,
    default_description,
    operation_group,
    primary_context,
    default_general_description,
    default_note,
    properties_jsonb,
    default_icms_config,
    default_ibscbs_config,
    default_piscofins_config,
    internal_notes
) AS (
    VALUES
        ('5101', 'Venda de producao do estabelecimento', 'sale_own_manufacture', 'sale_industrial', 'Saida de venda de producao propria em operacao interna.', NULL, '{"appliesToOwnManufacture":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001","regularCstCode":"000","regularClassificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Default conservador para venda regular de producao propria.'),
        ('6101', 'Venda de producao do estabelecimento', 'sale_own_manufacture', 'sale_industrial', 'Saida de venda de producao propria em operacao interestadual.', NULL, '{"appliesToOwnManufacture":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001","regularCstCode":"000","regularClassificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Default conservador para venda regular interestadual de producao propria.'),
        ('5102', 'Venda de mercadoria adquirida ou recebida de terceiros', 'sale_resale', 'sale_commercial', 'Saida de venda de mercadoria adquirida de terceiros em operacao interna.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001","regularCstCode":"000","regularClassificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Default conservador para venda comercial tributada.'),
        ('6102', 'Venda de mercadoria adquirida ou recebida de terceiros', 'sale_resale', 'sale_commercial', 'Saida de venda de mercadoria adquirida de terceiros em operacao interestadual.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001","regularCstCode":"000","regularClassificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Default conservador para venda comercial interestadual.'),
        ('5401', 'Venda de producao do estabelecimento sujeita a substituicao tributaria', 'sale_own_manufacture', 'sale_st_substitute', 'Saida de producao propria com destaque de substituicao tributaria.', NULL, '{"appliesToOwnManufacture":true,"supportsSt":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true,"highlightStOnInvoice":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Semente assistiva para venda com ST na condicao de substituto.'),
        ('6401', 'Venda de producao do estabelecimento sujeita a substituicao tributaria', 'sale_own_manufacture', 'sale_st_substitute', 'Saida interestadual de producao propria com destaque de substituicao tributaria.', NULL, '{"appliesToOwnManufacture":true,"supportsSt":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true,"highlightStOnInvoice":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Semente assistiva para venda interestadual com ST na condicao de substituto.'),
        ('5403', 'Venda de mercadoria adquirida ou recebida de terceiros sujeita a substituicao tributaria', 'sale_resale', 'sale_st_substitute', 'Saida de mercadoria de terceiros com destaque de substituicao tributaria.', NULL, '{"appliesToResale":true,"supportsSt":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true,"highlightStOnInvoice":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Semente assistiva para revenda com destaque de ST.'),
        ('6403', 'Venda de mercadoria adquirida ou recebida de terceiros sujeita a substituicao tributaria', 'sale_resale', 'sale_st_substitute', 'Saida interestadual de mercadoria de terceiros com destaque de substituicao tributaria.', NULL, '{"appliesToResale":true,"supportsSt":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true,"highlightStOnInvoice":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Semente assistiva para revenda interestadual com destaque de ST.'),
        ('5405', 'Venda de mercadoria adquirida ou recebida de terceiros com substituicao tributaria recolhida anteriormente', 'sale_resale', 'sale_st_precollected', 'Saida de mercadoria de terceiros com ST recolhida anteriormente.', NULL, '{"appliesToResale":true,"supportsSt":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":false,"stCollectedPreviously":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Default seguro para cenarios em que o ICMS proprio costuma nao ser destacado por ja haver ST recolhida.'),
        ('5116', 'Venda de producao do estabelecimento originada de encomenda para entrega futura', 'sale_own_manufacture', 'sale_future_delivery', 'Saida vinculada a venda de producao propria com entrega futura.', NULL, '{"appliesToOwnManufacture":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Operacao com entrega futura; revisar particularidades documentais da operacao real.'),
        ('6116', 'Venda de producao do estabelecimento originada de encomenda para entrega futura', 'sale_own_manufacture', 'sale_future_delivery', 'Saida interestadual vinculada a venda de producao propria com entrega futura.', NULL, '{"appliesToOwnManufacture":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Operacao com entrega futura; revisar particularidades documentais da operacao real.'),
        ('5117', 'Venda de mercadoria adquirida ou recebida de terceiros originada de encomenda para entrega futura', 'sale_resale', 'sale_future_delivery', 'Saida vinculada a venda de mercadoria de terceiros com entrega futura.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Operacao com entrega futura; revisar particularidades documentais da operacao real.'),
        ('6117', 'Venda de mercadoria adquirida ou recebida de terceiros originada de encomenda para entrega futura', 'sale_resale', 'sale_future_delivery', 'Saida interestadual vinculada a venda de mercadoria de terceiros com entrega futura.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"01","cofinsCstCode":"01"}'::jsonb, 'Operacao com entrega futura; revisar particularidades documentais da operacao real.'),
        ('1101', 'Compra para industrializacao ou producao rural', 'purchase_input', 'purchase_input', 'Entrada destinada a insumo ou industrializacao.', NULL, '{"appliesToOwnManufacture":true,"isRecommended":true,"requiresPiscofinsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{}'::jsonb, 'Default assistivo para entrada de insumo; CST de PIS/COFINS depende do regime de creditamento adotado.'),
        ('2101', 'Compra para industrializacao ou producao rural', 'purchase_input', 'purchase_input', 'Entrada interestadual destinada a insumo ou industrializacao.', NULL, '{"appliesToOwnManufacture":true,"isRecommended":true,"requiresPiscofinsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{}'::jsonb, 'Default assistivo para entrada interestadual de insumo; CST de PIS/COFINS depende do regime de creditamento adotado.'),
        ('1102', 'Compra para comercializacao', 'purchase_resale', 'purchase_resale', 'Entrada de mercadoria para revenda em operacao interna.', NULL, '{"appliesToResale":true,"isRecommended":true,"requiresPiscofinsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{}'::jsonb, 'Default assistivo para entrada de mercadoria para revenda; CST de PIS/COFINS pode variar pelo regime.'),
        ('2102', 'Compra para comercializacao', 'purchase_resale', 'purchase_resale', 'Entrada interestadual de mercadoria para revenda.', NULL, '{"appliesToResale":true,"isRecommended":true,"requiresPiscofinsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{}'::jsonb, 'Default assistivo para entrada interestadual de mercadoria para revenda; CST de PIS/COFINS pode variar pelo regime.'),
        ('1401', 'Compra para industrializacao com mercadoria sujeita a substituicao tributaria', 'purchase_input', 'purchase_input_st', 'Entrada para industrializacao com ST recolhida na etapa anterior.', NULL, '{"appliesToOwnManufacture":true,"supportsSt":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":false,"stCollectedPreviously":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default seguro para entrada com ST ja recolhida.'),
        ('2401', 'Compra para industrializacao com mercadoria sujeita a substituicao tributaria', 'purchase_input', 'purchase_input_st', 'Entrada interestadual para industrializacao com ST recolhida na etapa anterior.', NULL, '{"appliesToOwnManufacture":true,"supportsSt":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":false,"stCollectedPreviously":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default seguro para entrada interestadual com ST ja recolhida.'),
        ('1403', 'Compra para comercializacao com mercadoria sujeita a substituicao tributaria', 'purchase_resale', 'purchase_resale_st', 'Entrada de mercadoria para revenda com ST recolhida anteriormente.', NULL, '{"appliesToResale":true,"supportsSt":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":false,"stCollectedPreviously":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default seguro para entrada de mercadoria para revenda com ST recolhida anteriormente.'),
        ('2403', 'Compra para comercializacao com mercadoria sujeita a substituicao tributaria', 'purchase_resale', 'purchase_resale_st', 'Entrada interestadual de mercadoria para revenda com ST recolhida anteriormente.', NULL, '{"appliesToResale":true,"supportsSt":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":false,"stCollectedPreviously":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default seguro para entrada interestadual de mercadoria para revenda com ST recolhida anteriormente.'),
        ('1556', 'Compra de material para uso ou consumo', 'other', 'purchase_consumption', 'Entrada de material para uso ou consumo.', NULL, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para uso e consumo; revisar creditos conforme regime aplicavel.'),
        ('2556', 'Compra de material para uso ou consumo', 'other', 'purchase_consumption', 'Entrada interestadual de material para uso ou consumo.', NULL, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para uso e consumo; revisar creditos conforme regime aplicavel.'),
        ('1551', 'Compra de bem para o ativo imobilizado', 'other', 'purchase_fixed_asset', 'Entrada de bem destinado ao ativo imobilizado.', NULL, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para ativo imobilizado; revisar creditos conforme regime aplicavel.'),
        ('2551', 'Compra de bem para o ativo imobilizado', 'other', 'purchase_fixed_asset', 'Entrada interestadual de bem destinado ao ativo imobilizado.', NULL, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para ativo imobilizado; revisar creditos conforme regime aplicavel.'),
        ('1201', 'Devolucao de venda de producao do estabelecimento', 'return', 'return_inbound', 'Entrada de devolucao referente a venda de producao propria.', NULL, '{"appliesToOwnManufacture":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao de venda; revisar reflexos documentais e creditos conforme a operacao original.'),
        ('2201', 'Devolucao de venda de producao do estabelecimento', 'return', 'return_inbound', 'Entrada interestadual de devolucao referente a venda de producao propria.', NULL, '{"appliesToOwnManufacture":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao interestadual de venda.'),
        ('1202', 'Devolucao de venda de mercadoria adquirida ou recebida de terceiros', 'return', 'return_inbound', 'Entrada de devolucao referente a venda de mercadoria de terceiros.', NULL, '{"appliesToResale":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao de venda de mercadoria de terceiros.'),
        ('2202', 'Devolucao de venda de mercadoria adquirida ou recebida de terceiros', 'return', 'return_inbound', 'Entrada interestadual de devolucao referente a venda de mercadoria de terceiros.', NULL, '{"appliesToResale":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao interestadual de venda de mercadoria de terceiros.'),
        ('5201', 'Devolucao de compra para industrializacao ou producao rural', 'return', 'return_outbound', 'Saida de devolucao referente a compra para industrializacao.', NULL, '{"appliesToOwnManufacture":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao de compra.'),
        ('6201', 'Devolucao de compra para industrializacao ou producao rural', 'return', 'return_outbound', 'Saida interestadual de devolucao referente a compra para industrializacao.', NULL, '{"appliesToOwnManufacture":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao interestadual de compra.'),
        ('5202', 'Devolucao de compra para comercializacao', 'return', 'return_outbound', 'Saida de devolucao referente a compra para comercializacao.', NULL, '{"appliesToResale":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao de compra para comercializacao.'),
        ('6202', 'Devolucao de compra para comercializacao', 'return', 'return_outbound', 'Saida interestadual de devolucao referente a compra para comercializacao.', NULL, '{"appliesToResale":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para devolucao interestadual de compra para comercializacao.'),
        ('5556', 'Devolucao de compra de material de uso ou consumo', 'return', 'return_outbound', 'Saida de devolucao referente a compra para uso ou consumo.', NULL, '{"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para devolucao de uso ou consumo.'),
        ('6556', 'Devolucao de compra de material de uso ou consumo', 'return', 'return_outbound', 'Saida interestadual de devolucao referente a compra para uso ou consumo.', NULL, '{"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default conservador para devolucao interestadual de uso ou consumo.'),
        ('5915', 'Remessa de mercadoria ou bem para conserto ou reparo', 'other', 'remittance_repair', 'Saida de remessa para conserto ou reparo, sem automatismo tributario completo.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar destaque de tributos conforme o caso concreto.'),
        ('6915', 'Remessa de mercadoria ou bem para conserto ou reparo', 'other', 'remittance_repair', 'Saida interestadual de remessa para conserto ou reparo, sem automatismo tributario completo.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar destaque de tributos conforme o caso concreto.'),
        ('1916', 'Retorno de mercadoria ou bem remetido para conserto ou reparo', 'return', 'return_repair', 'Entrada de retorno de conserto ou reparo.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao de retorno; revisar reflexos fiscais conforme o documento de origem.'),
        ('2916', 'Retorno de mercadoria ou bem remetido para conserto ou reparo', 'return', 'return_repair', 'Entrada interestadual de retorno de conserto ou reparo.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao de retorno; revisar reflexos fiscais conforme o documento de origem.'),
        ('5910', 'Remessa em bonificacao, doacao ou brinde', 'other', 'remittance_bonus', 'Saida de bonificacao, doacao ou brinde com default assistivo e revisao fiscal obrigatoria.', NULL, '{"sumOperationTotalInvoice":true,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"49","cofinsCstCode":"49"}'::jsonb, 'Default assistivo para saidas nao financeiras com possivel incidencia diferenciada.'),
        ('6910', 'Remessa em bonificacao, doacao ou brinde', 'other', 'remittance_bonus', 'Saida interestadual de bonificacao, doacao ou brinde com default assistivo e revisao fiscal obrigatoria.', NULL, '{"sumOperationTotalInvoice":true,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{"pisCstCode":"49","cofinsCstCode":"49"}'::jsonb, 'Default assistivo para saidas nao financeiras com possivel incidencia diferenciada.'),
        ('5912', 'Remessa de mercadoria ou bem para demonstracao', 'other', 'remittance_demo', 'Saida para demonstracao sem preenchimento automatico de blocos avancados.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar tributacao da operacao concreta.'),
        ('6912', 'Remessa de mercadoria ou bem para demonstracao', 'other', 'remittance_demo', 'Saida interestadual para demonstracao sem preenchimento automatico de blocos avancados.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar tributacao da operacao concreta.'),
        ('5914', 'Remessa de mercadoria ou bem para exposicao ou feira', 'other', 'remittance_fair', 'Saida para exposicao ou feira com controle operacional do bem remetido.', NULL, '{"appliesOutsideEstablishment":true,"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar tributacao e retorno.'),
        ('6914', 'Remessa de mercadoria ou bem para exposicao ou feira', 'other', 'remittance_fair', 'Saida interestadual para exposicao ou feira com controle operacional do bem remetido.', NULL, '{"appliesOutsideEstablishment":true,"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacao tipicamente nao financeira; revisar tributacao e retorno.'),
        ('5911', 'Remessa de amostra gratis', 'other', 'remittance_sample', 'Saida de amostra gratis com revisao fiscal obrigatoria conforme o produto e a operacao.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"pisCstCode":"49","cofinsCstCode":"49"}'::jsonb, 'Default assistivo; a incidencia efetiva pode variar conforme o contexto e o beneficio fiscal.'),
        ('6911', 'Remessa de amostra gratis', 'other', 'remittance_sample', 'Saida interestadual de amostra gratis com revisao fiscal obrigatoria conforme o produto e a operacao.', NULL, '{"sumOperationTotalInvoice":false,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"pisCstCode":"49","cofinsCstCode":"49"}'::jsonb, 'Default assistivo; a incidencia efetiva pode variar conforme o contexto e o beneficio fiscal.'),
        ('5152', 'Transferencia de mercadoria adquirida ou recebida de terceiros', 'transfer', 'transfer_resale', 'Saida de transferencia de mercadoria adquirida de terceiros.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":false}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para transferencia interna de mercadoria de terceiros.'),
        ('6152', 'Transferencia de mercadoria adquirida ou recebida de terceiros', 'transfer', 'transfer_resale', 'Saida interestadual de transferencia de mercadoria adquirida de terceiros.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":false}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Default assistivo para transferencia interestadual de mercadoria de terceiros.'),
        ('5352', 'Prestacao de servico de transporte', 'service', 'transport_service', 'Saida de prestacao de servico com configuracao minima assistida.', NULL, '{"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Servico/transportes exigem revisao fiscal especifica do modelo documental e da incidencia efetiva.'),
        ('6352', 'Prestacao de servico de transporte', 'service', 'transport_service', 'Saida interestadual de prestacao de servico com configuracao minima assistida.', NULL, '{"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Servico/transportes exigem revisao fiscal especifica do modelo documental e da incidencia efetiva.'),
        ('5301', 'Prestacao de servico de comunicacao', 'service', 'communication_service', 'Saida de servico com configuracao minima assistida.', NULL, '{"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Servico/comunicacao exigem revisao fiscal especifica do modelo documental e da incidencia efetiva.'),
        ('6301', 'Prestacao de servico de comunicacao', 'service', 'communication_service', 'Saida interestadual de servico com configuracao minima assistida.', NULL, '{"sumOperationTotalInvoice":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Servico/comunicacao exigem revisao fiscal especifica do modelo documental e da incidencia efetiva.'),
        ('1352', 'Aquisicao de servico de transporte', 'service', 'transport_service_input', 'Entrada de servico de transporte com configuracao minima assistida.', NULL, '{}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Entrada de servico exige revisao fiscal especifica do modelo documental e dos creditos.'),
        ('2352', 'Aquisicao de servico de transporte', 'service', 'transport_service_input', 'Entrada interestadual de servico de transporte com configuracao minima assistida.', NULL, '{}'::jsonb, '{"calculateIcms":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Entrada de servico exige revisao fiscal especifica do modelo documental e dos creditos.'),
        ('3102', 'Compra para comercializacao do exterior', 'purchase_resale', 'purchase_import_resale', 'Entrada do exterior destinada a comercializacao.', NULL, '{"appliesToResale":true,"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{"calculateIcms":true}'::jsonb, '{"enabled":true,"cstCode":"000","classificationCode":"000001"}'::jsonb, '{}'::jsonb, 'Operacoes com exterior exigem revisao documental e aduaneira adicional.'),
        ('3551', 'Compra de bem para o ativo imobilizado do exterior', 'other', 'purchase_import_fixed_asset', 'Entrada do exterior destinada ao ativo imobilizado.', NULL, '{"requiresIcmsReview":true,"requiresPiscofinsReview":true,"requiresIbscbsReview":true}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Operacoes com exterior exigem revisao documental e aduaneira adicional.'),
        ('7101', 'Venda de producao do estabelecimento para o exterior', 'sale_own_manufacture', 'sale_export', 'Saida para exportacao de producao propria.', NULL, '{"appliesToOwnManufacture":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":false}'::jsonb, '{"enabled":true,"cstCode":"410","classificationCode":"410001"}'::jsonb, '{"pisCstCode":"08","cofinsCstCode":"08"}'::jsonb, 'Default assistivo para exportacao; revisar beneficios, nao incidencia e documentacao complementar.'),
        ('7102', 'Venda de mercadoria adquirida ou recebida de terceiros para o exterior', 'sale_resale', 'sale_export', 'Saida para exportacao de mercadoria adquirida de terceiros.', NULL, '{"appliesToResale":true,"sumOperationTotalInvoice":true,"isRecommended":true}'::jsonb, '{"calculateIcms":false}'::jsonb, '{"enabled":true,"cstCode":"410","classificationCode":"410001"}'::jsonb, '{"pisCstCode":"08","cofinsCstCode":"08"}'::jsonb, 'Default assistivo para exportacao; revisar beneficios, nao incidencia e documentacao complementar.')
)
INSERT INTO public.fiscal_cfop_master_defaults (
    cfop_code,
    default_description,
    inferred_direction,
    inferred_scope,
    operation_group,
    primary_context,
    default_general_description,
    default_note,
    properties_jsonb,
    default_icms_config,
    default_ibscbs_config,
    default_piscofins_config,
    internal_notes,
    seed_version,
    is_active,
    metadata_jsonb
)
SELECT
    seed.cfop_code,
    seed.default_description,
    CASE
        WHEN LEFT(seed.cfop_code, 1) IN ('1', '2', '3') THEN 'inbound'
        WHEN LEFT(seed.cfop_code, 1) IN ('5', '6', '7') THEN 'outbound'
        ELSE 'both'
    END,
    CASE
        WHEN LEFT(seed.cfop_code, 1) IN ('1', '5') THEN 'internal'
        WHEN LEFT(seed.cfop_code, 1) IN ('2', '6') THEN 'interstate'
        WHEN LEFT(seed.cfop_code, 1) IN ('3', '7') THEN 'external'
        ELSE 'all'
    END,
    seed.operation_group,
    seed.primary_context,
    seed.default_general_description,
    seed.default_note,
    COALESCE(seed.properties_jsonb, '{}'::JSONB),
    COALESCE(seed.default_icms_config, '{}'::JSONB),
    COALESCE(seed.default_ibscbs_config, '{}'::JSONB),
    COALESCE(seed.default_piscofins_config, '{}'::JSONB),
    seed.internal_notes,
    '2026.04',
    true,
    jsonb_build_object('source_type', 'seed', 'seed_name', 'cfop-master-defaults', 'governance', 'assisted-autofill')
FROM seed
ON CONFLICT (cfop_code) DO UPDATE
SET default_description = EXCLUDED.default_description,
    inferred_direction = EXCLUDED.inferred_direction,
    inferred_scope = EXCLUDED.inferred_scope,
    operation_group = EXCLUDED.operation_group,
    primary_context = EXCLUDED.primary_context,
    default_general_description = EXCLUDED.default_general_description,
    default_note = EXCLUDED.default_note,
    properties_jsonb = EXCLUDED.properties_jsonb,
    default_icms_config = EXCLUDED.default_icms_config,
    default_ibscbs_config = EXCLUDED.default_ibscbs_config,
    default_piscofins_config = EXCLUDED.default_piscofins_config,
    internal_notes = EXCLUDED.internal_notes,
    seed_version = EXCLUDED.seed_version,
    is_active = EXCLUDED.is_active,
    metadata_jsonb = EXCLUDED.metadata_jsonb,
    updated_at = NOW();
