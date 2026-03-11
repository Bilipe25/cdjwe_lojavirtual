'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { loginSchema, type LoginFormData } from './schema'

export async function loginAction(data: LoginFormData) {
    // 1. Zod Validation
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
        return { error: 'Dados inválidos. Verifique o formulário.' };
    }

    const { email, password } = parsed.data;

    try {
        const supabase = await createClient()

        // 2. SignIn with Supabase SSR
        const { error: authError } = await supabase.auth.signInWithPassword({ 
            email, 
            password 
        });

        if (authError) {
            if (authError.message.includes('Invalid login credentials')) {
                return { error: 'Email ou senha incorretos' }
            }
            return { error: authError.message }
        }

        // 3. Fetch user profile data to define the routing and metadata
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return { error: 'Usuário não encontrado após login' }
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role, status')
            .eq('id', user.id)
            .single()

        const role = profile?.role || 'client';
        const status = profile?.status || 'approved';

        // 4. Set Enterprise Static State Cookies (Valid across NextJS Middleware safely)
        const cookieStore = await cookies();
        cookieStore.set('jwt_role', role, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 1 Week
        });
        
        cookieStore.set('jwt_status', status, { 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7 // 1 Week
        });

        // Resolve Destination URL safely
        let redirectUrl = '/catalog';
        if (role === 'admin') {
            redirectUrl = '/admin/dashboard';
        } else if (status === 'pending') {
            redirectUrl = '/pending-approval';
        } else if (status === 'blocked') {
            redirectUrl = '/blocked';
        }

        return { success: true, redirectUrl };

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
