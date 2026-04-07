'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface UpsertProductDomainInput {
    productId?: string | null
    name: string
    slug: string
    description?: string | null
    categoryId: string
    taxProfileId?: string | null
    size?: string | null
    hasSizeVariants?: boolean
    sizeOptions?: ProductSizeOptionInput[] | null
    basePrice: number
    isActive: boolean
    isFeatured: boolean
    activeVariantIds?: string[] | null
    variantPriceOverrides?: Record<string, number | null> | null
    operationId?: string
}

export interface ProductSizeOptionInput {
    id?: string
    name: string
    slug?: string
    priceMode: 'absolute' | 'delta'
    priceValue: number
    isActive: boolean
    sortOrder: number
    isDefault: boolean
}

interface ProductRpcRow {
    product_id: string
    created: boolean
    variants_inserted: number
}

interface ProductImagesRpcRow {
    product_id: string
    primary_image_id: string | null
    deleted_urls: string[] | null
    inserted_image_ids: string[] | null
    total_images: number
}

export interface ProductTaxProfileRuleInput {
    id?: string | null
    ruleName: string
    operationDirection: 'outbound' | 'inbound'
    originUf?: string | null
    destinationUf?: string | null
    customerTypeId?: string | null
    personType?: 'individual' | 'legal_entity' | null
    taxpayerIndicator?: 'contributor' | 'non_contributor' | 'exempt' | null
    cfopOverride?: string | null
    priority?: number
    isActive?: boolean
    effectiveFrom?: string | null
    effectiveTo?: string | null
    rulePayload?: Record<string, unknown> | null
    futureTaxPayload?: Record<string, unknown> | null
}

export interface ProductTaxProfileInput {
    id?: string | null
    name: string
    code: string
    description?: string | null
    ncm?: string | null
    cest?: string | null
    originCode?: string
    commercialUnit?: string | null
    taxUnit?: string | null
    eanGtin?: string | null
    taxEanGtin?: string | null
    defaultFiscalDescription?: string | null
    fiscalType?: string | null
    itemType?: string | null
    hasSubstitutionTax?: boolean
    requiresCest?: boolean
    hasIpi?: boolean
    ipiCstOut?: string | null
    ipiEnquadramentoCodigo?: string | null
    pisCst?: string | null
    cofinsCst?: string | null
    pisAliquota?: number | null
    cofinsAliquota?: number | null
    defaultOutputCfop?: string | null
    defaultInputCfop?: string | null
    internalFiscalCode?: string | null
    defaultFiscalNotes?: string | null
    isActive?: boolean
    requiresTaxConfiguration?: boolean
    futureTaxPayload?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
    ncmReferenceId?: string | null
    ncmVersionId?: string | null
    tipiReferenceId?: string | null
    tipiVersionId?: string | null
    cestReferenceId?: string | null
    cestVersionId?: string | null
    defaultOutputCfopReferenceId?: string | null
    defaultOutputCfopVersionId?: string | null
    defaultInputCfopReferenceId?: string | null
    defaultInputCfopVersionId?: string | null
    fiscalReferenceSnapshot?: Record<string, unknown> | null
    rules?: ProductTaxProfileRuleInput[]
}

export interface ProductTaxProfileListItem {
    id: string
    name: string
    code: string
    ncm: string | null
    cest: string | null
    default_output_cfop: string | null
    is_active: boolean
    version: number
    products_count: number
    updated_at: string
    reference_mode?: 'manual' | 'base-backed' | 'mixed'
    has_outdated_references?: boolean
    outdated_reference_types?: string[]
}

export interface ProductTaxProfileUsageItem {
    product_id: string
    product_name: string
    product_slug: string
    product_is_active: boolean
    product_updated_at: string
}

export interface SaveProductImagesMetadataInput {
    productId: string
    imageIdsToDelete?: string[]
    newImageUrls?: string[]
    primaryImageRef?: string | null
    operationId?: string
}

export interface SignedUploadFileInput {
    name: string
    contentType?: string | null
}

interface SignedUploadDescriptor {
    path: string
    token: string
    publicUrl: string
}

const MAX_PRODUCT_IMAGES = 5
const PUBLIC_PRODUCTS_URL_MARKER = '/storage/v1/object/public/products/'
type ProductAuditAction =
    | 'product_domain_upsert'
    | 'product_images_metadata_save'
    | 'product_images_signed_url_batch_create'
    | 'product_images_signed_upload_cleanup'

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const maybeMessage = (error as { message?: unknown }).message
        if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage
    }
    return fallback
}

function normalizeVariantPrices(input?: Record<string, number | null> | null): Record<string, number | null> | null {
    if (!input) return null

    const output: Record<string, number | null> = {}
    Object.entries(input).forEach(([variantId, price]) => {
        if (!variantId) return
        if (price === null || price === undefined || Number.isNaN(price)) {
            output[variantId] = null
            return
        }
        output[variantId] = Number(price)
    })
    return output
}

