'use server'

import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  actionError,
  normalizeActionResult,
  parseWithSchema,
  representativeStockReservationPayloadSchema,
} from './contracts'

const SALES_REPRESENTATIVE_CACHE_NAMESPACE = 'sales:representative'

async function requireApprovedRepresentative() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuario nao autenticado.')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', user.id)
    .single()

  if (error || profile?.role !== 'representative' || profile.status !== 'approved') {
    throw new Error('Acesso restrito a representantes aprovados.')
  }

  return {
    supabase,
    admin: createServiceRoleClient(),
    representativeId: user.id,
  }
}

function revalidateRepresentativeInventory(representativeId: string) {
  const scopeKey = representativeId || 'admin-preview'
  ;['inventory', 'builder', 'products', 'orders', 'dashboard'].forEach((segment) => {
    try {
      revalidateTag(`${SALES_REPRESENTATIVE_CACHE_NAMESPACE}:${scopeKey}:${segment}`, 'max')
    } catch {
      // Revalidation is best-effort; the transaction already happened in the database.
    }
  })
}

export async function getRepresentativeStockData() {
  try {
    const { admin, representativeId } = await requireApprovedRepresentative()
    const { data, error } = await admin
      .from('representative_stock')
      .select(`
        id,
        representative_id,
        product_variant_id,
        size_option_id,
        quantity_available,
        quantity_reserved,
        quantity_sold,
        updated_at,
        product_variant:product_variants(
          id,
          sku,
          image_url,
          stock_quantity,
          product:products(id, name, slug, base_price, is_active),
          fabric:fabrics(id, name),
          fabric_color:fabric_colors(id, name, hex_code, image_url)
        ),
        size_option:product_size_options(id, name)
      `)
      .eq('representative_id', representativeId)
      .order('quantity_available', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) {
      return { success: false as const, error: error.message || 'Nao foi possivel carregar seu estoque.' }
    }

    return { success: true as const, items: data || [] }
  } catch (error) {
    return actionError(error, 'Nao foi possivel carregar seu estoque.', 'STOCK_LOAD_ERROR')
  }
}

export async function reserveRepresentativeStockAction(input: unknown) {
  try {
    const parsed = parseWithSchema(
      representativeStockReservationPayloadSchema,
      input,
      'representative_stock_reservation_payload'
    )
    const { supabase } = await requireApprovedRepresentative()

    const { data, error } = await supabase.rpc('representative_reserve_stock_atomic', {
      p_order_draft_id: parsed.orderDraftId,
      p_items: parsed.items.map((item) => ({
        product_variant_id: item.productVariantId,
        size_option_id: item.sizeOptionId || null,
        cart_key: item.cartKey || `${item.productVariantId}::${item.sizeOptionId || 'legacy'}`,
        quantity: item.quantity,
      })),
      p_ttl_minutes: 15,
    })

    if (error) {
      return {
        success: false as const,
        error: error.message || 'Nao foi possivel reservar o estoque do representante.',
      }
    }

    return normalizeActionResult({ success: true as const, positions: data || [] })
  } catch (error) {
    return actionError(error, 'Nao foi possivel reservar o estoque do representante.', 'STOCK_RESERVATION_ERROR')
  }
}

export async function releaseRepresentativeStockReservationAction(orderDraftId: string) {
  try {
    const draftId = String(orderDraftId || '').trim()
    if (draftId.length < 8) {
      return { success: false as const, error: 'Rascunho invalido para liberar reserva.' }
    }

    const { supabase } = await requireApprovedRepresentative()
    const { data, error } = await supabase.rpc('representative_release_stock_reservation_atomic', {
      p_order_draft_id: draftId,
    })

    if (error) {
      return {
        success: false as const,
        error: error.message || 'Nao foi possivel liberar a reserva do estoque.',
      }
    }

    return { success: true as const, released: Number(data || 0) }
  } catch (error) {
    return actionError(error, 'Nao foi possivel liberar a reserva do estoque.', 'STOCK_RELEASE_ERROR')
  }
}

export async function submitRepresentativeDayClosingAction(input?: {
  businessDate?: string | null
  routeLabel?: string | null
}) {
  try {
    const { supabase, representativeId } = await requireApprovedRepresentative()
    const businessDate = input?.businessDate || new Date().toISOString().slice(0, 10)
    const routeLabel = input?.routeLabel || null

    const { data, error } = await supabase.rpc('representative_submit_day_closing_atomic', {
      p_business_date: businessDate,
      p_route_label: routeLabel,
    })

    if (error) {
      return {
        success: false as const,
        error: error.message || 'Nao foi possivel fechar o dia.',
      }
    }

    revalidateRepresentativeInventory(representativeId)
    return { success: true as const, closingId: data as string }
  } catch (error) {
    return actionError(error, 'Nao foi possivel fechar o dia.', 'DAY_CLOSING_ERROR')
  }
}

export async function submitRepresentativeDayClosingFormAction(formData: FormData) {
  const businessDate = String(formData.get('businessDate') || '').trim() || null
  const routeLabel = String(formData.get('routeLabel') || '').trim() || null
  const result = await submitRepresentativeDayClosingAction({ businessDate, routeLabel })

  if (!result.success) {
    redirect(`/sales/stock?closingError=${encodeURIComponent(result.error || 'closing')}`)
  }

  redirect('/sales/stock?closingSuccess=1')
}
