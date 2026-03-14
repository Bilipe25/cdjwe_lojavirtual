import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface CustomerGreetingData {
    loading: boolean
    error: string | null
    customerName: string | null
    greetingMessage: string
    fullGreeting: string
}

export function useCustomerGreeting(): CustomerGreetingData {
    const [data, setData] = useState<CustomerGreetingData>({
        loading: true,
        error: null,
        customerName: null,
        greetingMessage: 'Encontre os melhores estofados para o seu negócio',
        fullGreeting: 'Bem-vindo(a)! Encontre os melhores estofados para o seu negócio.'
    })

    useEffect(() => {
        const fetchGreetingData = async () => {
            try {
                const supabase = createClient()
                
                const { data: authData, error: authError } = await supabase.auth.getUser()
                if (authError || !authData?.user) {
                    setData(prev => ({ ...prev, loading: false }))
                    return
                }

                // Fetch Profile first (always exists)
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .eq('id', authData.user.id)
                    .single()

                if (profileError) {
                    throw profileError
                }

                // Fetch Store separately using profile_id to avoid ambiguous PostgREST joins
                const { data: storeData, error: storeError } = await supabase
                    .from('stores')
                    .select('company_name, customer_types(name)')
                    .eq('profile_id', authData.user.id)

                if (storeError) {
                    throw storeError
                }

                const store = storeData?.[0]
                
                // Handle case where Supabase returns customer_types as array
                const customerTypeObj = Array.isArray(store?.customer_types) 
                    ? store?.customer_types[0] 
                    : store?.customer_types;
                const customerTypeName = customerTypeObj?.name?.toLowerCase() || ''
                
                // Determine display name
                // Preferably standard Company Name for businesses, localized to full name for individuals
                const displayName = store?.company_name || profile?.full_name || 'Cliente'
                
                // Determine tailored message based on customer type name keywords
                let message = 'Encontre os melhores estofados para o seu negócio.'
                
                if (customerTypeName.includes('varejista') || customerTypeName.includes('loja')) {
                    message = 'Encontre os melhores estofados para sua loja.'
                } else if (customerTypeName.includes('consumidor final') || customerTypeName.includes('física') || customerTypeName.includes('casa')) {
                    message = 'Encontre os melhores estofados para sua casa.'
                } else if (customerTypeName.includes('representante') || customerTypeName.includes('vendedor')) {
                    message = 'Encontre os melhores estofados para apresentar aos seus clientes.'
                } else if (customerTypeName.includes('atacado') || customerTypeName.includes('distribuidor')) {
                    message = 'Encontre as melhores opções em estofados para distribuição.'
                }

                setData({
                    loading: false,
                    error: null,
                    customerName: displayName,
                    greetingMessage: message,
                    fullGreeting: `Bem-vindo(a), ${displayName}. ${message}`
                })

            } catch (err: any) {
                // Improved error logging to capture Supabase/Postgrest details
                console.error('[useCustomerGreeting] Error fetching data:', {
                    message: err.message,
                    details: err.details,
                    hint: err.hint,
                    code: err.code
                })
                setData(prev => ({ 
                    ...prev, 
                    loading: false,
                    error: err.message || 'Erro ao carregar dados'
                }))
            }
        }

        fetchGreetingData()
    }, [])

    return data
}
