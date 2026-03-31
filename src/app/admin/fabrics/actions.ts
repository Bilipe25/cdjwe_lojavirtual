'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { fabricSchema, fabricColorSchema, type FabricFormData, type FabricColorFormData } from './schema'

type ActionError = { error: string }

type DeleteEntityResult = {
  success: true
  mode: 'deleted' | 'deactivated'
  impactedVariants: number
  message: string
}

type BulkColorStatus = 'deleted' | 'deactivated' | 'blocked'

type BulkColorItemResult = {
  colorId: string
  status: BulkColorStatus
  variantCount: number
  reason?: string
}

export type BulkColorDeleteResult =
  | {
      success: true
      message: string
      summary: {
        requested: number
        deleted: number
        deactivated: number
        blocked: number
      }
      items: BulkColorItemResult[]
    }
  | ActionError

export type BulkColorToggleResult =
  | {
      success: true
      message: string
      requested: number
      updatedIds: string[]
      blockedIds: string[]
    }
  | ActionError

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function isMissingFabricAuditTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
  return code === '42P01' || message.toLowerCase().includes('admin_fabric_actions_audit')
}

async function requireAdminContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, userId: null as string | null, error: 'Nao autorizado.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { supabase, userId: user.id, error: 'Acesso negado.' }
  }

  return { supabase, userId: user.id, error: null as string | null }
}

async function appendFabricAuditLog(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  actorProfileId: string | null
  action: string
  fabricId?: string | null
  colorId?: string | null
  details?: Record<string, unknown>
}) {
  const { error } = await params.supabase
    .from('admin_fabric_actions_audit')
    .insert({
      actor_profile_id: params.actorProfileId,
      action: params.action,
      fabric_id: params.fabricId || null,
      fabric_color_id: params.colorId || null,
      details: params.details || {},
    })

  if (!error) return
  if (isMissingFabricAuditTableError(error)) return
  console.warn('[FABRICS_AUDIT] log skipped:', error)
}

// ==================== FABRIC ACTIONS ====================