function normalizeSizeOptions(
    input?: ProductSizeOptionInput[] | null
): Array<{
    id: string | null
    name: string
    slug: string
    price_mode: 'absolute' | 'delta'
    price_value: number
    is_active: boolean
    sort_order: number
    is_default: boolean
}> | null {
    if (!input) return null

    const seenSlugs = new Set<string>()
    const normalized = input
        .map((option, index) => {
            const name = option.name?.trim() || ''
            if (!name) throw new Error('Cada tamanho deve ter um nome valido.')
            const slug = (option.slug?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
                .replace(/^-+|-+$/g, '')
                .slice(0, 80)
            if (!slug) throw new Error(`Slug invalido para o tamanho "${name}".`)

            const priceValue = Number(option.priceValue)
            if (!Number.isFinite(priceValue) || priceValue < 0) {
                throw new Error(`Preco invalido para o tamanho "${name}".`)
            }

            const slugKey = slug.toLowerCase()
            if (seenSlugs.has(slugKey)) {
                throw new Error(`Tamanho duplicado: "${name}".`)
            }
            seenSlugs.add(slugKey)

            return {
                id: option.id && isValidUuid(option.id) ? option.id : null,
                name,
                slug,
                price_mode:
                    option.priceMode === 'absolute'
                        ? ('absolute' as const)
                        : ('delta' as const),
                price_value: priceValue,
                is_active: option.isActive !== false,
                sort_order: Number.isFinite(option.sortOrder) ? option.sortOrder : index,
                is_default: option.isDefault === true,
            }
        })
        .sort((a, b) => a.sort_order - b.sort_order)

    if (normalized.length > 0 && !normalized.some((option) => option.is_default)) {
        normalized[0].is_default = true
    }

    return normalized
}

function sanitizeFiscalCode(value?: string | null) {
    const trimmed = (value || '').trim()
    return trimmed.length > 0 ? trimmed : null
}

function sanitizeJsonPayload(input?: Record<string, unknown> | null) {
    if (!input || typeof input !== 'object') return {}
    return input
}

async function buildFiscalReferenceSnapshot(
    adminSupabase: ReturnType<typeof createServiceRoleClient>,
    input: ProductTaxProfileInput
) {
    const snapshot: Record<string, unknown> = {}

    if (input.ncmReferenceId && isValidUuid(input.ncmReferenceId)) {
        const { data } = await adminSupabase
            .from('fiscal_ncm_entries')
            .select('id, version_id, code, description, full_description')
            .eq('id', input.ncmReferenceId)
            .single()

        if (data) {
            snapshot.ncm = {
                reference_id: data.id,
                version_id: data.version_id,
                code: data.code,
                description: data.description,
                full_description: data.full_description,
            }
        }
    }

    if (input.tipiReferenceId && isValidUuid(input.tipiReferenceId)) {
        const { data } = await adminSupabase
            .from('fiscal_tipi_entries')
            .select('id, version_id, ncm_code, ex_tipi, description, ipi_rate')
            .eq('id', input.tipiReferenceId)
            .single()

        if (data) {
            snapshot.tipi = {
                reference_id: data.id,
                version_id: data.version_id,
                ncm_code: data.ncm_code,
                ex_tipi: data.ex_tipi,
                description: data.description,
                ipi_rate: data.ipi_rate,
            }
        }
    }

    if (input.cestReferenceId && isValidUuid(input.cestReferenceId)) {
        const { data } = await adminSupabase
            .from('fiscal_cest_entries')
            .select('id, version_id, code, description, segment')
            .eq('id', input.cestReferenceId)
            .single()

        if (data) {
            snapshot.cest = {
                reference_id: data.id,
                version_id: data.version_id,
                code: data.code,
                description: data.description,
                segment: data.segment,
            }
        }
    }

    if (input.defaultOutputCfopReferenceId && isValidUuid(input.defaultOutputCfopReferenceId)) {
        const { data } = await adminSupabase
            .from('fiscal_cfop_entries')
            .select('id, version_id, code, description, operation_direction')
            .eq('id', input.defaultOutputCfopReferenceId)
            .single()

        if (data) {
            snapshot.default_output_cfop = {
                reference_id: data.id,
                version_id: data.version_id,
                code: data.code,
                description: data.description,
                operation_direction: data.operation_direction,
            }
        }
    }

    if (input.defaultInputCfopReferenceId && isValidUuid(input.defaultInputCfopReferenceId)) {
        const { data } = await adminSupabase
            .from('fiscal_cfop_entries')
            .select('id, version_id, code, description, operation_direction')
            .eq('id', input.defaultInputCfopReferenceId)
            .single()

        if (data) {
            snapshot.default_input_cfop = {
                reference_id: data.id,
                version_id: data.version_id,
                code: data.code,
                description: data.description,
                operation_direction: data.operation_direction,
            }
        }
    }

    const versionIds = [
        (snapshot.ncm as { version_id?: string } | undefined)?.version_id,
        (snapshot.tipi as { version_id?: string } | undefined)?.version_id,
        (snapshot.cest as { version_id?: string } | undefined)?.version_id,
        (snapshot.default_output_cfop as { version_id?: string } | undefined)?.version_id,
        (snapshot.default_input_cfop as { version_id?: string } | undefined)?.version_id,
    ].filter((value): value is string => Boolean(value && isValidUuid(value)))

    if (versionIds.length > 0) {
        const { data } = await adminSupabase
            .from('fiscal_reference_versions')
            .select('id, table_type, version_label, is_active')
            .in('id', versionIds)

        snapshot.version_labels = (data || []).reduce<Record<string, unknown>>((acc, row) => {
            acc[String(row.id)] = {
                table_type: row.table_type,
                version_label: row.version_label,
                is_active: row.is_active,
            }
            return acc
        }, {})
    }

    snapshot.captured_at = new Date().toISOString()

    return snapshot
}

function inferReferenceMode(profile: {
    ncm: string | null
    cest: string | null
    default_output_cfop: string | null
    ncm_reference_id?: unknown
    tipi_reference_id?: unknown
    cest_reference_id?: unknown
    default_output_cfop_reference_id?: unknown
    default_input_cfop_reference_id?: unknown
}) {
    const hasReferences = Boolean(
        profile.ncm_reference_id ||
            profile.tipi_reference_id ||
            profile.cest_reference_id ||
            profile.default_output_cfop_reference_id ||
            profile.default_input_cfop_reference_id
    )
    const hasManualValues = Boolean(
        (profile.ncm && !profile.ncm_reference_id) ||
            (profile.cest && !profile.cest_reference_id) ||
            (profile.default_output_cfop && !profile.default_output_cfop_reference_id)
    )

    if (hasReferences && hasManualValues) return 'mixed' as const
    if (hasReferences) return 'base-backed' as const
    return 'manual' as const
}

async function ensureAdminAccess(): Promise<string> {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
        throw new Error('Nao autenticado.')
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

    if (profileError || !profile || profile.role !== 'admin') {
        throw new Error('Acesso negado.')
    }

    return authData.user.id
}

async function logProductAuditEvent(params: {
    operationId: string
    actorProfileId?: string | null
    productId?: string | null
    action: ProductAuditAction
    stage?: string
    success: boolean
    message?: string | null
    payload?: Record<string, unknown>
}) {
    try {
        const adminSupabase = createServiceRoleClient()
        const { error } = await adminSupabase.from('admin_product_audit_log').insert({
            operation_id: params.operationId,
            actor_profile_id: params.actorProfileId ?? null,
            product_id: params.productId ?? null,
            action: params.action,
            stage: params.stage ?? 'application',
            success: params.success,
            message: params.message ?? null,
            payload: params.payload ?? {},
        })
        if (error) {
            console.error('Falha ao registrar log de auditoria de produto:', error.message)
        }
    } catch (error: unknown) {
        console.error('Erro inesperado ao registrar log de auditoria de produto:', error)
    }
}

function extractStoragePathFromPublicUrl(url: string): string | null {
    if (!url?.trim()) return null

    try {
        const parsed = new URL(url)
        const marker = PUBLIC_PRODUCTS_URL_MARKER
        const index = parsed.pathname.indexOf(marker)
        if (index < 0) return null
        return decodeURIComponent(parsed.pathname.substring(index + marker.length))
    } catch {
        const fallbackMarker = '/products/'
        const index = url.indexOf(fallbackMarker)
        if (index < 0) return null
        return decodeURIComponent(url.substring(index + fallbackMarker.length))
    }
}

function isMissingRpcFunctionError(error: unknown, functionName: string): boolean {
    const message = getErrorMessage(error, '').toLowerCase()
    if (!message) return false

    return (
        (message.includes('could not find the function') && message.includes(functionName.toLowerCase())) ||
        (message.includes('does not exist') && message.includes(functionName.toLowerCase())) ||
        (message.includes('function') && message.includes(functionName.toLowerCase()) && message.includes('not found'))
    )
}

function isAmbiguousProductIdReferenceError(error: unknown): boolean {
    const message = getErrorMessage(error, '').toLowerCase()
    if (!message) return false
    return message.includes('column reference "product_id" is ambiguous')
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
    const message = getErrorMessage(error, '').toLowerCase()
    return message.includes('relation') && message.includes(relationName.toLowerCase())
}

function sanitizeExtension(fileName: string): string {
    const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? ''
    const sanitized = extension.replace(/[^a-z0-9]/g, '')
    return sanitized || 'bin'
}

function validateSignedUploadFileInput(file: SignedUploadFileInput): { ok: boolean; reason?: string } {
    const name = file.name?.trim() || ''
    if (!name) return { ok: false, reason: 'Nome do arquivo invalido.' }

    const contentType = (file.contentType || '').trim().toLowerCase()
    if (contentType && !contentType.startsWith('image/')) {
        return { ok: false, reason: `Tipo de arquivo nao suportado: ${file.contentType}` }
    }

    return { ok: true }
}

function isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function upsertProductDomainFallback(input: UpsertProductDomainInput): Promise<ProductRpcRow> {
    const adminSupabase = createServiceRoleClient()
    let productId = input.productId ?? null
    let created = false

    const productPayload = {
        name: input.name.trim(),
        slug: input.slug.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        category_id: input.categoryId,
        tax_profile_id: input.taxProfileId ?? null,
        size: input.size?.trim() ? input.size.trim() : null,
        has_size_variants: input.hasSizeVariants === true,
        base_price: input.basePrice,
        is_active: input.isActive,
        is_featured: input.isFeatured,
    }

    if (!productId) {
        const { data: inserted, error: insertError } = await adminSupabase
            .from('products')
            .insert(productPayload)
            .select('id')
            .single()
        if (insertError || !inserted?.id) throw insertError || new Error('Falha ao criar produto.')
        productId = inserted.id
        created = true
    } else {
        const { data: updated, error: updateError } = await adminSupabase
            .from('products')
            .update(productPayload)
            .eq('id', productId)
            .select('id')
            .single()
        if (updateError || !updated?.id) throw updateError || new Error('Produto nao encontrado.')
        productId = updated.id
    }

    const [{ data: colors, error: colorsError }, { data: existing, error: existingError }] = await Promise.all([
        adminSupabase.from('fabric_colors').select('id, fabric_id, is_active'),
        adminSupabase.from('product_variants').select('fabric_id, fabric_color_id').eq('product_id', productId),
    ])
    if (colorsError) throw colorsError
    if (existingError) throw existingError

    const existingSet = new Set((existing ?? []).map((row) => `${row.fabric_id}-${row.fabric_color_id}`))
    const toInsert = (colors ?? [])
        .filter((color) => !existingSet.has(`${color.fabric_id}-${color.id}`))
        .map((color) => ({
            product_id: productId,
            fabric_id: color.fabric_id,
            fabric_color_id: color.id,
            stock_quantity: 999,
            is_active: input.isActive && Boolean(color.is_active),
        }))

    let variantsInserted = 0
    if (toInsert.length > 0) {
        const { error: insertVariantsError } = await adminSupabase.from('product_variants').insert(toInsert)
        if (insertVariantsError) throw insertVariantsError
        variantsInserted = toInsert.length
    }

    if (input.activeVariantIds !== undefined && input.activeVariantIds !== null) {
        const { error: deactivateError } = await adminSupabase
            .from('product_variants')
            .update({ is_active: false })
            .eq('product_id', productId)
        if (deactivateError) throw deactivateError

        const validActiveIds = input.activeVariantIds.filter((id) => isValidUuid(id))
        if (validActiveIds.length > 0) {
            const { error: activateError } = await adminSupabase
                .from('product_variants')
                .update({ is_active: true })
                .eq('product_id', productId)
                .in('id', validActiveIds)
            if (activateError) throw activateError
        }
    }

    if (input.variantPriceOverrides !== undefined && input.variantPriceOverrides !== null) {
        const entries = Object.entries(input.variantPriceOverrides)
        for (const [variantId, price] of entries) {
            if (!isValidUuid(variantId)) continue
            if (price !== null && (!Number.isFinite(price) || price < 0)) {
                throw new Error(`Preco invalido para variacao ${variantId}.`)
            }

            const { error: priceError } = await adminSupabase
                .from('product_variants')
                .update({ price_override: price })
                .eq('product_id', productId)
                .eq('id', variantId)
            if (priceError) throw priceError
        }
    }

    if (input.sizeOptions !== undefined && input.sizeOptions !== null) {
        const normalizedSizeOptions = normalizeSizeOptions(input.sizeOptions) || []
        let existingSizeOptionIds: string[] = []

        const { data: existingSizeOptions, error: existingSizeOptionsError } = await adminSupabase
            .from('product_size_options')
            .select('id')
            .eq('product_id', productId)

        if (existingSizeOptionsError) {
            if (isMissingRelationError(existingSizeOptionsError, 'product_size_options')) {
                if (input.hasSizeVariants || normalizedSizeOptions.length > 0) {
                    throw new Error(
                        'A tabela de tamanhos ainda nao existe no banco. Execute a migration de tamanhos antes de salvar.'
                    )
                }
            } else {
                throw existingSizeOptionsError
            }
        } else {
            existingSizeOptionIds = (existingSizeOptions || []).map((row) => row.id)
        }

        if (existingSizeOptionIds.length > 0) {
            const incomingIds = new Set(
                normalizedSizeOptions
                    .map((option) => option.id)
                    .filter((value): value is string => Boolean(value))
            )
            const idsToDelete = existingSizeOptionIds.filter((id) => !incomingIds.has(id))
            if (idsToDelete.length > 0) {
                const { error: deleteError } = await adminSupabase
                    .from('product_size_options')
                    .delete()
                    .eq('product_id', productId)
                    .in('id', idsToDelete)
                if (deleteError) throw deleteError
            }
        }

        for (const option of normalizedSizeOptions) {
            if (option.id) {
                const { error: updateSizeError } = await adminSupabase
                    .from('product_size_options')
                    .update({
                        name: option.name,
                        slug: option.slug,
                        price_mode: option.price_mode,
                        price_value: option.price_value,
                        is_active: option.is_active,
                        sort_order: option.sort_order,
                        is_default: option.is_default,
                    })
                    .eq('id', option.id)
                    .eq('product_id', productId)
                if (updateSizeError) throw updateSizeError
                continue
            }

            const { error: insertSizeError } = await adminSupabase.from('product_size_options').insert({
                product_id: productId,
                name: option.name,
                slug: option.slug,
                price_mode: option.price_mode,
                price_value: option.price_value,
                is_active: option.is_active,
                sort_order: option.sort_order,
                is_default: option.is_default,
            })
            if (insertSizeError) throw insertSizeError
        }
    }

    if (!productId) {
        throw new Error('Falha ao resolver produto para fallback de dominio.')
    }

    return {
        product_id: productId,
        created,
        variants_inserted: variantsInserted,
    }
}

async function saveProductImagesMetadataFallback(
    productId: string,
    imageIdsToDelete: string[],
    newImageUrls: string[],
    primaryImageRef: string | null
): Promise<ProductImagesRpcRow> {
    const adminSupabase = createServiceRoleClient()

    const { data: existingRows, error: existingError } = await adminSupabase
        .from('product_images')
        .select('id, url, sort_order, created_at')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    if (existingError) throw existingError

    const existing = existingRows ?? []
    const existingUrlSet = new Set(existing.map((row) => row.url))

    const cleanedIncomingUrls = Array.from(
        new Set(
            newImageUrls
                .map((url) => url.trim())
                .filter((url) => url.length > 0 && url.includes(PUBLIC_PRODUCTS_URL_MARKER))
        )
    ).filter((url) => !existingUrlSet.has(url))

    const toDeleteIds = Array.from(new Set(imageIdsToDelete.filter(Boolean)))
    const deletedRows = existing.filter((row) => toDeleteIds.includes(row.id))
    const deletedUrls = deletedRows.map((row) => row.url)

    if (toDeleteIds.length > 0) {
        const { error: deleteError } = await adminSupabase
            .from('product_images')
            .delete()
            .eq('product_id', productId)
            .in('id', toDeleteIds)
        if (deleteError) throw deleteError
    }

    const remainingCount = existing.length - deletedRows.length
    if (remainingCount + cleanedIncomingUrls.length > MAX_PRODUCT_IMAGES) {
        throw new Error(`Product images limit exceeded. Max allowed: ${MAX_PRODUCT_IMAGES}`)
    }

    const { data: maxSortRows, error: maxSortError } = await adminSupabase
        .from('product_images')
        .select('sort_order')
        .eq('product_id', productId)
        .order('sort_order', { ascending: false })
        .limit(1)
    if (maxSortError) throw maxSortError

    const maxSort = maxSortRows?.[0]?.sort_order ?? -1
    const insertedImageIds: string[] = []
    for (let index = 0; index < cleanedIncomingUrls.length; index += 1) {
        const url = cleanedIncomingUrls[index]
        const { data: insertedRow, error: insertError } = await adminSupabase
            .from('product_images')
            .insert({
                product_id: productId,
                url,
                is_primary: false,
                sort_order: maxSort + index + 1,
            })
            .select('id')
            .single()
        if (insertError) throw insertError
        insertedImageIds.push(insertedRow.id)
    }

    let primaryImageId: string | null = null
    const ref = primaryImageRef?.trim() || ''
    if (ref.startsWith('new_')) {
        const maybeIndex = Number(ref.replace('new_', ''))
        if (Number.isFinite(maybeIndex) && maybeIndex >= 0) {
            primaryImageId = insertedImageIds[maybeIndex] ?? null
        }
    } else if (ref) {
        primaryImageId = ref
    }

    const { data: finalImages, error: finalImagesError } = await adminSupabase
        .from('product_images')
        .select('id')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    if (finalImagesError) throw finalImagesError

    const validPrimary = finalImages?.some((row) => row.id === primaryImageId) ?? false
    if (!validPrimary) {
        primaryImageId = finalImages?.[0]?.id ?? null
    }

    const { error: resetPrimaryError } = await adminSupabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', productId)
    if (resetPrimaryError) throw resetPrimaryError

    if (primaryImageId) {
        const { error: setPrimaryError } = await adminSupabase
            .from('product_images')
            .update({ is_primary: true })
            .eq('id', primaryImageId)
            .eq('product_id', productId)
        if (setPrimaryError) throw setPrimaryError
    }

    return {
        product_id: productId,
        primary_image_id: primaryImageId,
        deleted_urls: deletedUrls,
        inserted_image_ids: insertedImageIds,
        total_images: finalImages?.length ?? 0,
    }
}

export async function upsertProductDomainAction(
    input: UpsertProductDomainInput
): Promise<{ success: boolean; productId?: string; created?: boolean; variantsInserted?: number; error?: string }> {
    const operationId = input.operationId || crypto.randomUUID()
    let actorProfileId: string | null = null
    let resolvedProductId: string | null = input.productId ?? null

    try {
        actorProfileId = await ensureAdminAccess()

        if (!input.name?.trim()) {
            throw new Error('Nome do produto e obrigatorio.')
        }
        if (!input.slug?.trim()) {
            throw new Error('Slug do produto e obrigatorio.')
        }
        if (!input.categoryId) {
            throw new Error('Categoria e obrigatoria.')
        }
        if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
            throw new Error('Preco base invalido.')
        }

        const adminSupabase = createServiceRoleClient()
        const payload = {
            p_product_id: input.productId ?? null,
            p_name: input.name.trim(),
            p_slug: input.slug.trim(),
            p_description: input.description?.trim() ? input.description.trim() : null,
            p_category_id: input.categoryId,
            p_tax_profile_id: input.taxProfileId ?? null,
            p_size: input.size?.trim() ? input.size.trim() : null,
            p_has_size_variants: input.hasSizeVariants === true,
            p_size_options: normalizeSizeOptions(input.sizeOptions),
            p_base_price: input.basePrice,
            p_is_active: input.isActive,
            p_is_featured: input.isFeatured,
            p_active_variant_ids: input.activeVariantIds ?? null,
            p_variant_price_overrides: normalizeVariantPrices(input.variantPriceOverrides),
        }

        const { data, error } = await adminSupabase.rpc('admin_upsert_product_domain', payload)
        let row = Array.isArray(data) ? (data[0] as ProductRpcRow | undefined) : undefined
        let usedFallback = false
        if (error) {
            if (
                isMissingRpcFunctionError(error, 'admin_upsert_product_domain') ||
                isAmbiguousProductIdReferenceError(error)
            ) {
                row = await upsertProductDomainFallback(input)
                usedFallback = true
            } else {
                throw error
            }
        }

        if (!row?.product_id) {
            throw new Error('Falha ao persistir dados do produto.')
        }

        resolvedProductId = row.product_id
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: resolvedProductId,
            action: 'product_domain_upsert',
            stage: usedFallback ? 'fallback' : 'application',
            success: true,
            payload: {
                created: Boolean(row.created),
                variantsInserted: Number(row.variants_inserted || 0),
                variantConfigTouched: input.activeVariantIds !== undefined && input.activeVariantIds !== null,
                variantPricingTouched: input.variantPriceOverrides !== undefined && input.variantPriceOverrides !== null,
                sizeConfigTouched: input.sizeOptions !== undefined && input.sizeOptions !== null,
                hasSizeVariants: input.hasSizeVariants === true,
                usedFallback,
            },
        })

        return {
            success: true,
            productId: row.product_id,
            created: Boolean(row.created),
            variantsInserted: Number(row.variants_inserted || 0),
        }
    } catch (error: unknown) {
        const message = getErrorMessage(error, 'Erro ao salvar produto.')
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: resolvedProductId,
            action: 'product_domain_upsert',
            success: false,
            message,
            payload: {
                hasVariantConfig: input.activeVariantIds !== undefined && input.activeVariantIds !== null,
                hasVariantPricing: input.variantPriceOverrides !== undefined && input.variantPriceOverrides !== null,
                hasSizeConfig: input.sizeOptions !== undefined && input.sizeOptions !== null,
            },
        })
        return { success: false, error: message }
    }
}

