'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Heart, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { ProductGridSkeleton } from '@/components/ui/skeletons'
import { createClient } from '@/lib/supabase/client'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { ProductCard } from '@/components/catalog/product-card'
import { QuickViewModal } from '@/components/catalog/quick-view-modal'
import type { Product } from '@/lib/types'

export default function FavoritesPage() {
    const router = useRouter()
    const { favoriteIds, clear } = useFavoritesStore()
    const [products, setProducts] = useState<(Product & { images: { url: string; is_primary: boolean }[]; category: { name: string } })[]>([])
    const [loading, setLoading] = useState(true)
    const [quickViewId, setQuickViewId] = useState<string | null>(null)

    useEffect(() => {
        loadFavorites()
    }, [favoriteIds])

    const loadFavorites = async () => {
        if (favoriteIds.length === 0) {
            setProducts([])
            setLoading(false)
            return
        }
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase
            .from('products')
            .select('*, images:product_images(*), category:categories(name)')
            .in('id', favoriteIds)
            .eq('is_active', true)
            .order('name')
        if (data) setProducts(data as any)
        setLoading(false)
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <div className="flex items-center justify-between mb-6">
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="hidden md:block">
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Heart className="h-6 w-6 text-red-500 fill-red-500" />
                        Favoritos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {favoriteIds.length} {favoriteIds.length === 1 ? 'produto salvo' : 'produtos salvos'}
                    </p>
                </motion.div>
                
                {/* Mobile simplified info - only shown if items exist and on sm-md */}
                {favoriteIds.length > 0 && (
                    <div className="md:hidden">
                        <p className="text-xs text-muted-foreground font-medium">
                            {favoriteIds.length} {favoriteIds.length === 1 ? 'item salvo' : 'itens salvos'}
                        </p>
                    </div>
                )}

                {favoriteIds.length > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger 
                            render={
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8 px-3 rounded-full md:h-9 md:px-4"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Limpar
                                </Button>
                            }
                        />
                        <AlertDialogContent className="w-[90vw] max-w-[400px] rounded-2xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Remover todos os favoritos?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação irá remover permanentemente todos os produtos da sua lista de favoritos.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row gap-2">
                                <AlertDialogCancel className="flex-1 mt-0 rounded-xl">Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                    onClick={clear}
                                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                                >
                                    Limpar Tudo
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            {loading ? (
                <ProductGridSkeleton count={4} />
            ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                            type: 'spring',
                            stiffness: 260,
                            damping: 20
                        }}
                        className="relative mb-8"
                    >
                        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150" />
                        <div className="relative h-24 w-24 rounded-3xl bg-white shadow-xl shadow-primary/10 flex items-center justify-center border border-primary/10">
                            <Heart className="h-10 w-10 text-primary fill-primary/10" />
                        </div>
                        <motion.div
                            animate={{ 
                                y: [0, -4, 0],
                                rotate: [0, 5, 0]
                            }}
                            transition={{ 
                                duration: 4, 
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="absolute -top-2 -right-2 h-10 w-10 rounded-2xl bg-bronze flex items-center justify-center shadow-lg transform rotate-6 border-2 border-white"
                        >
                            <Heart className="h-5 w-5 text-white fill-white" />
                        </motion.div>
                    </motion.div>

                    <h3 className="text-xl font-bold font-heading text-gradient-navy mb-2">Sua lista está vazia</h3>
                    <p className="text-muted-foreground max-w-xs mb-8 leading-relaxed">
                        Salve os produtos que você mais gostou para encontrá-los facilmente depois.
                    </p>
                    <Button
                        className="gradient-bronze border-0 text-white h-12 px-10 rounded-2xl shadow-xl shadow-bronze/20 hover:shadow-bronze/30 transition-all active:scale-95 font-semibold"
                        onClick={() => router.push('/catalog')}
                    >
                        Explorar Catálogo
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                    {products.map((product, i) => (
                        <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <ProductCard
                                product={product}
                                onQuickView={(id) => setQuickViewId(id)}
                            />
                        </motion.div>
                    ))}
                </div>
            )}

            <QuickViewModal
                productId={quickViewId}
                open={!!quickViewId}
                onClose={() => setQuickViewId(null)}
            />
        </div>
    )
}
