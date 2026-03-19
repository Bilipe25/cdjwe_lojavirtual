'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    return fallback
}

const paymentConditionSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Nome é obrigatório').max(100),
    description: z.string().nullable().optional(),
    installments: z.number().int().min(1).max(100),
    discount_percentage: z.number().min(0).max(100),
    surcharge_percentage: z.number().min(0).max(100),
    min_installment_value: z.number().min(0).default(0),
    min_order_value: z.number().min(0).default(0),
    max_order_value: z.number().min(0).nullable().optional(),
    icon: z.string().nullable().optional(),
    is_active: z.boolean(),
    sort_order: z.number().int().optional(),
})

const paymentMethodSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, 'Nome é obrigatório').max(80),
    description: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    is_active: z.boolean(),
    sort_order: z.number().int().optional(),
})

const paymentMethodAssignmentsSchema = z.object({
    methodId: z.string().min(1, 'Meio de pagamento inválido'),
    assignments: z.array(
        z.object({
            payment_condition_id: z.string().min(1),
            is_active: z.boolean(),
            sort_order: z.number().int().min(1),
        })
    ),
})

function revalidatePaymentPaths() {
    revalidatePath('/admin/payment-conditions')
    revalidatePath('/cart')
}

function slugifyPaymentMethodCode(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
}

async function buildUniquePaymentMethodCode(baseName: string, currentId?: string) {
    const supabase = await createClient()
    const baseCode = slugifyPaymentMethodCode(baseName) || 'meio-pagamento'

    const { data, error } = await supabase
        .from('payment_methods')
        .select('id, code')
        .like('code', `${baseCode}%`)

    if (error || !data?.length) return baseCode

    const normalized = data.filter((item) => item.id !== currentId).map((item) => item.code)
    if (!normalized.includes(baseCode)) return baseCode

    let suffix = 2
    let nextCode = `${baseCode}-${suffix}`
    while (normalized.includes(nextCode)) {
        suffix += 1
        nextCode = `${baseCode}-${suffix}`
    }
    return nextCode
}

export async function savePaymentCondition(formData: z.infer<typeof paymentConditionSchema>) {
    const result = paymentConditionSchema.safeParse(formData)
    if (!result.success) {
        return { error: 'Dados inválidos.', details: result.error.flatten().fieldErrors }
    }

    const {
        id,
        name,
        description,
        installments,
        discount_percentage,
        surcharge_percentage,
        min_installment_value,
        min_order_value,
        max_order_value,
        icon,
        is_active,
    } = result.data

    const supabase = await createClient()

    try {
        if (id) {
            const { error } = await supabase
                .from('payment_conditions')
                .update({
                    name,
                    description,
                    installments,
                    discount_percentage,
                    surcharge_percentage,
                    min_installment_value,
                    min_order_value,
                    max_order_value,
                    icon,
                    is_active,
                })
                .eq('id', id)

            if (error) throw error
            revalidatePaymentPaths()
            return { success: true }
        }

        const { data: lastCondition } = await supabase
            .from('payment_conditions')
            .select('sort_order')
            .order('sort_order', { ascending: false })
            .limit(1)

        const nextSortOrder = (lastCondition?.[0]?.sort_order || 0) + 1

        const { error } = await supabase.from('payment_conditions').insert({
            name,
            description,
            installments,
            discount_percentage,
            surcharge_percentage,
            min_installment_value,
            min_order_value,
            max_order_value,
            icon,
            is_active,
            sort_order: nextSortOrder,
        })

        if (error) throw error
        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Save Payment Condition Error:', error)
        return { error: getErrorMessage(error, 'Falha ao salvar a condição de pagamento.') }
    }
}

export async function deletePaymentCondition(id: string) {
    const supabase = await createClient()

    try {
        const [{ count: ordersCount, error: ordersError }, { count: linksCount, error: linksError }] =
            await Promise.all([
                supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('payment_condition_id', id),
                supabase
                    .from('payment_method_conditions')
                    .select('*', { count: 'exact', head: true })
                    .eq('payment_condition_id', id)
                    .eq('is_active', true),
            ])

        if (ordersError) throw ordersError
        if (linksError) throw linksError

        if ((ordersCount || 0) > 0) {
            return {
                error: `Não é possível excluir: esta condição está vinculada a ${ordersCount} pedido(s). Marque-a como inativa.`,
            }
        }

        if ((linksCount || 0) > 0) {
            return {
                error: 'Esta condição ainda está vinculada a meios de pagamento. Desative ou remova os vínculos antes de excluir.',
            }
        }

        const { error } = await supabase.from('payment_conditions').delete().eq('id', id)
        if (error) throw error

        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Delete Payment Condition Error:', error)
        return { error: getErrorMessage(error, 'Falha ao remover a condição de pagamento.') }
    }
}

export async function reorderPaymentConditions(updates: { id: string; sort_order: number }[]) {
    const supabase = await createClient()

    try {
        const results = await Promise.all(
            updates.map((update) =>
                supabase
                    .from('payment_conditions')
                    .update({ sort_order: update.sort_order })
                    .eq('id', update.id)
            )
        )

        const hasError = results.some((result) => result.error)
        if (hasError) throw new Error('Algumas atualizações falharam.')

        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Reorder Payment Conditions Error:', error)
        return { error: getErrorMessage(error, 'Falha ao reordenar as condições de pagamento.') }
    }
}