export async function saveProductImagesMetadataAction(
    input: SaveProductImagesMetadataInput
): Promise<{ success: boolean; primaryImageId?: string | null; totalImages?: number; error?: string }> {
    const operationId = input.operationId || crypto.randomUUID()
    let actorProfileId: string | null = null

    try {
        actorProfileId = await ensureAdminAccess()

        if (!input.productId) {
            throw new Error('Produto invalido para salvar imagens.')
        }

        const adminSupabase = createServiceRoleClient()
        const payload = {
            p_product_id: input.productId,
            p_image_ids_to_delete: input.imageIdsToDelete ?? [],
            p_new_image_urls: input.newImageUrls ?? [],
            p_primary_image_ref: input.primaryImageRef ?? null,
        }

        const { data, error } = await adminSupabase.rpc('admin_save_product_images_metadata', payload)
        let row = Array.isArray(data) ? (data[0] as ProductImagesRpcRow | undefined) : undefined
        let usedFallback = false
        if (error) {
            if (
                isMissingRpcFunctionError(error, 'admin_save_product_images_metadata') ||
                isAmbiguousProductIdReferenceError(error)
            ) {
                row = await saveProductImagesMetadataFallback(
                    input.productId,
                    input.imageIdsToDelete ?? [],
                    input.newImageUrls ?? [],
                    input.primaryImageRef ?? null
                )
                usedFallback = true
            } else {
                throw error
            }
        }

        if (!row?.product_id) {
            throw new Error('Falha ao persistir metadados das imagens do produto.')
        }

        const pathsToDelete = (row.deleted_urls ?? [])
            .map(extractStoragePathFromPublicUrl)
            .filter((path): path is string => Boolean(path))

        if (pathsToDelete.length > 0) {
            const { error: removeError } = await adminSupabase.storage.from('products').remove(pathsToDelete)
            if (removeError) {
                console.error('Falha ao remover arquivos antigos da storage:', removeError.message)
            }
        }

        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: input.productId,
            action: 'product_images_metadata_save',
            success: true,
            stage: usedFallback ? 'fallback' : 'application',
            payload: {
                deletedCount: (row.deleted_urls ?? []).length,
                insertedCount: (row.inserted_image_ids ?? []).length,
                totalImages: row.total_images,
                primaryImageId: row.primary_image_id,
                usedFallback,
            },
        })

        return {
            success: true,
            primaryImageId: row.primary_image_id,
            totalImages: row.total_images,
        }
    } catch (error: unknown) {
        const message = getErrorMessage(error, 'Erro ao salvar imagens do produto.')
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: input.productId,
            action: 'product_images_metadata_save',
            success: false,
            message,
            payload: {
                imageIdsToDeleteCount: input.imageIdsToDelete?.length ?? 0,
                newImageUrlsCount: input.newImageUrls?.length ?? 0,
            },
        })
        return { success: false, error: message }
    }
}

