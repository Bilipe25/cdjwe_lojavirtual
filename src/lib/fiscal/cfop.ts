export const CFOP_OPERATION_GROUP_OPTIONS = [
    {
        value: 'sale_own_manufacture',
        label: 'Venda de produção própria',
        description: 'Operações de saída ligadas à produção própria do estabelecimento.',
    },
    {
        value: 'sale_resale',
        label: 'Venda de mercadoria de terceiros',
        description: 'Operações de saída ligadas à revenda de mercadorias adquiridas de terceiros.',
    },
    {
        value: 'purchase_input',
        label: 'Entrada para insumo / industrialização',
        description: 'Entradas ligadas a compras para industrialização, insumo ou transformação.',
    },
    {
        value: 'purchase_resale',
        label: 'Entrada para revenda',
        description: 'Entradas destinadas à formação de estoque de revenda.',
    },
    {
        value: 'transfer',
        label: 'Transferência',
        description: 'Movimentações entre estabelecimentos do mesmo titular ou contexto equivalente.',
    },
    {
        value: 'return',
        label: 'Devolução / retorno',
        description: 'Fluxos de devolução, retorno simbólico ou retorno de mercadoria.',
    },
    {
        value: 'service',
        label: 'Prestação de serviço',
        description: 'Operações de serviço ou combinações produto + serviço.',
    },
    {
        value: 'other',
        label: 'Outras operações',
        description: 'Reserva para contextos que não se encaixam nas categorias operacionais principais.',
    },
] as const

export const CFOP_OPERATION_SCOPE_OPTIONS = [
    {
        value: 'internal',
        label: 'Operação interna',
        description: 'Uso preferencial para operações dentro da mesma UF.',
    },
    {
        value: 'interstate',
        label: 'Operação interestadual',
        description: 'Uso preferencial para operações entre UFs distintas.',
    },
    {
        value: 'external',
        label: 'Exterior',
        description: 'Uso preferencial para operações de importação ou exportação.',
    },
    {
        value: 'all',
        label: 'Sem restrição operacional',
        description: 'Mantém a configuração aberta, útil quando o contexto fiscal ainda será refinado por outras camadas.',
    },
] as const

export const CFOP_CONFIGURATION_STATUS_OPTIONS = [
    {
        value: 'pending',
        label: 'Pendente',
        description: 'Item oficial ainda sem configuração contextual interna.',
    },
    {
        value: 'partial',
        label: 'Parcial',
        description: 'Configuração iniciada, mas ainda sem todos os blocos tributários esperados.',
    },
    {
        value: 'ready',
        label: 'Pronto',
        description: 'Configuração madura para seleção contextual e uso administrativo.',
    },
    {
        value: 'legacy',
        label: 'Legado',
        description: 'Configuração preservada apenas para histórico ou compatibilidade.',
    },
] as const

export type CfopOperationGroup = (typeof CFOP_OPERATION_GROUP_OPTIONS)[number]['value']
export type CfopOperationScope = (typeof CFOP_OPERATION_SCOPE_OPTIONS)[number]['value']
export type CfopConfigurationStatus = (typeof CFOP_CONFIGURATION_STATUS_OPTIONS)[number]['value']

export function isCfopOperationGroup(value?: string | null): value is CfopOperationGroup {
    return CFOP_OPERATION_GROUP_OPTIONS.some((item) => item.value === value)
}

export function isCfopOperationScope(value?: string | null): value is CfopOperationScope {
    return CFOP_OPERATION_SCOPE_OPTIONS.some((item) => item.value === value)
}

export function isCfopConfigurationStatus(value?: string | null): value is CfopConfigurationStatus {
    return CFOP_CONFIGURATION_STATUS_OPTIONS.some((item) => item.value === value)
}

export function inferCfopScopeFromCode(code?: string | null): CfopOperationScope {
    const digits = String(code || '').replace(/\D/g, '')
    const family = digits.slice(0, 1)

    if (family === '1' || family === '5') return 'internal'
    if (family === '2' || family === '6') return 'interstate'
    if (family === '3' || family === '7') return 'external'
    return 'all'
}

export function getCfopOperationGroupLabel(value?: string | null) {
    return CFOP_OPERATION_GROUP_OPTIONS.find((item) => item.value === value)?.label || 'Sem grupo'
}

export function getCfopOperationScopeLabel(value?: string | null) {
    return CFOP_OPERATION_SCOPE_OPTIONS.find((item) => item.value === value)?.label || 'Sem restrição operacional'
}

export function getCfopConfigurationStatusLabel(value?: string | null) {
    return CFOP_CONFIGURATION_STATUS_OPTIONS.find((item) => item.value === value)?.label || 'Pendente'
}
