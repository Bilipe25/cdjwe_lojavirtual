'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Category } from '@/lib/types'
import { CategoryList } from './components/CategoryList'
import { CategoryForm } from './components/CategoryForm'

interface ClientPageProps {
  initialCategories: Category[]
  usageCounts: Record<string, number>
}

export function CategoriesClientPage({ initialCategories, usageCounts }: ClientPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  const handleOpenCreate = () => {
    setEditingCategory(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat)
    setIsFormOpen(true)
  }

  const handleOpenClone = (cat: Category) => {
    setEditingCategory({
      ...cat,
      id: '', // New record
      name: `${cat.name} (Cópia)`,
      slug: `${cat.slug}-copia`,
    })
    setIsFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold font-heading text-gradient-navy">Categorias</h1>
          <p className="text-muted-foreground mt-1">Organize seus produtos por categorias</p>
        </div>
        <Button onClick={handleOpenCreate} className="gradient-navy border-0 text-white gap-2 ml-auto">
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>

      <CategoryList 
        categories={initialCategories} 
        loading={false} 
        onEdit={handleOpenEdit} 
        onClone={handleOpenClone}
        usageCounts={usageCounts}
      />

      {initialCategories.length === 0 && (
        <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Plus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Nenhuma categoria encontrada</h3>
          <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
            Crie categorias (ex: Linha Ouro, Sofás Retráteis) para organizar seus produtos na loja.
          </p>
          <Button onClick={handleOpenCreate} className="mt-4 gradient-bronze border-0 text-white">Criar Categoria</Button>
        </div>
      )}

      <CategoryForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        category={editingCategory}
        categories={initialCategories}
      />
    </div>
  )
}
