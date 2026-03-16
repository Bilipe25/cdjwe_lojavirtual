'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface UpsertProductDomainInput {
    productId?: string | null
    name: string
    slug: string
    description?: string | null
    categoryId: string
    size?: string | null
    basePrice: number
    isActive: boolean
    isFeatured: boolean
    activeVariantIds?: string[] | null
    variantPriceOverrides?: Record<string, number | null> | null
    operationId?: string
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
        size: input.size?.trim() ? input.size.trim() : null,
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
            p_size: input.size?.trim() ? input.size.trim() : null,
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