export async function createProductImageSignedUploadUrlsAction(params: {
    productId: string
    files: SignedUploadFileInput[]
    operationId?: string
}): Promise<{ success: boolean; uploads?: SignedUploadDescriptor[]; error?: string }> {
    const operationId = params.operationId || crypto.randomUUID()
    let actorProfileId: string | null = null

    try {
        actorProfileId = await ensureAdminAccess()

        if (!params.productId) {
            throw new Error('Produto invalido para upload de imagens.')
        }

        if (!Array.isArray(params.files) || params.files.length === 0) {
            return { success: true, uploads: [] }
        }
        if (params.files.length > MAX_PRODUCT_IMAGES) {
            throw new Error(`Limite de ${MAX_PRODUCT_IMAGES} imagens por operacao excedido.`)
        }

        const adminSupabase = createServiceRoleClient()
        const timestamp = Date.now()
        const uploads: SignedUploadDescriptor[] = []

        for (let index = 0; index < params.files.length; index += 1) {
            const file = params.files[index]
            const validation = validateSignedUploadFileInput(file)
            if (!validation.ok) {
                throw new Error(validation.reason || 'Arquivo invalido para upload.')
            }

            const extension = sanitizeExtension(file.name)
            const path = `${params.productId}/${timestamp}_${index}_${crypto.randomUUID()}.${extension}`

            const { data, error } = await adminSupabase.storage.from('products').createSignedUploadUrl(path)
            if (error || !data?.token) {
                throw new Error(error?.message || `Falha ao gerar URL assinada para ${file.name}.`)
            }

            const { data: publicData } = adminSupabase.storage.from('products').getPublicUrl(path)
            uploads.push({
                path,
                token: data.token,
                publicUrl: publicData.publicUrl,
            })
        }

        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: params.productId,
            action: 'product_images_signed_url_batch_create',
            success: true,
            payload: {
                fileCount: params.files.length,
                uploadCount: uploads.length,
            },
        })

        return { success: true, uploads }
    } catch (error: unknown) {
        const message = getErrorMessage(error, 'Erro ao gerar upload assinado.')
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: params.productId,
            action: 'product_images_signed_url_batch_create',
            success: false,
            message,
            payload: {
                fileCount: params.files?.length ?? 0,
            },
        })
        return { success: false, error: message }
    }
}

