import { createClient } from '@/lib/supabase/server'
import { Layers } from 'lucide-react'
import type { Category } from '@/lib/types'
import { CategoriesClientPage } from './ClientPage'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
    const supabase = await createClient()

    const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })

    const { data: usageData } = await supabase
        .from('products')
        .select('category_id')

    const usageCounts = usageData?.reduce((acc: Record<string, number>, product: { category_id: string | null }) => {
        if (product.category_id) {
            acc[product.category_id] = (acc[product.category_id] || 0) + 1
        }
        return acc
    }, {}) || {}

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Layers className="h-8 w-8 text-bronze" />
                        Categorias de Produtos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie a organização e hierarquia dos seus sofás e estofados
                    </p>
                </div>
                {/* Actions like Nova Categoria are now managed by the ClientWrapper */}
            </div>

            <CategoriesClientPage 
                initialCategories={(categories || []) as Category[]} 
                usageCounts={usageCounts}
            />
        </div>
    )
}