export async function saveFabric(payload: FabricFormData) {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  const result = fabricSchema.safeParse(payload)
  if (!result.success) {
    return { error: `Dados invalidos: ${result.error.issues[0].message}` }
  }

  const data = result.data
  const slug = slugify(data.name)

  try {
    let fabricId = data.id || ''
    let created = false

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from('fabrics')
        .update({
          name: data.name,
          slug,
          description: data.description,
          price_modifier: data.price_modifier,
          image_url: data.image_url,
          is_active: data.is_active,
        })
        .eq('id', data.id)
        .select('id')
        .single()

      if (error || !updated?.id) throw error || new Error('Tecido nao encontrado para atualizacao.')
      fabricId = updated.id
    } else {
      const { data: maxOrderData } = await context.supabase
        .from('fabrics')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextSortOrder = (maxOrderData?.sort_order || 0) + 1
      const { data: inserted, error } = await context.supabase
        .from('fabrics')
        .insert({
          name: data.name,
          slug,
          description: data.description,
          price_modifier: data.price_modifier,
          image_url: data.image_url,
          is_active: data.is_active,
          sort_order: nextSortOrder,
        })
        .select('id')
        .single()

      if (error || !inserted?.id) throw error || new Error('Falha ao criar tecido.')
      fabricId = inserted.id
      created = true
    }

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: created ? 'fabric_created' : 'fabric_updated',
      fabricId,
      details: {
        is_active: data.is_active,
        price_modifier: data.price_modifier,
      },
    })

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: unknown) {
    return { error: `Erro ao salvar tecido: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function deleteFabric(id: string): Promise<DeleteEntityResult | ActionError> {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  try {
    const { count, error: countError } = await context.supabase
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('fabric_id', id)

    if (countError) throw countError

    const impactedVariants = count || 0
    if (impactedVariants > 0) {
      const { error: deactivateError } = await context.supabase
        .from('fabrics')
        .update({ is_active: false })
        .eq('id', id)

      if (deactivateError) throw deactivateError

      await appendFabricAuditLog({
        supabase: context.supabase,
        actorProfileId: context.userId,
        action: 'fabric_deactivated',
        fabricId: id,
        details: { impactedVariants },
      })

      revalidatePath('/admin/fabrics')
      return {
        success: true,
        mode: 'deactivated',
        impactedVariants,
        message: `Tecido inativado porque existem ${impactedVariants} variante(s) vinculadas.`,
      }
    }

    const { error: colorError } = await context.supabase.from('fabric_colors').delete().eq('fabric_id', id)
    if (colorError) throw colorError

    const { error } = await context.supabase.from('fabrics').delete().eq('id', id)
    if (error) throw error

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: 'fabric_deleted',
      fabricId: id,
      details: { impactedVariants: 0 },
    })

    revalidatePath('/admin/fabrics')
    return {
      success: true,
      mode: 'deleted',
      impactedVariants: 0,
      message: 'Tecido excluido definitivamente.',
    }
  } catch (error: unknown) {
    return { error: `Erro ao processar tecido: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function reorderFabrics(fabricIds: string[]) {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  try {
    const updates = fabricIds.map((id, index) => ({ id, sort_order: index }))
    const { error } = await context.supabase.from('fabrics').upsert(updates)
    if (error) throw error

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: 'fabrics_reordered',
      details: { count: fabricIds.length },
    })

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: unknown) {
    return { error: `Erro ao reordenar tecidos: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

// ==================== COLOR ACTIONS ====================
export async function saveColor(payload: FabricColorFormData) {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  const result = fabricColorSchema.safeParse(payload)
  if (!result.success) {
    return { error: `Dados invalidos: ${result.error.issues[0].message}` }
  }

  const data = result.data

  try {
    let colorId = data.id || ''
    let created = false

    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from('fabric_colors')
        .update({
          name: data.name,
          hex_code: data.hex_code,
          image_url: data.image_url,
          is_active: data.is_active,
        })
        .eq('id', data.id)
        .select('id, fabric_id')
        .single()

      if (error || !updated?.id) throw error || new Error('Cor nao encontrada para atualizacao.')
      colorId = updated.id
    } else {
      const { data: maxOrderData } = await context.supabase
        .from('fabric_colors')
        .select('sort_order')
        .eq('fabric_id', data.fabric_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextSortOrder = (maxOrderData?.sort_order || 0) + 1
      const { data: inserted, error } = await context.supabase
        .from('fabric_colors')
        .insert({
          fabric_id: data.fabric_id,
          name: data.name,
          hex_code: data.hex_code,
          image_url: data.image_url,
          is_active: data.is_active,
          sort_order: nextSortOrder,
        })
        .select('id')
        .single()

      if (error || !inserted?.id) throw error || new Error('Falha ao criar cor.')
      colorId = inserted.id
      created = true
    }

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: created ? 'color_created' : 'color_updated',
      fabricId: data.fabric_id,
      colorId,
      details: {
        is_active: data.is_active,
        has_image: Boolean(data.image_url),
      },
    })

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: unknown) {
    return { error: `Erro ao salvar cor: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function deleteColor(id: string): Promise<DeleteEntityResult | ActionError> {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  try {
    const { count, error: countError } = await context.supabase
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('fabric_color_id', id)

    if (countError) throw countError

    const impactedVariants = count || 0
    if (impactedVariants > 0) {
      const { error: deactivateError } = await context.supabase
        .from('fabric_colors')
        .update({ is_active: false })
        .eq('id', id)

      if (deactivateError) throw deactivateError

      await appendFabricAuditLog({
        supabase: context.supabase,
        actorProfileId: context.userId,
        action: 'color_deactivated',
        colorId: id,
        details: { impactedVariants },
      })

      revalidatePath('/admin/fabrics')
      return {
        success: true,
        mode: 'deactivated',
        impactedVariants,
        message: `Cor inativada porque existem ${impactedVariants} variante(s) vinculadas.`,
      }
    }

    const { error } = await context.supabase.from('fabric_colors').delete().eq('id', id)
    if (error) throw error

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: 'color_deleted',
      colorId: id,
      details: { impactedVariants: 0 },
    })

    revalidatePath('/admin/fabrics')
    return {
      success: true,
      mode: 'deleted',
      impactedVariants: 0,
      message: 'Cor excluida definitivamente.',
    }
  } catch (error: unknown) {
    return { error: `Erro ao processar cor: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function reorderColors(colorIds: string[]) {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  try {
    const updates = colorIds.map((id, index) => ({ id, sort_order: index }))
    const { error } = await context.supabase.from('fabric_colors').upsert(updates)
    if (error) throw error

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: 'colors_reordered',
      details: { count: colorIds.length },
    })

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: unknown) {
    return { error: `Erro ao reordenar cores: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function setColorsActiveBulk(
  colorIds: string[],
  isActive: boolean
): Promise<BulkColorToggleResult> {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  const requestedIds = Array.from(new Set(colorIds.filter(Boolean)))
  if (requestedIds.length === 0) {
    return { error: 'Nenhuma cor valida foi informada para operacao em lote.' }
  }

  try {
    const { data: existingRows, error: existingError } = await context.supabase
      .from('fabric_colors')
      .select('id')
      .in('id', requestedIds)

    if (existingError) throw existingError

    const existingIds = (existingRows || []).map((row) => row.id)
    const blockedIds = requestedIds.filter((id) => !existingIds.includes(id))

    if (existingIds.length > 0) {
      const { error: updateError } = await context.supabase
        .from('fabric_colors')
        .update({ is_active: isActive })
        .in('id', existingIds)

      if (updateError) throw updateError
    }

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: isActive ? 'colors_bulk_activated' : 'colors_bulk_deactivated',
      details: {
        requested: requestedIds.length,
        updated: existingIds.length,
        blocked: blockedIds.length,
      },
    })

    revalidatePath('/admin/fabrics')
    return {
      success: true,
      message: `${existingIds.length} cor(es) ${isActive ? 'ativada(s)' : 'inativada(s)'} em lote.`,
      requested: requestedIds.length,
      updatedIds: existingIds,
      blockedIds,
    }
  } catch (error: unknown) {
    return { error: `Erro no lote de cores: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}

export async function deleteSelectedColors(colorIds: string[]): Promise<BulkColorDeleteResult> {
  const context = await requireAdminContext()
  if (context.error) return { error: context.error }

  const requestedIds = Array.from(new Set(colorIds.filter(Boolean)))
  if (requestedIds.length === 0) {
    return { error: 'Nenhuma cor valida foi informada para exclusao em lote.' }
  }

  try {
    const [colorsRes, variantsRes] = await Promise.all([
      context.supabase
        .from('fabric_colors')
        .select('id')
        .in('id', requestedIds),
      context.supabase
        .from('product_variants')
        .select('fabric_color_id')
        .in('fabric_color_id', requestedIds),
    ])

    if (colorsRes.error) throw colorsRes.error
    if (variantsRes.error) throw variantsRes.error

    const existingIds = new Set((colorsRes.data || []).map((row) => row.id))
    const variantCounts = (variantsRes.data || []).reduce((acc, row) => {
      const key = row.fabric_color_id
      if (!key) return acc
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const items: BulkColorItemResult[] = []

    for (const colorId of requestedIds) {
      if (!existingIds.has(colorId)) {
        items.push({
          colorId,
          status: 'blocked',
          variantCount: 0,
          reason: 'Cor nao encontrada.',
        })
        continue
      }

      const variantCount = variantCounts[colorId] || 0

      if (variantCount > 0) {
        const { error: deactivateError } = await context.supabase
          .from('fabric_colors')
          .update({ is_active: false })
          .eq('id', colorId)

        if (deactivateError) {
          items.push({
            colorId,
            status: 'blocked',
            variantCount,
            reason: normalizeErrorMessage(deactivateError, 'Falha ao inativar cor com vinculos.'),
          })
          continue
        }

        items.push({
          colorId,
          status: 'deactivated',
          variantCount,
          reason: `Cor inativada por possuir ${variantCount} variante(s) vinculada(s).`,
        })
        continue
      }

      const { error: deleteError } = await context.supabase
        .from('fabric_colors')
        .delete()
        .eq('id', colorId)

      if (deleteError) {
        items.push({
          colorId,
          status: 'blocked',
          variantCount,
          reason: normalizeErrorMessage(deleteError, 'Falha ao excluir cor.'),
        })
        continue
      }

      items.push({
        colorId,
        status: 'deleted',
        variantCount,
      })
    }

    const deleted = items.filter((item) => item.status === 'deleted').length
    const deactivated = items.filter((item) => item.status === 'deactivated').length
    const blocked = items.filter((item) => item.status === 'blocked').length

    await appendFabricAuditLog({
      supabase: context.supabase,
      actorProfileId: context.userId,
      action: 'colors_bulk_delete_or_deactivate',
      details: {
        requested: requestedIds.length,
        deleted,
        deactivated,
        blocked,
      },
    })

    revalidatePath('/admin/fabrics')

    return {
      success: true,
      message: `${deleted} excluida(s), ${deactivated} inativada(s) e ${blocked} bloqueada(s).`,
      summary: {
        requested: requestedIds.length,
        deleted,
        deactivated,
        blocked,
      },
      items,
    }
  } catch (error: unknown) {
    return { error: `Erro ao executar lote de exclusao: ${normalizeErrorMessage(error, 'Falha inesperada.')}` }
  }
}