export async function cleanupProductImageUploadsAction(params: {
    paths: string[]
    productId?: string
    operationId?: string
}): Promise<{ success: boolean; error?: string }> {
    const operationId = params.operationId || crypto.randomUUID()
    let actorProfileId: string | null = null

    try {
        actorProfileId = await ensureAdminAccess()
        if (!Array.isArray(params.paths) || params.paths.length === 0) return { success: true }

        const cleanPaths = params.paths
            .map((path) => path.trim())
            .filter((path) => path.length > 0)

        if (cleanPaths.length === 0) return { success: true }

        const adminSupabase = createServiceRoleClient()
        const { error } = await adminSupabase.storage.from('products').remove(cleanPaths)
        if (error) throw error

        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: params.productId ?? null,
            action: 'product_images_signed_upload_cleanup',
            success: true,
            payload: {
                removedPathsCount: cleanPaths.length,
            },
        })

        return { success: true }
    } catch (error: unknown) {
        const message = getErrorMessage(error, 'Erro ao limpar uploads temporarios.')
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: params.productId ?? null,
            action: 'product_images_signed_upload_cleanup',
            success: false,
            message,
            payload: {
                requestedPathsCount: params.paths?.length ?? 0,
            },
        })
        return { success: false, error: message }
    }
}

export async function listProductTaxProfilesAction(params?: {
    search?: string
    includeInactive?: boolean
}): Promise<{ success: boolean; data?: ProductTaxProfileListItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        const adminSupabase = createServiceRoleClient()
        const [{ data, error }, { data: referenceRows, error: referenceError }, { data: activeVersionRows, error: activeVersionError }] = await Promise.all([
            adminSupabase.rpc('admin_list_product_tax_profiles', {
                p_search: sanitizeFiscalCode(params?.search),
                p_include_inactive: params?.includeInactive !== false,
            }),
            adminSupabase
                .from('product_tax_profiles')
                .select(
                    'id, ncm_reference_id, ncm_version_id, tipi_reference_id, tipi_version_id, cest_reference_id, cest_version_id, default_output_cfop_reference_id, default_output_cfop_version_id, default_input_cfop_reference_id, default_input_cfop_version_id'
                ),
            adminSupabase
                .from('fiscal_reference_versions')
                .select('id, table_type')
                .eq('is_active', true),
        ])

        if (error) throw error
        if (referenceError) throw referenceError
        if (activeVersionError) throw activeVersionError

        const activeVersionByType = ((activeVersionRows || []) as Array<Record<string, unknown>>).reduce<Record<string, string>>(
            (acc, row) => {
                acc[String(row.table_type)] = String(row.id)
                return acc
            },
            {}
        )

        const referenceByProfileId = ((referenceRows || []) as Array<Record<string, unknown>>).reduce<
            Record<string, Record<string, unknown>>
        >((acc, row) => {
            acc[String(row.id)] = row
            return acc
        }, {})

        const mapped = ((data || []) as ProductTaxProfileListItem[]).map((item) => {
            const refs = referenceByProfileId[item.id] || {}

            const outdatedReferenceTypes = [
                refs.ncm_reference_id && (!refs.ncm_version_id || (activeVersionByType.ncm && refs.ncm_version_id !== activeVersionByType.ncm)) ? 'ncm' : null,
                refs.tipi_reference_id && (!refs.tipi_version_id || (activeVersionByType.tipi && refs.tipi_version_id !== activeVersionByType.tipi)) ? 'tipi' : null,
                refs.cest_reference_id && (!refs.cest_version_id || (activeVersionByType.cest && refs.cest_version_id !== activeVersionByType.cest)) ? 'cest' : null,
                refs.default_output_cfop_reference_id &&
                (!refs.default_output_cfop_version_id || (activeVersionByType.cfop && refs.default_output_cfop_version_id !== activeVersionByType.cfop))
                    ? 'cfop_saida'
                    : null,
                refs.default_input_cfop_reference_id &&
                (!refs.default_input_cfop_version_id || (activeVersionByType.cfop && refs.default_input_cfop_version_id !== activeVersionByType.cfop))
                    ? 'cfop_entrada'
                    : null,
            ].filter((value): value is string => Boolean(value))

            return {
                ...item,
                reference_mode: inferReferenceMode({
                    ncm: item.ncm,
                    cest: item.cest,
                    default_output_cfop: item.default_output_cfop,
                    ...refs,
                }) as ProductTaxProfileListItem['reference_mode'],
                has_outdated_references: outdatedReferenceTypes.length > 0,
                outdated_reference_types: outdatedReferenceTypes,
            }
        })

        return {
            success: true,
            data: mapped,
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao listar perfis tributarios.'),
        }
    }
}

