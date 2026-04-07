export const FISCAL_BASE_TYPES = ['ncm', 'tipi', 'cest', 'cfop'] as const

export type FiscalBaseType = (typeof FISCAL_BASE_TYPES)[number]

export const FISCAL_IMPORT_SOURCE_TYPES = ['csv', 'xlsx'] as const

export type FiscalImportSourceType = (typeof FISCAL_IMPORT_SOURCE_TYPES)[number]

export const FISCAL_BASE_LABELS: Record<FiscalBaseType, string> = {
    ncm: 'NCM',
    tipi: 'TIPI / IPI',
    cest: 'CEST',
    cfop: 'CFOP',
}

export interface FiscalSourceGuideItem {
    tableType: FiscalBaseType
    title: string
    subtitle: string
    officialLabel: string
    officialUrl: string
    secondaryLabel?: string
    secondaryUrl?: string
    formatHint: string
    importHint: string
    note: string
}

export const FISCAL_SOURCE_GUIDE: FiscalSourceGuideItem[] = [
    {
        tableType: 'ncm',
        title: 'NCM',
        subtitle: 'Nomenclatura Comum do Mercosul',
        officialLabel: 'Receita Federal - Sistema Classif',
        officialUrl:
            'https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/classif',
        secondaryLabel: 'Receita Federal - Página NCM',
        secondaryUrl:
            'https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/ncm',
        formatHint: 'O Classif disponibiliza consulta oficial e download da tabela NCM em JSON e XLSX.',
        importHint: 'Preferir exportação estruturada do Classif e normalizar para o layout CSV do sistema antes de importar.',
        note: 'Use a versão vigente da NCM e confirme a data de atualização antes de gerar uma nova versão interna.',
    },
    {
        tableType: 'tipi',
        title: 'TIPI / IPI',
        subtitle: 'Tabela de Incidência do IPI',
        officialLabel: 'Receita Federal - TIPI',
        officialUrl:
            'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/tipi-tabela-de-incidencia-do-imposto-sobre-produtos-industrializados',
        secondaryLabel: 'Receita Federal - TIPI XLSX',
        secondaryUrl:
            'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.xlsx/view',
        formatHint: 'A Receita publica a TIPI em PDF, DOCX e XLSX.',
        importHint: 'Para a base interna, o XLSX costuma ser o melhor ponto de partida para converter em CSV.',
        note: 'Revise vigência, atos declaratórios executivos e atualizações do decreto antes de substituir a versão ativa.',
    },
    {
        tableType: 'cest',
        title: 'CEST',
        subtitle: 'Código Especificador da Substituição Tributária',
        officialLabel: 'CONFAZ - Substituição Tributária',
        officialUrl: 'https://www.confaz.fazenda.gov.br/legislacao/substituicao-tributaria',
        formatHint: 'O CONFAZ concentra a base normativa do CEST e o Portal Nacional da Substituição Tributária.',
        importHint: 'Normalmente será necessário transformar a tabela normativa em CSV estruturado antes da importação.',
        note: 'Valide a correspondência entre CEST e NCM na vigência atual do Convênio ICMS aplicável.',
    },
    {
        tableType: 'cfop',
        title: 'CFOP',
        subtitle: 'Código Fiscal de Operações e Prestações',
        officialLabel: 'CONFAZ - CFOP vigente',
        officialUrl: 'https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn_1-6.24',
        secondaryLabel: 'CONFAZ - Histórico / vigências anteriores',
        secondaryUrl: 'https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/cfop_cvsn70_vigente_01-06-22_31-03.24',
        formatHint: 'O CFOP costuma ser mantido como anexo normativo vigente no portal do CONFAZ.',
        importHint: 'Monte CSV interno a partir da vigência correta do anexo e preserve direção de entrada/saída na conversão.',
        note: 'Como a publicação é normativa, confirme sempre a vigência atual antes de importar ou ativar uma nova versão.',
    },
]

export const FISCAL_CATALOG_TYPES = [
    'origin',
    'commercial_unit',
    'tax_unit',
    'pis_cst',
    'cofins_cst',
    'ipi_cst',
    'taxpayer_indicator',
    'person_type',
    'item_type',
    'fiscal_type',
] as const

export type FiscalCatalogType = (typeof FISCAL_CATALOG_TYPES)[number]

export const FISCAL_CATALOG_LABELS: Record<FiscalCatalogType, string> = {
    origin: 'Origem da Mercadoria',
    commercial_unit: 'Unidade Comercial',
    tax_unit: 'Unidade Tributável',
    pis_cst: 'PIS CST',
    cofins_cst: 'COFINS CST',
    ipi_cst: 'IPI CST',
    taxpayer_indicator: 'Indicador de Contribuinte',
    person_type: 'Tipo de Pessoa',
    item_type: 'Tipo de Item',
    fiscal_type: 'Tipo Fiscal',
}

export function isFiscalBaseType(value: string): value is FiscalBaseType {
    return (FISCAL_BASE_TYPES as readonly string[]).includes(value)
}

export function isFiscalImportSourceType(value: string): value is FiscalImportSourceType {
    return (FISCAL_IMPORT_SOURCE_TYPES as readonly string[]).includes(value)
}

export function isFiscalCatalogType(value: string): value is FiscalCatalogType {
    return (FISCAL_CATALOG_TYPES as readonly string[]).includes(value)
}
