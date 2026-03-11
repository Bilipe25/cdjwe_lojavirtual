'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'O nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean(),
  sort_order: z.number().int().optional(),
})

function slugify(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function saveCategory(formData: any) {
  const result = categorySchema.safeParse(formData)
  
  if (!result.success) {
    return { error: 'Dados inválidos.', details: result.error.flatten().fieldErrors }
  }

  let { id, name, description, parent_id, image_url, is_active } = result.data
  parent_id = parent_id === '' ? null : parent_id
  const slug = slugify(name)

  const supabase = await createClient()

  // --- CYCLIC REFERENCE PROTECTION (A -> B -> A) ---
  if (id && parent_id) {
    if (id === parent_id) {
        return { error: 'Uma categoria não pode ser pai dela mesma.' }
    }
    
    // Check if the requested parent is fundamentally a child of this category
    // E.g., setting "Eletronics" parent to "TVs" when "TVs" is already under "Eletronics".
    let currentCheckId = parent_id
    let maxDepth = 10 // safety limit
    
    while(currentCheckId && maxDepth > 0) {
        if (currentCheckId === id) {
            return { error: 'Referência Circular Detectada: A categoria pai selecionada já é uma descendente desta categoria atual.'}
        }
        
        const { data: pNode } = await supabase.from('categories').select('parent_id').eq('id', currentCheckId).single()
        currentCheckId = pNode?.parent_id || null
        maxDepth--
    }
  }

  try {
    if (id) {
      // Update
      const { error } = await supabase
        .from('categories')
        .update({
          name,
          slug,
          description,
          parent_id,
          image_url,
          is_active
        })
        .eq('id', id)

      if (error) {
          if (error.message.includes('unique')) return { error: 'Já existe uma categoria com este nome.' }
          throw error
      }
    } else {
      // Create
      const { data: mx } = await supabase
        .from('categories')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        
      const nextSortOrder = (mx && mx.length > 0) ? mx[0].sort_order + 1 : 1

      const { error } = await supabase
        .from('categories')
        .insert({
          name,
          slug,
          description,
          parent_id,
          image_url,
          is_active,
          sort_order: nextSortOrder
        })

      if (error) {
          if (error.message.includes('unique')) return { error: 'Já existe uma categoria com este nome.' }
          throw error
      }
    }

    revalidatePath('/admin/categories')
    revalidatePath('/admin/products')
    revalidatePath('/catalog')
    return { success: true }
  } catch (error: any) {
    console.error('Error saving category:', error)
    return { error: error.message || 'Ocorreu um erro ao salvar a categoria.' }
  }
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()

  try {
    // PROTEÇÃO 1: Check de Filhas (Cascade Check)
    const { data: children, error: childrenError } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', id)
      .limit(1)
      
    if (childrenError) throw childrenError
    if (children && children.length > 0) {
        return { error: 'Exclusão Bloqueada: Esta categoria possui subcategorias. Remova ou altere o pai delas primeiro.'}
    }

    // PROTEÇÃO 2: Check de Produtos Vinculados
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id')
        .eq('category_id', id)
        .limit(1)

    if (prodError) throw prodError
    if (products && products.length > 0) {
        return { error: 'Exclusão Bloqueada: Existem produtos vinculados a esta categoria. Altere a categoria desses produtos primeiro.'}
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/categories')
    revalidatePath('/admin/products')
    revalidatePath('/catalog')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting category:', error)
    return { error: error.message || 'Ocorreu um erro ao excluir a categoria.' }
  }
}

export async function reorderCategories(updates: { id: string, sort_order: number }[]) {
  const supabase = await createClient()

  try {
    // Supabase JS doesn't have an easy bulk update out of the box without mapped RPCs, 
    // so we iterate promises but handle errors strictly.
    const promises = updates.map(update => 
      supabase
        .from('categories')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)
    )

    const results = await Promise.all(promises)
    const hasError = results.some((r: any) => r.error)

    if (hasError) {
      return { error: 'Falha ao reordenar uma ou mais categorias no banco. A página será recarregada.' }
    }

    revalidatePath('/admin/categories')
    return { success: true }
  } catch (error: any) {
    console.error('Error reordering categories:', error)
    return { error: error.message || 'Ocorreu um erro ao reordenar.' }
  }
}