export async function getProductTaxProfileUsageAction(
    taxProfileId: string,
    limit = 200
): Promise<{ success: boolean; data?: ProductTaxProfileUsageItem[]; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(taxProfileId)) {
            throw new Error('Perfil tributario invalido.')
        }

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_list_product_tax_profile_usage', {
            p_tax_profile_id: taxProfileId,
            p_limit: Math.max(1, Math.min(500, limit)),
        })

        if (error) throw error
        return { success: true, data: (data || []) as ProductTaxProfileUsageItem[] }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao carregar produtos vinculados ao perfil.'),
        }
    }
}

export async function getProductTaxProfileDetailAction(
    taxProfileId: string
): Promise<{
    success: boolean
    data?: {
        profile: ProductTaxProfileInput & { id: string; version?: number; createdAt?: string; updatedAt?: string }
        rules: ProductTaxProfileRuleInput[]
    }
    error?: string
}> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(taxProfileId)) {
            throw new Error('Perfil tributario invalido.')
        }

        const adminSupabase = createServiceRoleClient()
        const [{ data: profile, error: profileError }, { data: rules, error: rulesError }] = await Promise.all([
            adminSupabase
                .from('product_tax_profiles')
                .select('*')
                .eq('id', taxProfileId)
                .single(),
            adminSupabase
                .from('product_tax_profile_rules')
                .select('*')
                .eq('tax_profile_id', taxProfileId)
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false }),
        ])

        if (profileError || !profile) throw profileError || new Error('Perfil tributario nao encontrado.')
        if (rulesError) throw rulesError

        return {
            success: true,
            data: {
                profile: {
                    id: profile.id,
                    name: profile.name,
                    code: profile.code,
                    description: profile.description,
                    ncm: profile.ncm,
                    cest: profile.cest,
                    originCode: profile.origin_code,
                    commercialUnit: profile.commercial_unit,
                    taxUnit: profile.tax_unit,
                    eanGtin: profile.ean_gtin,
                    taxEanGtin: profile.tax_ean_gtin,
                    defaultFiscalDescription: profile.default_fiscal_description,
                    fiscalType: profile.fiscal_type,
                    itemType: profile.item_type,
                    hasSubstitutionTax: profile.has_substitution_tax,
                    requiresCest: profile.requires_cest,
                    hasIpi: profile.has_ipi,
                    ipiCstOut: profile.ipi_cst_out,
                    ipiEnquadramentoCodigo: profile.ipi_enquadramento_codigo,
                    pisCst: profile.pis_cst,
                    cofinsCst: profile.cofins_cst,
                    pisAliquota: profile.pis_aliquota,
                    cofinsAliquota: profile.cofins_aliquota,
                    defaultOutputCfop: profile.default_output_cfop,
                    defaultInputCfop: profile.default_input_cfop,
                    internalFiscalCode: profile.internal_fiscal_code,
                    defaultFiscalNotes: profile.default_fiscal_notes,
                    isActive: profile.is_active,
                    requiresTaxConfiguration: profile.requires_tax_configuration,
                    futureTaxPayload: profile.future_tax_payload,
                    metadata: profile.metadata_jsonb,
                    ncmReferenceId: profile.ncm_reference_id,
                    ncmVersionId: profile.ncm_version_id,
                    tipiReferenceId: profile.tipi_reference_id,
                    tipiVersionId: profile.tipi_version_id,
                    cestReferenceId: profile.cest_reference_id,
                    cestVersionId: profile.cest_version_id,
                    defaultOutputCfopReferenceId: profile.default_output_cfop_reference_id,
                    defaultOutputCfopVersionId: profile.default_output_cfop_version_id,
                    defaultInputCfopReferenceId: profile.default_input_cfop_reference_id,
                    defaultInputCfopVersionId: profile.default_input_cfop_version_id,
                    fiscalReferenceSnapshot: profile.fiscal_reference_snapshot_jsonb,
                    version: profile.version,
                    createdAt: profile.created_at,
                    updatedAt: profile.updated_at,
                },
                rules: ((rules || []) as Array<Record<string, unknown>>).map((rule) => ({
                    id: String(rule.id),
                    ruleName: String(rule.rule_name || ''),
                    operationDirection: (rule.operation_direction as 'outbound' | 'inbound') || 'outbound',
                    originUf: (rule.origin_uf as string | null) || null,
                    destinationUf: (rule.destination_uf as string | null) || null,
                    customerTypeId: (rule.customer_type_id as string | null) || null,
                    personType: (rule.person_type as 'individual' | 'legal_entity' | null) || null,
                    taxpayerIndicator:
                        (rule.taxpayer_indicator as 'contributor' | 'non_contributor' | 'exempt' | null) || null,
                    cfopOverride: (rule.cfop_override as string | null) || null,
                    priority: Number(rule.priority || 0),
                    isActive: rule.is_active !== false,
                    effectiveFrom: (rule.effective_from as string | null) || null,
                    effectiveTo: (rule.effective_to as string | null) || null,
                    rulePayload: (rule.rule_payload_jsonb as Record<string, unknown> | null) || null,
                    futureTaxPayload: (rule.future_tax_payload as Record<string, unknown> | null) || null,
                })),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao carregar detalhes do perfil tributario.'),
        }
    }
}

