'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies, headers } from 'next/headers'
import { loginSchema, type LoginFormData } from './schema'

export async function loginAction(data: LoginFormData) {
    // 1. Zod Validation
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
        return { error: 'Dados inválidos. Verifique o formulário.' };
    }

    const { identifier, password } = parsed.data;

    try {
        const supabase = await createClient()

        let emailToAuthenticate = identifier.trim();
        const isEmailOrSimilar = identifier.includes('@');

        // 2. Lookup email if identifier is not an email
        if (!isEmailOrSimilar) {
            const cleanIdentifier = identifier.replace(/[^\d]+/g, '');
            const isCnpj = cleanIdentifier.length === 14;

            let query = supabase.from('stores').select('profile_id, profiles!stores_profile_id_fkey!inner(email)');

            if (isCnpj) {
                query = query.or(`cnpj.eq.${identifier},cnpj.eq.${cleanIdentifier}`);
            } else {
                query = query.ilike('company_name', `%${identifier}%`);
            }

            const { data: storeData } = await query.limit(1).maybeSingle();

            const profileData: any = storeData?.profiles;
            const foundEmail = Array.isArray(profileData) ? profileData[0]?.email : profileData?.email;

            if (storeData && foundEmail) {
                emailToAuthenticate = foundEmail;
            } else {
                return { error: 'Nenhuma conta encontrada com este CNPJ ou Razão Social.' };
            }
        }

        // 3. SignIn with Supabase SSR
        const { error: authError } = await supabase.auth.signInWithPassword({ 
            email: emailToAuthenticate, 
            password 
        });

        if (authError) {
            if (authError.message.includes('Invalid login credentials')) {
                return { error: 'Credenciais incorretas. Tente novamente.' }
            }
            return { error: authError.message }
        }

        // 4. Fetch user profile data to define the routing and metadata
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { error: 'Usuário não encontrado após login' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, status, full_name, stores!stores_profile_id_fkey(company_name)')
            .eq('id', user.id)
            .single()

        const role = profile?.role || 'client';
        const status = profile?.status || 'approved';
        const companyName = profile?.stores?.[0]?.company_name || profile?.full_name || 'Usuário';

        // 4.5 Audit Logging for clients
        if (role === 'client') {
            const reqHeaders = await headers();
            const userAgent = reqHeaders.get('user-agent') || 'Unknown';
            const ipAddress = reqHeaders.get('x-forwarded-for') || reqHeaders.get('x-real-ip') || 'Local';

            try {
                await supabase.from('customer_login_audit').insert({
                    profile_id: user.id,
                    ip_address: ipAddress.split(',')[0].trim(),
                    user_agent: userAgent
                });
            } catch (err) {
                console.error(err);
            }
        }

        // 5. Set Enterprise Static State Cookies
        const cookieStore = await cookies();
        const cookieOptions = { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            maxAge: 60 * 60 * 24 * 7 // 1 Week
        };

        cookieStore.set('jwt_role', role, cookieOptions);
        cookieStore.set('jwt_status', status, cookieOptions);

        // Resolve Destination URL safely
        let redirectUrl = '/catalog';
        if (role === 'admin') {
            redirectUrl = '/admin/dashboard';
        } else if (status === 'pending' || status === 'imported') {
            redirectUrl = '/pending-approval';
        } else if (status === 'blocked') {
            redirectUrl = '/blocked';
        }

        return { success: true, redirectUrl, companyName, identifier: emailToAuthenticate };

    } catch (err: any) {
        console.error('Login action error:', err);
        return { error: 'Ocorreu um erro inesperado no servidor.' };
    }
}

export async function logoutAction() {
    try {
        const supabase = await createClient();
        await supabase.auth.signOut();

        const cookieStore = await cookies();
        cookieStore.delete('jwt_role');
        cookieStore.delete('jwt_status');

        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { error: 'Ocorreu um erro ao sair da conta.' };
    }
}
