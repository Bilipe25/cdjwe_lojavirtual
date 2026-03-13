'use server'

import { createClient } from '@/lib/supabase/server'
import type { SystemSettings } from '@/lib/types'

export async function loadSettingsAction(): Promise<{ data: SystemSettings | null; error: string | null }> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('system_settings').select('*').limit(1).single()

    if (error) {
        return { data: null, error: 'Erro ao carregar configurações.' }
    }

    return { data: data as SystemSettings, error: null }
}

interface SaveSettingsInput {
    id?: string
    system_name: string
    logo_url?: string | null
    cnpj?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    zip_code?: string | null
    phone?: string | null
    phone_secondary?: string | null
    email?: string | null
    min_order_amount: number
    default_delivery_days: number
    show_prices_to_unapproved: boolean
    whatsapp?: string | null
    instagram?: string | null
    facebook?: string | null
    about_title?: string | null
    about_text?: string | null
    about_image_url?: string | null
    catalog_notice?: string | null
    catalog_notice_type?: 'info' | 'promotion' | 'attention' | 'message' | null
}

export async function saveSettingsAction(input: SaveSettingsInput): Promise<{ error: string | null }> {
    // Server-side validation
    if (!input.system_name || input.system_name.trim().length < 2) {
        return { error: 'Nome do sistema é obrigatório (mínimo 2 caracteres).' }
    }

    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
        return { error: 'Email inválido.' }
    }

    if (input.min_order_amount < 0) {
        return { error: 'Valor mínimo do pedido não pode ser negativo.' }
    }

    if (input.default_delivery_days < 1) {
        return { error: 'Prazo de entrega deve ser no mínimo 1 dia.' }
    }

    const supabase = await createClient()

    const data = {
        system_name: input.system_name.trim(),
        logo_url: input.logo_url || null,
        cnpj: input.cnpj || null,
        address: input.address || null,
        city: input.city || null,
        state: input.state || null,
        zip_code: input.zip_code || null,
        phone: input.phone || null,
        phone_secondary: input.phone_secondary || null,
        email: input.email || null,
        min_order_amount: input.min_order_amount,
        default_delivery_days: input.default_delivery_days,
        show_prices_to_unapproved: input.show_prices_to_unapproved,
        whatsapp: input.whatsapp || null,
        instagram: input.instagram || null,
        facebook: input.facebook || null,
        about_title: input.about_title || null,
        about_text: input.about_text || null,
        about_image_url: input.about_image_url || null,
        catalog_notice: input.catalog_notice || null,
        catalog_notice_type: input.catalog_notice_type || 'info',
    }

    if (input.id) {
        const { error } = await supabase.from('system_settings').update(data).eq('id', input.id)
        if (error) {
            console.error('Update settings error:', error)
            return { error: 'Erro ao salvar configurações.' }
        }
    } else {
        const { error } = await supabase.from('system_settings').insert(data)
        if (error) {
            console.error('Insert settings error:', error)
            return { error: 'Erro ao criar configurações.' }
        }
    }

    return { error: null }
}

export async function uploadLogoAction(formData: FormData): Promise<{ url: string | null; error: string | null }> {
    const file = formData.get('file') as File | null
    if (!file) return { url: null, error: 'Nenhum arquivo enviado.' }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
        return { url: null, error: 'Formato inválido. Use PNG, JPEG, WebP ou SVG.' }
    }

    if (file.size > 2 * 1024 * 1024) {
        return { url: null, error: 'Arquivo muito grande. Máximo 2MB.' }
    }

    const supabase = await createClient()
    const ext = file.name.split('.').pop()
    const filePath = `logos/logo_${Date.now()}.${ext}`

    const { error } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true })
    if (error) return { url: null, error: 'Erro ao fazer upload.' }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
    return { url: urlData.publicUrl, error: null }
}

export async function uploadAboutImageAction(formData: FormData): Promise<{ url: string | null; error: string | null }> {
    const file = formData.get('file') as File | null
    if (!file) return { url: null, error: 'Nenhum arquivo enviado.' }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
        return { url: null, error: 'Formato inválido. Use PNG, JPEG ou WebP.' }
    }

    if (file.size > 5 * 1024 * 1024) {
        return { url: null, error: 'Arquivo muito grande. Máximo 5MB.' }
    }

    const supabase = await createClient()
    const ext = file.name.split('.').pop()
    const filePath = `institutional/about_${Date.now()}.${ext}`

    const { error } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true })
    if (error) return { url: null, error: 'Erro ao fazer upload da imagem institucional.' }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(filePath)
    return { url: urlData.publicUrl, error: null }
}
