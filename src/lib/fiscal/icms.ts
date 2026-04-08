export const BRAZIL_UF_OPTIONS = [
    { value: 'AC', label: 'Acre' },
    { value: 'AL', label: 'Alagoas' },
    { value: 'AP', label: 'Amapa' },
    { value: 'AM', label: 'Amazonas' },
    { value: 'BA', label: 'Bahia' },
    { value: 'CE', label: 'Ceara' },
    { value: 'DF', label: 'Distrito Federal' },
    { value: 'ES', label: 'Espirito Santo' },
    { value: 'GO', label: 'Goias' },
    { value: 'MA', label: 'Maranhao' },
    { value: 'MT', label: 'Mato Grosso' },
    { value: 'MS', label: 'Mato Grosso do Sul' },
    { value: 'MG', label: 'Minas Gerais' },
    { value: 'PA', label: 'Para' },
    { value: 'PB', label: 'Paraiba' },
    { value: 'PR', label: 'Parana' },
    { value: 'PE', label: 'Pernambuco' },
    { value: 'PI', label: 'Piaui' },
    { value: 'RJ', label: 'Rio de Janeiro' },
    { value: 'RN', label: 'Rio Grande do Norte' },
    { value: 'RS', label: 'Rio Grande do Sul' },
    { value: 'RO', label: 'Rondonia' },
    { value: 'RR', label: 'Roraima' },
    { value: 'SC', label: 'Santa Catarina' },
    { value: 'SP', label: 'Sao Paulo' },
    { value: 'SE', label: 'Sergipe' },
    { value: 'TO', label: 'Tocantins' },
] as const

export const ICMS_BASE_CALC_TYPES = [
    {
        value: 'operation_value',
        label: 'Valor da operacao',
        description: 'Usa o valor da operacao como base padrao do ICMS.',
    },
    {
        value: 'operation_value_with_additions',
        label: 'Valor da operacao com adicionais',
        description: 'Considera valor da operacao com frete, seguro e outras despesas acessorias.',
    },
    {
        value: 'fixed_percent',
        label: 'Percentual parametrizado',
        description: 'Permite registrar um percentual da base para cenarios controlados internamente.',
    },
    {
        value: 'other',
        label: 'Outra regra',
        description: 'Reserva estrutural para evolucao futura da base de calculo.',
    },
] as const

export const ICMS_ST_BASE_CALC_TYPES = [
    {
        value: 'mva',
        label: 'MVA / margem de valor agregado',
        description: 'Estrutura ST baseada em MVA original ou ajustada.',
    },
    {
        value: 'suggested_price',
        label: 'Preco sugerido ou tabela',
        description: 'Preparado para cenarios em que a base ST venha de tabela ou preco sugerido.',
    },
    {
        value: 'fixed_percent',
        label: 'Percentual parametrizado',
        description: 'Permite registrar uma base ST percentual para usos futuros controlados.',
    },
    {
        value: 'other',
        label: 'Outra regra ST',
        description: 'Reserva para evolucao futura da parametrizacao de ST.',
    },
] as const

export const ICMS_INTERSTATE_CONSUMER_FINAL_MODES = [
    {
        value: 'standard',
        label: 'Padrao',
        description: 'Mantem a regra interestadual padrao sem diferenciacao extra por consumidor final.',
    },
    {
        value: 'consumer_final_specific',
        label: 'Consumidor final diferenciado',
        description: 'Sinaliza preparacao para tratamento dedicado de operacoes com consumidor final.',
    },
] as const

export type IcmsBaseCalcType = (typeof ICMS_BASE_CALC_TYPES)[number]['value']
export type IcmsStBaseCalcType = (typeof ICMS_ST_BASE_CALC_TYPES)[number]['value']
export type IcmsInterstateConsumerFinalMode = (typeof ICMS_INTERSTATE_CONSUMER_FINAL_MODES)[number]['value']

export function isBrazilUf(value?: string | null): value is (typeof BRAZIL_UF_OPTIONS)[number]['value'] {
    return BRAZIL_UF_OPTIONS.some((item) => item.value === value)
}

export function isIcmsBaseCalcType(value?: string | null): value is IcmsBaseCalcType {
    return ICMS_BASE_CALC_TYPES.some((item) => item.value === value)
}

export function isIcmsStBaseCalcType(value?: string | null): value is IcmsStBaseCalcType {
    return ICMS_ST_BASE_CALC_TYPES.some((item) => item.value === value)
}

export function isIcmsInterstateConsumerFinalMode(
    value?: string | null
): value is IcmsInterstateConsumerFinalMode {
    return ICMS_INTERSTATE_CONSUMER_FINAL_MODES.some((item) => item.value === value)
}
