export function normalizeEmail(email?: string | null) {
    return (email || '').trim().toLowerCase()
}

export function normalizeCnpj(cnpj?: string | null) {
    return (cnpj || '').replace(/\D/g, '')
}

export function isCnpjIdentifier(identifier?: string | null) {
    return normalizeCnpj(identifier).length === 14
}

export function isPlaceholderEmail(email?: string | null) {
    const normalized = normalizeEmail(email)
    return (
        normalized.endsWith('@placeholder.invalid') ||
        normalized.endsWith('@placeholder.local') ||
        normalized.startsWith('importado+')
    )
}

export function hasRealCustomerEmail(email?: string | null) {
    return Boolean(normalizeEmail(email)) && !isPlaceholderEmail(email)
}

export function getPrimaryCustomerAccessIdentifier(params: {
    cnpj?: string | null
    email?: string | null
}) {
    const cnpj = (params.cnpj || '').trim()
    if (cnpj) return cnpj

    return normalizeEmail(params.email)
}

