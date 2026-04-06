import { z } from 'zod'
export { storeAddressSchema, type StoreAddressFormData } from '@/lib/schemas/store-address'

const personTypeEnum = z.enum(['legal_entity', 'individual'])
const documentTypeEnum = z.enum(['CNPJ', 'CPF'])
const taxpayerIndicatorEnum = z.enum(['contributor', 'non_contributor', 'exempt'])

function digitsOnly(value?: string | null) {
    return (value || '').replace(/\D/g, '')
}

function isValidCpf(cpf?: string | null) {
    const cleaned = digitsOnly(cpf)
    if (cleaned.length !== 11) return false
    if (/^(\d)\1{10}$/.test(cleaned)) return false

    let sum = 0
    for (let index = 0; index < 9; index += 1) {
        sum += Number(cleaned[index]) * (10 - index)
    }
    let check = (sum * 10) % 11
    if (check === 10) check = 0
    if (check !== Number(cleaned[9])) return false

    sum = 0
    for (let index = 0; index < 10; index += 1) {
        sum += Number(cleaned[index]) * (11 - index)
    }
    check = (sum * 10) % 11
    if (check === 10) check = 0
    return check === Number(cleaned[10])
}

function isValidCnpj(cnpj?: string | null) {
    const cleaned = digitsOnly(cnpj)
    if (cleaned.length !== 14) return false
    if (/^(\d)\1{13}$/.test(cleaned)) return false

    const calc = (base: string, factors: number[]) => {
        const total = factors.reduce((acc, factor, index) => acc + Number(base[index]) * factor, 0)
        const remainder = total % 11
        return remainder < 2 ? 0 : 11 - remainder
    }

    const digit1 = calc(cleaned, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    if (digit1 !== Number(cleaned[12])) return false
    const digit2 = calc(cleaned, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return digit2 === Number(cleaned[13])
}

const baseCustomerShape = {
    fullName: z.string().min(2, 'O nome deve ter no minimo 2 caracteres').max(100, 'Nome muito longo'),
    email: z.string().email('E-mail invalido'),
    phone: z.string().optional(),
    companyName: z.string().min(2, 'A Razao Social deve ter no minimo 2 caracteres').max(150, 'Nome muito longo'),
    tradeName: z.string().optional(),
    customerTypeId: z.string().optional(),
    representativeId: z.string().optional(),
    tagIds: z.array(z.string()).optional(),
    personType: personTypeEnum.default('legal_entity'),
    documentType: documentTypeEnum.default('CNPJ'),
    documentNumber: z.string().min(11, 'Documento fiscal invalido'),
    stateRegistration: z.string().optional(),
    municipalRegistration: z.string().optional(),
    taxpayerIndicator: taxpayerIndicatorEnum.default('contributor'),
    fiscalEmail: z
        .string()
        .optional()
        .refine((value) => !value || z.string().email().safeParse(value).success, 'E-mail fiscal invalido'),
    fiscalNotes: z.string().optional(),
    fiscalAddressId: z.string().uuid().optional(),
    // Legacy compatibility fields
    cnpj: z.string().optional(),
    // Legacy address fields (optional fallback)
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
}

type FiscalSchemaValue = {
    personType: 'legal_entity' | 'individual'
    documentType: 'CNPJ' | 'CPF'
    documentNumber: string
    cnpj?: string
    taxpayerIndicator: 'contributor' | 'non_contributor' | 'exempt'
    stateRegistration?: string
    address?: string
    city?: string
    state?: string
    zipCode?: string
}

function applyFiscalRules(
    value: FiscalSchemaValue,
    ctx: z.RefinementCtx,
    options?: { requireAddress?: boolean }
) {
    const rawDocument = value.documentNumber || value.cnpj || ''
    const documentDigits = digitsOnly(rawDocument)

    if (value.documentType === 'CPF' && !isValidCpf(documentDigits)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['documentNumber'],
            message: 'CPF invalido.',
        })
    }

    if (value.documentType === 'CNPJ' && !isValidCnpj(documentDigits)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['documentNumber'],
            message: 'CNPJ invalido.',
        })
    }

    if (value.personType === 'individual' && value.documentType !== 'CPF') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['documentType'],
            message: 'Pessoa fisica deve utilizar CPF.',
        })
    }

    if (value.personType === 'legal_entity' && value.documentType !== 'CNPJ') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['documentType'],
            message: 'Pessoa juridica deve utilizar CNPJ.',
        })
    }

    if (value.documentType === 'CNPJ' && value.taxpayerIndicator === 'contributor' && !(value.stateRegistration || '').trim()) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['stateRegistration'],
            message: 'Inscricao estadual obrigatoria para contribuinte PJ.',
        })
    }

    const hasAnyAddressField = Boolean(
        (value.address || '').trim() ||
        (value.city || '').trim() ||
        (value.state || '').trim() ||
        (value.zipCode || '').trim()
    )
    const shouldRequireAddress = options?.requireAddress === true || hasAnyAddressField

    if (
        shouldRequireAddress &&
        (!(value.address || '').trim() || !(value.city || '').trim() || !(value.state || '').trim() || !(value.zipCode || '').trim())
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['address'],
            message: 'Endereco fiscal basico (logradouro/cidade/UF/CEP) deve estar completo.',
        })
    }
}

// Schema for creating a new customer (admin)
export const customerSchema = z
    .object({
        ...baseCustomerShape,
        password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres'),
    })
    .superRefine((value, ctx) => applyFiscalRules(value, ctx, { requireAddress: true }))

export type CustomerFormData = z.infer<typeof customerSchema>

// Schema for editing an existing customer (admin)
export const customerEditSchema = z
    .object(baseCustomerShape)
    .superRefine((value, ctx) => applyFiscalRules(value, ctx, { requireAddress: false }))

export type CustomerEditFormData = z.infer<typeof customerEditSchema>
