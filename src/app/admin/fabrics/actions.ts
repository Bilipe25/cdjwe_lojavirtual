'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { fabricSchema, fabricColorSchema, type FabricFormData, type FabricColorFormData } from './schema'

// ==================== FABRIC ACTIONS ====================

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function saveFabric(payload: FabricFormData) {
  const supabase = await createClient()
  
  // 1. Authorization
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Acesso negado' }

  // 2. Validation
  const result = fabricSchema.safeParse(payload)
  if (!result.success) return { error: 'Dados inválidos: ' + result.error.issues[0].message }

  const data = result.data
  const slug = slugify(data.name)

  try {
    if (data.id) {
      const { error } = await supabase
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
      if (error) throw error
    } else {
      // Get max sort_order
      const { data: maxOrderData } = await supabase
        .from('fabrics')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()
        
      const nextSortOrder = maxOrderData ? (maxOrderData.sort_order || 0) + 1 : 0

      const { error } = await supabase
        .from('fabrics')
        .insert({
          name: data.name,
          slug,
          description: data.description,
          price_modifier: data.price_modifier,
          image_url: data.image_url,
          is_active: data.is_active,
          sort_order: nextSortOrder
        })
      if (error) throw error
    }

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    console.error('Error saving fabric:', error)
    return { error: 'Erro ao salvar: ' + error.message }
  }
}

export async function deleteFabric(id: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  try {
    // 1. Check if ANY variants use this fabric
    const { count, error: countError } = await supabase
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('fabric_id', id)

    if (countError) throw countError
    if (count && count > 0) {
      return { 
        error: `Não é possível excluir. Existem ${count} variante(s) de produto vinculada(s) a este tecido.` 
      }
    }

    // 2. Safely perform cascade delete if no variants exist
    // Assuming Supabase FKs to fabric_colors has ON DELETE CASCADE (which it usually does)
    // If not, we manually delete colors first.
    const { error: colorError } = await supabase.from('fabric_colors').delete().eq('fabric_id', id)
    if (colorError) throw colorError

    const { error } = await supabase.from('fabrics').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting fabric:', error)
    return { error: 'Erro ao excluir teclado: ' + error.message }
  }
}

export async function reorderFabrics(fabricIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  try {
    const updates = fabricIds.map((id, index) => ({ id, sort_order: index }))
    const { error } = await supabase.from('fabrics').upsert(updates)
    if (error) throw error

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    return { error: 'Erro ao reordenar: ' + error.message }
  }
}

// ==================== COLOR ACTIONS ====================

export async function saveColor(payload: FabricColorFormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  const result = fabricColorSchema.safeParse(payload)
  if (!result.success) return { error: 'Dados inválidos: ' + result.error.issues[0].message }

  const data = result.data

  try {
    if (data.id) {
      const { error } = await supabase
        .from('fabric_colors')
        .update({
          name: data.name,
          hex_code: data.hex_code,
          image_url: data.image_url,
          is_active: data.is_active,
        })
        .eq('id', data.id)
      if (error) throw error
    } else {
      // Get max sort_order for this fabric
      const { data: maxOrderData } = await supabase
        .from('fabric_colors')
        .select('sort_order')
        .eq('fabric_id', data.fabric_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()
        
      const nextSortOrder = maxOrderData ? (maxOrderData.sort_order || 0) + 1 : 0

      const { error } = await supabase
        .from('fabric_colors')
        .insert({
          fabric_id: data.fabric_id,
          name: data.name,
          hex_code: data.hex_code,
          image_url: data.image_url,
          is_active: data.is_active,
          sort_order: nextSortOrder
        })
      if (error) throw error
    }

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    return { error: 'Erro ao salvar cor: ' + error.message }
  }
}

export async function deleteColor(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  try {
    // 1. Check if variants use this specific color
    const { count, error: countError } = await supabase
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('fabric_color_id', id)

    if (countError) throw countError
    if (count && count > 0) {
      return { 
        error: `Não é possível excluir. Existem ${count} variante(s) de produto vinculada(s) a esta cor.` 
      }
    }

    const { error } = await supabase.from('fabric_colors').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    return { error: 'Erro ao excluir cor: ' + error.message }
  }
}

export async function reorderColors(colorIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  try {
    const updates = colorIds.map((id, index) => ({ id, sort_order: index }))
    const { error } = await supabase.from('fabric_colors').upsert(updates)
    if (error) throw error
    
    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    return { error: 'Erro ao reordenar cores: ' + error.message }
  }
}

export async function deleteSelectedColors(colorIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado' }

  try {
    // 1. Check if ANY of the selected colors is used in a variant
    for (const id of colorIds) {
      const { count, error: countError } = await supabase
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('fabric_color_id', id)

      if (countError) throw countError
      if (count && count > 0) {
        return { 
          error: `Ação cancelada: Uma ou mais cores selecionadas possuem variantes vinculadas.` 
        }
      }
    }

    const { error } = await supabase.from('fabric_colors').delete().in('id', colorIds)
    if (error) throw error

    revalidatePath('/admin/fabrics')
    return { success: true }
  } catch (error: any) {
    return { error: 'Erro ao excluir cores: ' + error.message }
  }
}