export async function upsertProductTaxProfileAction(
    input: ProductTaxProfileInput
): Promise<{ success: boolean; data?: { taxProfileId: string; created: boolean; version: number }; error?: string }> {
    try {
        await ensureAdminAccess()

        if (!input.name?.trim()) throw new Error('Nome do perfil tributario e obrigatorio.')
        if (!input.code?.trim()) throw new Error('Codigo do perfil tributario e obrigatorio.')

        const adminSupabase = createServiceRoleClient()
        const fiscalReferenceSnapshot = await buildFiscalReferenceSnapshot(adminSupabase, input)
        if (input.ncmReferenceId && !fiscalReferenceSnapshot.ncm) {
            throw new Error('A referência de NCM informada não foi encontrada na base fiscal.')
        }
        if (input.tipiReferenceId && !fiscalReferenceSnapshot.tipi) {
            throw new Error('A referência de TIPI informada não foi encontrada na base fiscal.')
        }
        if (input.cestReferenceId && !fiscalReferenceSnapshot.cest) {
            throw new Error('A referência de CEST informada não foi encontrada na base fiscal.')
        }
        if (input.defaultOutputCfopReferenceId && !fiscalReferenceSnapshot.default_output_cfop) {
            throw new Error('A referência de CFOP de saída informada não foi encontrada na base fiscal.')
        }
        if (input.defaultInputCfopReferenceId && !fiscalReferenceSnapshot.default_input_cfop) {
            throw new Error('A referência de CFOP de entrada informada não foi encontrada na base fiscal.')
        }
        const ncmFromReference = (fiscalReferenceSnapshot.ncm as { code?: string } | undefined)?.code || null
        const ncmVersionFromReference = (fiscalReferenceSnapshot.ncm as { version_id?: string } | undefined)?.version_id || null
        const cestFromReference = (fiscalReferenceSnapshot.cest as { code?: string } | undefined)?.code || null
        const cestVersionFromReference = (fiscalReferenceSnapshot.cest as { version_id?: string } | undefined)?.version_id || null
        const defaultOutputCfopFromReference =
            (fiscalReferenceSnapshot.default_output_cfop as { code?: string } | undefined)?.code || null
        const defaultOutputCfopVersionFromReference =
            (fiscalReferenceSnapshot.default_output_cfop as { version_id?: string } | undefined)?.version_id || null
        const defaultInputCfopFromReference =
            (fiscalReferenceSnapshot.default_input_cfop as { code?: string } | undefined)?.code || null
        const defaultInputCfopVersionFromReference =
            (fiscalReferenceSnapshot.default_input_cfop as { version_id?: string } | undefined)?.version_id || null
        const tipiVersionFromReference =
            (fiscalReferenceSnapshot.tipi as { version_id?: string } | undefined)?.version_id || null
        const defaultFiscalDescriptionFromReference =
            (fiscalReferenceSnapshot.ncm as { description?: string } | undefined)?.description || null

        const { data, error } = await adminSupabase.rpc('admin_upsert_product_tax_profile', {
            p_tax_profile_id: input.id ?? null,
            p_name: input.name.trim(),
            p_code: input.code.trim(),
            p_description: sanitizeFiscalCode(input.description),
            p_ncm: sanitizeFiscalCode(ncmFromReference || input.ncm),
            p_cest: sanitizeFiscalCode(cestFromReference || input.cest),
            p_origin_code: sanitizeFiscalCode(input.originCode) ?? '0',
            p_commercial_unit: sanitizeFiscalCode(input.commercialUnit),
            p_tax_unit: sanitizeFiscalCode(input.taxUnit),
            p_ean_gtin: sanitizeFiscalCode(input.eanGtin),
            p_tax_ean_gtin: sanitizeFiscalCode(input.taxEanGtin),
            p_default_fiscal_description: sanitizeFiscalCode(
                input.defaultFiscalDescription || defaultFiscalDescriptionFromReference
            ),
            p_fiscal_type: sanitizeFiscalCode(input.fiscalType) ?? 'goods',
            p_item_type: sanitizeFiscalCode(input.itemType) ?? 'goods',
            p_has_substitution_tax: input.hasSubstitutionTax === true,
            p_requires_cest: input.requiresCest === true,
            p_has_ipi: input.hasIpi === true,
            p_ipi_cst_out: sanitizeFiscalCode(input.ipiCstOut),
            p_ipi_enquadramento_codigo: sanitizeFiscalCode(input.ipiEnquadramentoCodigo),
            p_pis_cst: sanitizeFiscalCode(input.pisCst),
            p_cofins_cst: sanitizeFiscalCode(input.cofinsCst),
            p_pis_aliquota: input.pisAliquota ?? null,
            p_cofins_aliquota: input.cofinsAliquota ?? null,
            p_default_output_cfop: sanitizeFiscalCode(defaultOutputCfopFromReference || input.defaultOutputCfop),
            p_default_input_cfop: sanitizeFiscalCode(defaultInputCfopFromReference || input.defaultInputCfop),
            p_internal_fiscal_code: sanitizeFiscalCode(input.internalFiscalCode),
            p_default_fiscal_notes: sanitizeFiscalCode(input.defaultFiscalNotes),
            p_is_active: input.isActive !== false,
            p_requires_tax_configuration: input.requiresTaxConfiguration !== false,
            p_future_tax_payload: sanitizeJsonPayload(input.futureTaxPayload),
            p_metadata_jsonb: sanitizeJsonPayload(input.metadata),
            p_ncm_reference_id: input.ncmReferenceId ?? null,
            p_ncm_version_id: ncmVersionFromReference,
            p_tipi_reference_id: input.tipiReferenceId ?? null,
            p_tipi_version_id: tipiVersionFromReference,
            p_cest_reference_id: input.cestReferenceId ?? null,
            p_cest_version_id: cestVersionFromReference,
            p_default_output_cfop_reference_id: input.defaultOutputCfopReferenceId ?? null,
            p_default_output_cfop_version_id: defaultOutputCfopVersionFromReference,
            p_default_input_cfop_reference_id: input.defaultInputCfopReferenceId ?? null,
            p_default_input_cfop_version_id: defaultInputCfopVersionFromReference,
            p_fiscal_reference_snapshot_jsonb: {
                ...sanitizeJsonPayload(input.fiscalReferenceSnapshot),
                ...fiscalReferenceSnapshot,
            },
        })

        if (error) throw error
        const row = Array.isArray(data) ? data[0] : data
        if (!row?.tax_profile_id) {
            throw new Error('Falha ao salvar perfil tributario.')
        }

        return {
            success: true,
            data: {
                taxProfileId: row.tax_profile_id as string,
                created: Boolean(row.created),
                version: Number(row.version || 1),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao salvar perfil tributario.'),
        }
    }
}

export async function duplicateProductTaxProfileAction(
    taxProfileId: string,
    options?: { newName?: string; newCode?: string }
): Promise<{ success: boolean; data?: { taxProfileId: string; name: string; code: string }; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(taxProfileId)) throw new Error('Perfil tributario invalido.')

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_duplicate_product_tax_profile', {
            p_tax_profile_id: taxProfileId,
            p_new_name: sanitizeFiscalCode(options?.newName),
            p_new_code: sanitizeFiscalCode(options?.newCode),
        })
        if (error) throw error

        const row = Array.isArray(data) ? data[0] : data
        if (!row?.new_tax_profile_id) throw new Error('Falha ao duplicar perfil tributario.')

        return {
            success: true,
            data: {
                taxProfileId: row.new_tax_profile_id as string,
                name: (row.new_name as string) || '',
                code: (row.new_code as string) || '',
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao duplicar perfil tributario.'),
        }
    }
}

export async function toggleProductTaxProfileStatusAction(
    taxProfileId: string,
    isActive: boolean
): Promise<{ success: boolean; data?: { taxProfileId: string; isActive: boolean; version: number }; error?: string }> {
    try {
        await ensureAdminAccess()
        if (!isValidUuid(taxProfileId)) throw new Error('Perfil tributario invalido.')

        const adminSupabase = createServiceRoleClient()
        const { data, error } = await adminSupabase.rpc('admin_toggle_product_tax_profile_status', {
            p_tax_profile_id: taxProfileId,
            p_is_active: isActive,
        })
        if (error) throw error

        const row = Array.isArray(data) ? data[0] : data
        if (!row?.tax_profile_id) throw new Error('Falha ao atualizar status do perfil tributario.')

        return {
            success: true,
            data: {
                taxProfileId: row.tax_profile_id as string,
                isActive: Boolean(row.is_active),
                version: Number(row.version || 1),
            },
        }
    } catch (error: unknown) {
        return {
            success: false,
            error: getErrorMessage(error, 'Erro ao atualizar status do perfil tributario.'),
        }
    }
}
