export function normalizeEmail(email?: string | null) {
    return (email || '').trim().toLowerCase()
}

export function normalizeDocument(document?: string | null) {
    return (document || '').replace(/\D/g, '')
}

export function normalizeCnpj(cnpj?: string | null) {
    return normalizeDocument(cnpj)
}

export function normalizeCpf(cpf?: string | null) {
    return normalizeDocument(cpf)
}

export function formatCpf(cpf?: string | null) {
    const digits = normalizeCpf(cpf)
    if (digits.length !== 11) return (cpf || '').trim()

    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatCnpj(cnpj?: string | null) {
    const digits = normalizeCnpj(cnpj)
    if (digits.length !== 14) return (cnpj || '').trim()

    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function isCpfIdentifier(identifier?: string | null) {
    return normalizeCpf(identifier).length === 11
}

export function isCnpjIdentifier(identifier?: string | null) {
    return normalizeCnpj(identifier).length === 14
}

export function isTaxDocumentIdentifier(identifier?: string | null) {
    return isCpfIdentifier(identifier) || isCnpjIdentifier(identifier)
}

export function getDocumentCandidates(identifier?: string | null) {
    const raw = (identifier || '').trim()
    const normalized = normalizeDocument(raw)
    const candidates = new Set<string>()

    if (raw) candidates.add(raw)
    if (normalized) candidates.add(normalized)

    if (normalized.length === 11) {
        candidates.add(formatCpf(normalized))
    }

    if (normalized.length === 14) {
        candidates.add(formatCnpj(normalized))
    }

    return Array.from(candidates).filter(Boolean)
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
    document?: string | null
    cnpj?: string | null
    email?: string | null
}) {
    const document = (params.document || '').trim()
    if (document) return document

    const cnpj = (params.cnpj || '').trim()
    if (cnpj) return cnpj

    return normalizeEmail(params.email)
}
