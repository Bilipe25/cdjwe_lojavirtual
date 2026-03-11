'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Heart, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProductGridSkeleton } from '@/components/ui/skeletons'
import { createClient } from '@/lib/supabase/client'
import { useFavoritesStore } from '@/lib/stores/favorites-store'
import { ProductCard } from '@/components/catalog/product-card'
import { QuickViewModal } from '@/components/catalog/quick-view-modal'
import type { Product } from '@/lib/types'

export default function FavoritesPage() {
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
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-2xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Heart className="h-6 w-6 text-red-500 fill-red-500" />
                        Favoritos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {favoriteIds.length} {favoriteIds.length === 1 ? 'produto salvo' : 'produtos salvos'}
                    </p>
                </motion.div>
                {favoriteIds.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                        onClick={() => {
                            if (window.confirm('Remover todos os favoritos?')) clear()
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                        Limpar
                    </Button>
                )}
            </div>

            {loading ? (
                <ProductGridSkeleton count={4} />
            ) : products.length === 0 ? (
                <div className="text-center py-20">
                    <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Heart className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Nenhum favorito ainda</h3>
                    <p className="text-muted-foreground mt-1 mb-4">
                        Clique no coração dos produtos para salvar aqui.
                    </p>
                    <Button
                        className="gradient-bronze border-0 text-white"
                        onClick={() => window.location.href = '/catalog'}
                    >
                        Ver Catálogo
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
