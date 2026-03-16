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
type ProductAuditAction =
    | 'product_domain_upsert'
    | 'product_images_metadata_save'
    | 'product_images_signed_url_batch_create'
    | 'product_images_signed_upload_cleanup'

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
        const marker = '/storage/v1/object/public/products/'
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
        if (error) throw error

        const row = Array.isArray(data) ? (data[0] as ProductRpcRow | undefined) : undefined
        if (!row?.product_id) {
            throw new Error('Falha ao persistir dados do produto.')
        }

        resolvedProductId = row.product_id
        await logProductAuditEvent({
            operationId,
            actorProfileId,
            productId: resolvedProductId,
            action: 'product_domain_upsert',
            success: true,
            payload: {
                created: Boolean(row.created),
                variantsInserted: Number(row.variants_inserted || 0),
                variantConfigTouched: input.activeVariantIds !== undefined && input.activeVariantIds !== null,
                variantPricingTouched: input.variantPriceOverrides !== undefined && input.variantPriceOverrides !== null,
            },
        })

        return {
            success: true,
            productId: row.product_id,
            created: Boolean(row.created),
            variantsInserted: Number(row.variants_inserted || 0),
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro ao salvar produto.'
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
        if (error) throw error

        const row = Array.isArray(data) ? (data[0] as ProductImagesRpcRow | undefined) : undefined
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
            payload: {
                deletedCount: (row.deleted_urls ?? []).length,
                insertedCount: (row.inserted_image_ids ?? []).length,
                totalImages: row.total_images,
                primaryImageId: row.primary_image_id,
            },
        })

        return {
            success: true,
            primaryImageId: row.primary_image_id,
            totalImages: row.total_images,
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro ao salvar imagens do produto.'
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
        const message = error instanceof Error ? error.message : 'Erro ao gerar upload assinado.'
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
        const message = error instanceof Error ? error.message : 'Erro ao limpar uploads temporarios.'
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
