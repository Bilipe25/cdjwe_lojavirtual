export const IBSCBS_CST_CODES = [
    '000',
    '200',
    '410',
    '510',
    '515',
    '550',
    '620',
] as const

export type IbscbsCstCode = (typeof IBSCBS_CST_CODES)[number]

export const IBSCBS_VERSION_STATUSES = ['draft', 'active', 'superseded', 'inactive'] as const

export type IbscbsVersionStatus = (typeof IBSCBS_VERSION_STATUSES)[number]

export function isIbscbsCstCode(value?: string | null): value is IbscbsCstCode {
    return IBSCBS_CST_CODES.includes(String(value || '') as IbscbsCstCode)
}

export function isIbscbsVersionStatus(value?: string | null): value is IbscbsVersionStatus {
    return IBSCBS_VERSION_STATUSES.includes(String(value || '') as IbscbsVersionStatus)
}
