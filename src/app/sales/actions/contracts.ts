import { z } from 'zod'

const positiveIntOptionalSchema = z.coerce.number().int().min(1).optional()
const optionalSearchSchema = z.string().trim().optional()

const emptyStringToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined
    }
    return value
  }, schema)

const emptyStringToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return null
    }
    return value
  }, schema)

export const idSchema = z.string().trim().min(1)

export const customersPageInputSchema = z
  .object({
    page: positiveIntOptionalSchema,
    pageSize: positiveIntOptionalSchema,
    query: optionalSearchSchema,
  })
  .strict()

export const ordersPageInputSchema = z
  .object({
    page: positiveIntOptionalSchema,
    pageSize: positiveIntOptionalSchema,
  })
  .strict()

export const catalogProductsPageInputSchema = z
  .object({
    page: positiveIntOptionalSchema,
    pageSize: positiveIntOptionalSchema,
    search: optionalSearchSchema,
    categoryId: emptyStringToNull(idSchema.nullable()).optional(),
  })
  .strict()

export const productConfiguratorInputSchema = z
  .object({
    storeId: idSchema,
    productId: idSchema,
    priceTableId: emptyStringToNull(idSchema.nullable()).optional(),
  })
  .strict()

export const paymentOptionsInputSchema = z
  .object({
    storeId: idSchema,
    subtotal: z.coerce.number().finite().min(0),
    priceTableId: emptyStringToNull(idSchema.nullable()).optional(),
  })
  .strict()

export const draftPricingLineSchema = z
  .object({
    cartKey: emptyStringToUndefined(z.string().trim().min(1)).optional(),
    variantId: idSchema,
    sizeOptionId: emptyStringToNull(idSchema.nullable()).optional(),
  })
  .strict()

export const draftPricingInputSchema = z
  .object({
    storeId: idSchema,
    priceTableId: emptyStringToNull(idSchema.nullable()).optional(),
    lines: z.array(draftPricingLineSchema).min(1),
  })
  .strict()

export const representativeDraftLineSchema = z
  .object({
    cartKey: emptyStringToUndefined(z.string().trim().min(1)).optional(),
    variantId: idSchema,
    productId: idSchema,
    productName: z.string().trim().min(1),
    fabricName: z.string().trim().min(1),
    colorName: z.string().trim().min(1),
    sizeName: emptyStringToNull(z.string().trim().min(1).nullable()).optional(),
    sizeOptionId: emptyStringToNull(idSchema.nullable()).optional(),
    imageUrl: emptyStringToNull(z.string().trim().min(1).nullable()).optional(),
    quantity: z.coerce.number().int().min(1),
    unitPrice: z.coerce.number().finite().optional(),
  })
  .strict()

export const representativeDocumentPayloadSchema = z
  .object({
    storeId: idSchema,
    priceTableId: emptyStringToNull(idSchema.nullable()).optional(),
    selectedPaymentId: emptyStringToNull(idSchema.nullable()).optional(),
    isTableRule: z.boolean().optional(),
    selectedAddressId: emptyStringToNull(idSchema.nullable()).optional(),
    notes: emptyStringToNull(z.string().trim().nullable()).optional(),
    negotiationDiscountType: z.enum(['percent', 'value']).nullable().optional(),
    negotiationDiscountValue: z.coerce.number().finite().nullable().optional(),
    negotiationSurchargeAmount: z.coerce.number().finite().nullable().optional(),
    negotiationReason: emptyStringToNull(z.string().trim().nullable()).optional(),
    items: z.array(representativeDraftLineSchema).min(1),
  })
  .strict()

const optionalTrimmedTextSchema = emptyStringToUndefined(z.string().trim().min(1)).optional()

export const representativeCreateCustomerInputSchema = z
  .object({
    fullName: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: emptyStringToUndefined(z.string().trim().min(6)).optional(),
    phone: optionalTrimmedTextSchema,
    companyName: z.string().trim().min(1),
    cnpj: z.string().trim().min(1),
    tradeName: optionalTrimmedTextSchema,
    customerTypeId: optionalTrimmedTextSchema,
    address: optionalTrimmedTextSchema,
    city: optionalTrimmedTextSchema,
    state: optionalTrimmedTextSchema,
    zipCode: optionalTrimmedTextSchema,
  })
  .strict()

export const representativeUpdateCustomerInputSchema = representativeCreateCustomerInputSchema
  .extend({
    id: idSchema,
    profileId: optionalTrimmedTextSchema,
  })
  .strict()

export const representativeVisitPayloadSchema = z
  .object({
    storeId: idSchema,
    visitedAt: emptyStringToNull(z.string().trim().nullable()).optional(),
    notes: emptyStringToNull(z.string().trim().nullable()).optional(),
    resultSummary: emptyStringToNull(z.string().trim().nullable()).optional(),
    nextStep: emptyStringToNull(z.string().trim().nullable()).optional(),
    outcome: z
      .enum(['planned', 'completed', 'follow_up', 'converted_quote', 'converted_order'])
      .optional(),
    generatedQuoteId: emptyStringToNull(idSchema.nullable()).optional(),
    generatedOrderId: emptyStringToNull(idSchema.nullable()).optional(),
  })
  .strict()

function formatIssuePath(path: Array<PropertyKey>) {
  if (path.length === 0) return 'input'
  return path.map((entry) => String(entry)).join('.')
}

function formatIssues(error: z.ZodError) {
  return error.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`).join('; ')
}


export function getActionErrorMessage(error: unknown, fallback = 'Unexpected action validation error.') {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}
export function parseWithSchema<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  context: string
): z.output<T> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new Error(`${context} invalid. ${formatIssues(parsed.error)}`)
  }

  return parsed.data
}