export async function savePaymentMethod(formData: z.infer<typeof paymentMethodSchema>) {
    const result = paymentMethodSchema.safeParse(formData)
    if (!result.success) {
        return { error: 'Dados inválidos.', details: result.error.flatten().fieldErrors }
    }

    const { id, name, description, icon, is_active } = result.data
    const supabase = await createClient()

    try {
        if (id) {
            const { error } = await supabase
                .from('payment_methods')
                .update({
                    name,
                    description,
                    icon,
                    is_active,
                })
                .eq('id', id)

            if (error) throw error
            revalidatePaymentPaths()
            return { success: true }
        }

        const [{ data: lastMethod }, nextCode] = await Promise.all([
            supabase
                .from('payment_methods')
                .select('sort_order')
                .order('sort_order', { ascending: false })
                .limit(1),
            buildUniquePaymentMethodCode(name),
        ])

        const nextSortOrder = (lastMethod?.[0]?.sort_order || 0) + 1

        const { error } = await supabase.from('payment_methods').insert({
            code: nextCode,
            name,
            description,
            icon,
            is_active,
            sort_order: nextSortOrder,
        })

        if (error) throw error
        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Save Payment Method Error:', error)
        return { error: getErrorMessage(error, 'Falha ao salvar o meio de pagamento.') }
    }
}

export async function deletePaymentMethod(id: string) {
    const supabase = await createClient()

    try {
        const { data: methodLinks, error: methodLinksError } = await supabase
            .from('payment_method_conditions')
            .select('id')
            .eq('payment_method_id', id)

        if (methodLinksError) throw methodLinksError

        const linkIds = (methodLinks || []).map((link) => link.id)

        const [
            { count: ordersByMethod, error: ordersByMethodError },
            { count: ordersByLink, error: ordersByLinkError },
            { count: rulesCount, error: rulesError },
        ] = await Promise.all([
            supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_method_id', id),
            linkIds.length
                ? supabase
                      .from('orders')
                      .select('*', { count: 'exact', head: true })
                      .in('payment_method_condition_id', linkIds)
                : Promise.resolve({ count: 0, error: null }),
            linkIds.length
                ? supabase
                      .from('price_table_payment_rules')
                      .select('*', { count: 'exact', head: true })
                      .in('payment_method_condition_id', linkIds)
                : Promise.resolve({ count: 0, error: null }),
        ])

        if (ordersByMethodError) throw ordersByMethodError
        if (ordersByLinkError) throw ordersByLinkError
        if (rulesError) throw rulesError

        if ((ordersByMethod || 0) > 0 || (ordersByLink || 0) > 0) {
            return {
                error: 'Não é possível excluir: este meio já aparece em pedidos. Marque-o como inativo para preservar o histórico.',
            }
        }

        if ((rulesCount || 0) > 0) {
            return {
                error: 'Este meio está vinculado a regras de tabela de preço. Remova ou ajuste essas regras antes de excluir.',
            }
        }

        if (linkIds.length > 0) {
            const { error: deleteLinksError } = await supabase
                .from('payment_method_conditions')
                .delete()
                .eq('payment_method_id', id)

            if (deleteLinksError) throw deleteLinksError
        }

        const { error } = await supabase.from('payment_methods').delete().eq('id', id)
        if (error) throw error

        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Delete Payment Method Error:', error)
        return { error: getErrorMessage(error, 'Falha ao remover o meio de pagamento.') }
    }
}

export async function reorderPaymentMethods(updates: { id: string; sort_order: number }[]) {
    const supabase = await createClient()

    try {
        const results = await Promise.all(
            updates.map((update) =>
                supabase
                    .from('payment_methods')
                    .update({ sort_order: update.sort_order })
                    .eq('id', update.id)
            )
        )

        const hasError = results.some((result) => result.error)
        if (hasError) throw new Error('Algumas atualizações falharam.')

        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Reorder Payment Methods Error:', error)
        return { error: getErrorMessage(error, 'Falha ao reordenar os meios de pagamento.') }
    }
}

export async function savePaymentMethodAssignments(payload: z.infer<typeof paymentMethodAssignmentsSchema>) {
    const result = paymentMethodAssignmentsSchema.safeParse(payload)
    if (!result.success) {
        return { error: 'Dados inválidos para atualizar os vínculos.' }
    }

    const { methodId, assignments } = result.data
    const supabase = await createClient()

    try {
        const { data: existingLinks, error: existingLinksError } = await supabase
            .from('payment_method_conditions')
            .select('id, payment_condition_id')
            .eq('payment_method_id', methodId)

        if (existingLinksError) throw existingLinksError

        const existingConditionIds = new Set(
            (existingLinks || []).map((link) => link.payment_condition_id)
        )
        const incomingConditionIds = new Set(assignments.map((assignment) => assignment.payment_condition_id))

        const upsertPayload = assignments.map((assignment) => ({
            payment_method_id: methodId,
            payment_condition_id: assignment.payment_condition_id,
            is_active: assignment.is_active,
            sort_order: assignment.sort_order,
        }))

        if (upsertPayload.length > 0) {
            const { error: upsertError } = await supabase
                .from('payment_method_conditions')
                .upsert(upsertPayload, {
                    onConflict: 'payment_method_id,payment_condition_id',
                })

            if (upsertError) throw upsertError
        }

        const missingConditionIds = Array.from(existingConditionIds).filter(
            (conditionId) => !incomingConditionIds.has(conditionId)
        )

        if (missingConditionIds.length > 0) {
            const { error: deactivateError } = await supabase
                .from('payment_method_conditions')
                .update({ is_active: false })
                .eq('payment_method_id', methodId)
                .in('payment_condition_id', missingConditionIds)

            if (deactivateError) throw deactivateError
        }

        revalidatePaymentPaths()
        return { success: true }
    } catch (error: unknown) {
        console.error('Save Payment Method Assignments Error:', error)
        return { error: getErrorMessage(error, 'Falha ao atualizar as condições vinculadas ao meio.') }
    }
}
