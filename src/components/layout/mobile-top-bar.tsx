'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Search, ArrowLeft, SlidersHorizontal, Trash2, Filter } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CatalogFilters } from '@/app/(store)/catalog/components/CatalogFilters'
import { OrderFilters } from '@/app/(store)/orders/components/OrderFilters'
import { useCartStore } from '@/lib/stores/cart-store'
import { useSettings } from '@/components/providers/settings-provider'
import { usePwaRuntime } from '@/components/providers/pwa-runtime-provider'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import type { Category, Fabric } from '@/lib/types'

interface MobileCatalogSizeFilterOption {
    slug: string
    name: string
    sort_order: number
}

const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/catalog': 'Catálogo',
    '/orders': 'Meus Pedidos',
    '/favorites': 'Favoritos',
    '/profile': 'Meu Perfil',
    '/cart': 'Carrinho',
}

export function MobileTopBar() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const { settings } = useSettings()
    const { isStandalone } = usePwaRuntime()
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '')
    const [showSearch, setShowSearch] = useState(() => searchParams.get('search_active') === 'true')
    const inputRef = useRef<HTMLInputElement>(null)
    const { clearCart } = useCartStore()

    // Filters and Order data
    const [categories, setCategories] = useState<Category[]>([])
    const [fabrics, setFabrics] = useState<Fabric[]>([])
    const [sizes, setSizes] = useState<MobileCatalogSizeFilterOption[]>([])
    const [nextOrderNumber, setNextOrderNumber] = useState<string>('')

    const isCatalogPage = pathname.startsWith('/catalog')
    const isCartPage = pathname.startsWith('/cart')
    const isProfilePage = pathname === '/profile'
    const isOrdersPageMain = pathname === '/orders'
    const isOrderDetailPage = pathname.startsWith('/orders/') && pathname !== '/orders'
    const isOrdersPage = isOrdersPageMain || isOrderDetailPage

    // Read active filters from URL
    const activeCategory = searchParams.get('category') || 'all'
    const activeFabric = searchParams.get('fabric') || 'all'
    const activeSize = searchParams.get('size') || 'all'
    const activeSort = searchParams.get('sort') || 'name'
    
    // Order filters
    const activeStatus = searchParams.get('status') || 'all'
    const activeDate = searchParams.get('date') || 'all'

    const activeFiltersCount = isOrdersPage 
        ? [activeStatus !== 'all', activeDate !== 'all'].filter(Boolean).length
        : [activeCategory !== 'all', activeFabric !== 'all', activeSize !== 'all', activeSort !== 'name'].filter(Boolean).length

    // No longer need local setting fetch, provided by SettingsProvider

    // Load catalog filters (Once per mount if on catalog)
    useEffect(() => {
        if (!isCatalogPage || (categories.length > 0 && fabrics.length > 0 && sizes.length > 0)) return
        
        const loadCatalogFilters = async () => {
            const supabase = createClient()
            try {
                const [catRes, fabRes, sizeRes] = await Promise.all([
                    supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
                    supabase.from('fabrics').select('*').eq('is_active', true).order('sort_order'),
                    supabase
                        .from('product_size_options')
                        .select('slug, name, sort_order')
                        .eq('is_active', true)
                        .order('sort_order', { ascending: true })
                        .order('name', { ascending: true }),
                ])
                if (catRes.data) setCategories(catRes.data)
                if (fabRes.data) setFabrics(fabRes.data)
                if (sizeRes.data) {
                    const uniqueSizes = new Map<string, MobileCatalogSizeFilterOption>()
                    sizeRes.data.forEach((sizeOption) => {
                        if (!sizeOption.slug) return

                        const current = uniqueSizes.get(sizeOption.slug)
                        if (!current || (sizeOption.sort_order || 0) < current.sort_order) {
                            uniqueSizes.set(sizeOption.slug, {
                                slug: sizeOption.slug,
                                name: sizeOption.name,
                                sort_order: sizeOption.sort_order || 0,
                            })
                        }
                    })

                    setSizes(
                        Array.from(uniqueSizes.values()).sort((a, b) => {
                            const sortDelta = a.sort_order - b.sort_order
                            if (sortDelta !== 0) return sortDelta
                            return a.name.localeCompare(b.name, 'pt-BR')
                        })
                    )
                }
            } catch { /* silent */ }
        }
        loadCatalogFilters()
    }, [isCatalogPage, categories.length, fabrics.length, sizes.length])

    // Load next order number (Only on relevant pages)
    useEffect(() => {
        if (!isCartPage && !isOrderDetailPage) return

        const loadOrderData = async () => {
            const supabase = createClient()
            
            if (isCartPage) {
                try {
                    const { data } = await supabase
                        .from('orders')
                        .select('order_number')
                        .order('created_at', { ascending: false })
                        .limit(1)
                    
                    const lastNumStr = data?.[0]?.order_number || 'PED000000'
                    const lastNum = parseInt(lastNumStr.replace(/\D/g, '')) || 0
                    const nextNum = (lastNum + 1).toString().padStart(6, '0')
                    setNextOrderNumber(`Pedido${nextNum}`)
                } catch { /* silent */ }
            }

            if (isOrderDetailPage) {
                try {
                    const orderId = pathname.split('/').pop()
                    if (orderId) {
                        const { data } = await supabase
                            .from('orders')
                            .select('order_number')
                            .eq('id', orderId)
                            .single()
                        if (data) setNextOrderNumber(data.order_number)
                    }
                } catch { /* silent */ }
            }
        }
        loadOrderData()
    }, [isCartPage, isOrderDetailPage, pathname])

    // Focus search input when search mode is open
    useEffect(() => {
        if (showSearch) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [showSearch])

    // Live search debounce logic
    useEffect(() => {
        if (!showSearch) return

        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams)
            if (searchQuery.trim()) {
                params.set('search', searchQuery.trim())
            } else {
                params.delete('search')
            }
            
            // Only update if the search actually changed to avoid redundant navigation
            const currentSearch = searchParams.get('search') || ''
            if (searchQuery.trim() !== currentSearch) {
                router.replace(`${pathname}?${params.toString()}`, { scroll: false })
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery, showSearch, pathname, router, searchParams])

    const toggleSearch = (active: boolean) => {
        setShowSearch(active)
        const params = new URLSearchParams(searchParams)
        if (active) {
            setSearchQuery(searchParams.get('search') || '')
            params.set('search_active', 'true')
        } else {
            params.delete('search_active')
            params.delete('search')
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }

    const handleSearch = () => {
        if (searchQuery.trim()) {
            const params = new URLSearchParams(searchParams)
            params.set('search', searchQuery.trim())
            params.set('search_active', 'true')
            router.push(`${pathname}?${params.toString()}`)
            // We keep it open on search submit to allow further refining
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch()
        if (e.key === 'Escape') { toggleSearch(false); setSearchQuery('') }
    }

    const clearAndClose = () => {
        toggleSearch(false)
        setSearchQuery('')
    }

    // Determine page title
    const getPageTitle = () => {
        if ((isCartPage || isOrderDetailPage) && nextOrderNumber) return nextOrderNumber
        
        for (const [path, title] of Object.entries(pageTitles)) {
            if (pathname.startsWith(path)) return title
        }
    }

    return (
        <header
            data-mobile-top-bar
            className={`sticky top-0 z-50 w-full border-b border-border/30 md:hidden ${
                isStandalone
                    ? 'bg-background/92 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.5)] backdrop-blur-xl'
                    : 'glass-nav'
            }`}
            role="banner"
        >
            <div className={`flex items-center gap-3 px-4 ${isStandalone ? 'min-h-14' : 'h-12'}`}>
                {/* Back button or Logo */}
                {isCartPage ? (
                    <button
                        onClick={() => router.back()}
                        className="h-8 w-8 -ml-1 rounded-full flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="Voltar"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                ) : (
                    <Link href="/dashboard" className="flex items-center shrink-0" aria-label="Página inicial">
                        {settings?.logo_url ? (
                            <div className="h-7 w-20 shrink-0 relative">
                                <Image
                                    priority
                                    src={settings.logo_url}
                                    alt={settings.system_name || 'Loja'}
                                    fill
                                    className="object-contain object-left"
                                />
                            </div>
                        ) : (
                            <div className="h-7 w-7 rounded-md gradient-bronze flex items-center justify-center shrink-0">
                                <span className="text-white font-bold text-[10px] font-heading">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                        )}
                    </Link>
                )}

                {/* Page title OR search input */}
                {showSearch && (isCatalogPage || isOrdersPage) ? (
                    <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                ref={inputRef}
                                type="search"
                                placeholder={isCatalogPage ? "Buscar produtos..." : "Buscar pedidos..."}
                                className="w-full h-8 pl-8 pr-3 rounded-lg border border-border/60 bg-muted/60 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:bg-white transition-colors"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <button
                            onClick={clearAndClose}
                            className="text-sm font-medium text-muted-foreground shrink-0 px-1"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold font-heading text-foreground truncate">
                                {getPageTitle()}
                            </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                            {/* Theme toggle */}
                            <ThemeToggle size="sm" />
                            {/* Catalog or Orders Actions (Main Orders page only) */}
                            {(isCatalogPage || isOrdersPageMain) && (
                                <>
                                    <button
                                        onClick={() => toggleSearch(true)}
                                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                        aria-label="Buscar"
                                    >
                                        <Search className="h-4 w-4" />
                                    </button>

                                    <Sheet>
                                        <SheetTrigger
                                            render={
                                                <button
                                                    className="h-8 w-8 rounded-full flex items-center justify-center relative text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                                    aria-label="Filtros"
                                                >
                                                    <SlidersHorizontal className="h-4 w-4" />
                                                    {activeFiltersCount > 0 && (
                                                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm border border-white">
                                                            {activeFiltersCount}
                                                        </span>
                                                    )}
                                                </button>
                                            }
                                        />
                                        <SheetContent side="right" className="data-[side=right]:w-[70vw] sm:max-w-sm p-0 flex flex-col gap-0 border-l border-border/30 shadow-2xl">
                                            <SheetHeader className="p-4 border-b flex flex-row items-center justify-between shrink-0">
                                                <SheetTitle className="text-lg font-bold font-heading text-gradient-navy leading-none flex items-center gap-2">
                                                    <Filter className="h-4 w-4" />
                                                    Filtros
                                                </SheetTitle>
                                            </SheetHeader>
                                            <ScrollArea className="h-[calc(100dvh-60px)] p-4">
                                                {isCatalogPage ? (
                                                    <CatalogFilters
                                                        categories={categories}
                                                        fabrics={fabrics}
                                                        sizes={sizes}
                                                        selectedCategory={activeCategory}
                                                        selectedFabric={activeFabric}
                                                        selectedSize={activeSize}
                                                        sortBy={activeSort}
                                                        onSortChange={(v) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            params.set('sort', v)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onCategoryChange={(id) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            if (id === 'all') params.delete('category')
                                                            else params.set('category', id)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onFabricChange={(id) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            if (id === 'all') params.delete('fabric')
                                                            else params.set('fabric', id)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onSizeChange={(slug) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            if (slug === 'all') params.delete('size')
                                                            else params.set('size', slug)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onClearAll={() => {
                                                            const params = new URLSearchParams(searchParams)
                                                            params.delete('category')
                                                            params.delete('fabric')
                                                            params.delete('size')
                                                            params.set('sort', 'name')
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                    />
                                                ) : (
                                                    <OrderFilters 
                                                        statusFilter={activeStatus}
                                                        dateFilter={activeDate}
                                                        onStatusChange={(status) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            if (status === 'all') params.delete('status')
                                                            else params.set('status', status)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onDateChange={(date) => {
                                                            const params = new URLSearchParams(searchParams)
                                                            if (date === 'all') params.delete('date')
                                                            else params.set('date', date)
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                        onClearAll={() => {
                                                            const params = new URLSearchParams(searchParams)
                                                            params.delete('status')
                                                            params.delete('date')
                                                            router.push(`${pathname}?${params.toString()}`)
                                                        }}
                                                    />
                                                )}
                                            </ScrollArea>
                                        </SheetContent>
                                    </Sheet>
                                </>
                            )}

                            {/* Cart Actions */}
                            {isCartPage && (
                                <AlertDialog>
                                    <AlertDialogTrigger
                                        render={
                                            <button
                                                className="h-8 w-8 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                                                aria-label="Limpar Carrinho"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        }
                                    />
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Esvaziar carrinho</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Tem certeza que deseja remover todos os itens do seu carrinho? Esta ação não pode ser desfeita.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={clearCart}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                Sim, esvaziar
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}

                            {/* Order Detail Actions */}
                            {isOrderDetailPage && (
                                <button
                                    onClick={() => router.push('/orders')}
                                    className="h-8 px-3 rounded-full flex items-center gap-1.5 text-navy font-bold text-[11px] bg-muted/60 hover:bg-muted transition-colors border border-border/40"
                                    aria-label="Voltar para pedidos"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    VOLTAR
                                </button>
                            )}

                            {/* Profile Actions */}
                            {isProfilePage && (
                                <button
                                    onClick={() => router.push('/catalog')}
                                    className="h-8 px-3 rounded-full flex items-center gap-1.5 text-navy font-bold text-[11px] bg-muted/60 hover:bg-muted transition-colors border border-border/40"
                                    aria-label="Voltar para catálogo"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    VOLTAR
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </header>
    )
}
