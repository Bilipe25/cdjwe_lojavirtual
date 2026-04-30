'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

async function requireAdminContext() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Nao autenticado.')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (error || profile?.role !== 'admin') {
    throw new Error('Permissao negada.')
  }

  return {
    supabase,
    admin: createServiceRoleClient(),
    userId: user.id,
  }
}

function revalidateRepresentativeReadyDelivery(representativeId: string) {
  ;['inventory', 'builder', 'products', 'orders', 'dashboard'].forEach((segment) => {
    try {
      revalidateTag(`sales:representative:${representativeId}:${segment}`, 'max')
    } catch {
      // Best effort only.
    }
  })
}

export async function getReadyDeliveryRepresentatives() {
  const { admin } = await requireAdminContext()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, status')
    .eq('role', 'representative')
    .order('full_name', { ascending: true })

  if (error) {
    throw new Error(error.message || 'Nao foi possivel carregar representantes.')
  }

  return data || []
}

export async function getReadyDeliveryStockOverview() {
  const { admin } = await requireAdminContext()
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
      representative:profiles(id, full_name, email),
      product_variant:product_variants(
        id,
        sku,
        image_url,
        stock_quantity,
        product:products(id, name, slug, base_price),
        fabric:fabrics(id, name),
        fabric_color:fabric_colors(id, name, hex_code, image_url)
      ),
      size_option:product_size_options(id, name)
    `)
    .order('quantity_available', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message || 'Nao foi possivel carregar estoque por representante.')
  }

  return data || []
}

export async function getReadyDeliveryTransferOptions() {
  const { admin } = await requireAdminContext()
  const [representativesRes, variantsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, status')
      .eq('role', 'representative')
      .eq('status', 'approved')
      .order('full_name', { ascending: true }),
    admin
      .from('product_variants')
      .select(`
        id,
        sku,
        stock_quantity,
        product:products(id, name, has_size_variants, size_options:product_size_options(id, name, is_active, sort_order)),
        fabric:fabrics(id, name),
        fabric_color:fabric_colors(id, name)
      `)
      .eq('is_active', true)
      .order('stock_quantity', { ascending: false })
      .limit(250),
  ])

  if (representativesRes.error) {
    throw new Error(representativesRes.error.message || 'Nao foi possivel carregar representantes.')
  }

  if (variantsRes.error) {
    throw new Error(variantsRes.error.message || 'Nao foi possivel carregar produtos para transferencia.')
  }

  return {
    representatives: representativesRes.data || [],
    variants: variantsRes.data || [],
  }
}

export async function transferRepresentativeStockFormAction(formData: FormData) {
  const { supabase } = await requireAdminContext()
  const representativeId = String(formData.get('representativeId') || '').trim()
  const variantChoice = String(formData.get('variantChoice') || '').trim()
  const [choiceVariantId, choiceSizeOptionId] = variantChoice.split('::')
  const variantId = (choiceVariantId || String(formData.get('variantId') || '')).trim()
  const sizeOptionId = choiceSizeOptionId && choiceSizeOptionId !== 'legacy'
    ? choiceSizeOptionId
    : String(formData.get('sizeOptionId') || '').trim() || null
  const quantity = Number(formData.get('quantity') || 0)
  const notes = String(formData.get('notes') || '').trim() || null

  if (!representativeId || !variantId || !Number.isFinite(quantity) || quantity <= 0) {
    redirect('/admin/orders/pronta-entrega/transferir?error=invalid')
  }

  const { error } = await supabase.rpc('admin_transfer_representative_stock_atomic', {
    p_representative_id: representativeId,
    p_items: [
      {
        product_variant_id: variantId,
        size_option_id: sizeOptionId,
        quantity: Math.floor(quantity),
      },
    ],
    p_notes: notes,
  })

  if (error) {
    redirect(`/admin/orders/pronta-entrega/transferir?error=${encodeURIComponent(error.message || 'transfer')}`)
  }

  revalidatePath('/admin/orders/pronta-entrega/estoque')
  revalidatePath('/admin/orders/pronta-entrega/transferir')
  revalidatePath('/admin/orders/pronta-entrega/movimentacoes')
  revalidateRepresentativeReadyDelivery(representativeId)
  redirect('/admin/orders/pronta-entrega/transferir?success=1')
}

export async function getReadyDeliveryMovements() {
  const { admin } = await requireAdminContext()
  const { data, error } = await admin
    .from('representative_stock_movements')
    .select(`
      id,
      representative_id,
      product_variant_id,
      size_option_id,
      movement_type,
      quantity_delta,
      quantity_available_after,
      quantity_reserved_after,
      quantity_sold_after,
      order_id,
      transfer_id,
      notes,
      metadata,
      created_at,
      representative:profiles(id, full_name, email),
      product_variant:product_variants(
        id,
        sku,
        product:products(id, name),
        fabric:fabrics(id, name),
        fabric_color:fabric_colors(id, name)
      ),
      size_option:product_size_options(id, name),
      order:orders(id, order_number, total, status)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message || 'Nao foi possivel carregar movimentacoes.')
  }

  return data || []
}

export async function getReadyDeliveryReceipts() {
  const { admin } = await requireAdminContext()
  const { data, error } = await admin
    .from('representative_receipts')
    .select(`
      id,
      receipt_number,
      status,
      issued_at,
      representative:profiles(id, full_name, email),
      order:orders(id, order_number, total, payment_status, status, created_at, store:stores(id, company_name, trade_name))
    `)
    .order('issued_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message || 'Nao foi possivel carregar recibos.')
  }

  return data || []
}

export async function getReadyDeliveryClosings() {
  const { admin } = await requireAdminContext()
  const { data, error } = await admin
    .from('representative_day_closings')
    .select(`
      id,
      closing_number,
      representative_id,
      business_date,
      route_label,
      status,
      orders_count,
      items_count,
      gross_amount,
      received_amount,
      submitted_at,
      approved_at,
      representative:profiles(id, full_name, email)
    `)
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw new Error(error.message || 'Nao foi possivel carregar fechamentos.')
  }

  return data || []
}
