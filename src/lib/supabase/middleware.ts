import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Apenas garante que o token refresh/auth cycle ocorra (sem chutar pro banco os metadados do perfil)
    const { data: { user } } = await supabase.auth.getUser();

    const publicRoutes = ['/login', '/register', '/forgot-password']
    const isPublicRoute = publicRoutes.some(route =>
        request.nextUrl.pathname.startsWith(route)
    )

    // Se estiver deslogado e tentando ir para área bloqueada
    if (!user && !isPublicRoute && request.nextUrl.pathname !== '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    if (user) {
        // Leitura rápida em memória dos cookies que nossa Server Action depositou (0ms latência)
        const role = request.cookies.get('jwt_role')?.value || 'client';
        const status = request.cookies.get('jwt_status')?.value || 'approved';

        if (isPublicRoute) {
            const url = request.nextUrl.clone()
            if (role === 'admin') {
                url.pathname = '/admin/dashboard'
            } else {
                url.pathname = '/catalog'
            }
            return NextResponse.redirect(url)
        }

        // Checando Barreira Admin
        if (request.nextUrl.pathname.startsWith('/admin')) {
            if (role !== 'admin') {
                const url = request.nextUrl.clone()
                url.pathname = '/catalog'
                return NextResponse.redirect(url)
            }
        }

        // Checando Barreira do Lojista/Catalog/Carrinho
        if (
            request.nextUrl.pathname.startsWith('/catalog') ||
            request.nextUrl.pathname.startsWith('/cart') ||
            request.nextUrl.pathname.startsWith('/orders') ||
            request.nextUrl.pathname.startsWith('/order-confirmation')
        ) {
            if (role === 'client' && (status === 'pending' || status === 'imported')) {
                const url = request.nextUrl.clone()
                url.pathname = '/pending-approval'
                return NextResponse.redirect(url)
            }

            if (role === 'client' && status === 'blocked') {
                const url = request.nextUrl.clone()
                url.pathname = '/blocked'
                return NextResponse.redirect(url)
            }
        }
    }

    return supabaseResponse
}
