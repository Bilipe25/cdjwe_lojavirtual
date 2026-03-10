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

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/register', '/forgot-password']
    const isPublicRoute = publicRoutes.some(route =>
        request.nextUrl.pathname.startsWith(route)
    )

    // If user is not authenticated and trying to access a protected route
    if (!user && !isPublicRoute && request.nextUrl.pathname !== '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // If user is authenticated, check profile for role-based access
    if (user) {
        // If on login/register page, redirect to appropriate dashboard
        if (isPublicRoute) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, status')
                .eq('id', user.id)
                .single()

            const url = request.nextUrl.clone()
            if (profile?.role === 'admin') {
                url.pathname = '/admin/dashboard'
            } else {
                url.pathname = '/catalog'
            }
            return NextResponse.redirect(url)
        }

        // Check admin routes access
        if (request.nextUrl.pathname.startsWith('/admin')) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()

            if (profile?.role !== 'admin') {
                const url = request.nextUrl.clone()
                url.pathname = '/catalog'
                return NextResponse.redirect(url)
            }
        }

        // Check if client is approved for store routes
        if (
            request.nextUrl.pathname.startsWith('/catalog') ||
            request.nextUrl.pathname.startsWith('/cart') ||
            request.nextUrl.pathname.startsWith('/orders')
        ) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('status, role')
                .eq('id', user.id)
                .single()

            if (profile?.role === 'client' && profile?.status === 'pending') {
                const url = request.nextUrl.clone()
                url.pathname = '/pending-approval'
                return NextResponse.redirect(url)
            }

            if (profile?.role === 'client' && profile?.status === 'blocked') {
                const url = request.nextUrl.clone()
                url.pathname = '/blocked'
                return NextResponse.redirect(url)
            }
        }
    }

    return supabaseResponse
}
