'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Edit2, Trash2, Layers, Search, Copy, ChevronRight, ChevronDown, GripVertical, Image as ImageIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { Category } from '@/lib/types'
import { deleteCategory, reorderCategories } from '../actions'

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  onEdit: (cat: Category) => void
  onClone: (cat: Category) => void
  usageCounts: Record<string, number>
}

// Sub-component for individual Sortable Item (Shared between Roots and Children)
function SortableCategoryItem({ 
  category, 
  isChild, 
  expanded, 
  onToggleExpand, 
  hasChildren, 
  onEdit, 
  onClone, 
  onDelete, 
  usageCount 
}: { 
  category: Category, 
  isChild: boolean, 
  expanded: boolean, 
  onToggleExpand: () => void, 
  hasChildren: boolean,
  onEdit: () => void,
  onClone: () => void,
  onDelete: () => void,
  usageCount: number
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card ref={setNodeRef} style={style} className={`glass-card border-0 transition-all hover:shadow-md ${!category.is_active ? 'opacity-70 grayscale-[30%]' : ''}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-black/5 rounded">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-navy/10 to-transparent flex items-center justify-center shrink-0 border border-navy/10 relative overflow-hidden">
            {category.image_url ? (
              <img src={category.image_url} alt={category.name} className="w-full h-full object-cover" />
            ) : (
              <Layers className={`h-6 w-6 ${isChild ? 'text-muted-foreground' : 'text-navy'}`} />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-3">
             {hasChildren && !isChild && (
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onToggleExpand}>
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
             )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg text-navy truncate">
                  {category.name}
                </h3>
                {!category.is_active && (
                  <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                )}
                {usageCount > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/50 border-bronze/30 text-bronze">
                    {usageCount} {usageCount === 1 ? 'Produto' : 'Produtos'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {category.description || 'Sem descrição'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-navy" onClick={onClone}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-navy" onClick={onEdit}>
              <Edit2 className="h-4 w-4 mr-1.5" /> Editar
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function CategoryList({ categories: initialCategories, loading, onEdit, onClone, usageCounts }: CategoryListProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [tabFilter, setTabFilter] = useState('all') // all, active, inactive
  
  // Tree State
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set())

  useEffect(() => {
    setCategories(initialCategories)
    // Auto-expand all on load
    const roots = initialCategories.filter(c => !c.parent_id)
    setExpandedRoots(new Set(roots.map(r => r.id)))
  }, [initialCategories])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const toggleExpand = (id: string) => {
    setExpandedRoots(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    
    const result = await deleteCategory(deletingId)
    
    setIsDeleting(false)
    setDeletingId(null)
    
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Categoria removida com sucesso!')
      setCategories(prev => prev.filter(c => c.id !== deletingId))
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeCat = categories.find(c => c.id === active.id)
    const overCat = categories.find(c => c.id === over.id)

    if (!activeCat || !overCat) return

    // Ensure we only sort siblings within the same parent
    if (activeCat.parent_id !== overCat.parent_id) return

    // Find siblings
    const siblings = categories
      .filter(c => c.parent_id === activeCat.parent_id)
      .sort((a,b) => a.sort_order - b.sort_order)

    const oldIndex = siblings.findIndex(c => c.id === active.id)
    const newIndex = siblings.findIndex(c => c.id === over.id)

    const reorderedSiblings = arrayMove(siblings, oldIndex, newIndex)
    
    // Calculate new sort_orders sequentially to avoid collision
    const updates = reorderedSiblings.map((cat, idx) => ({
      id: cat.id,
      sort_order: idx + 1 // Sequential sorting
    }))

    // Optimistically update
    setCategories(prev => {
        const next = [...prev]
        updates.forEach(upd => {
            const idx = next.findIndex(c => c.id === upd.id)
            if (idx !== -1) next[idx].sort_order = upd.sort_order
        })
        return next
    })

    const result = await reorderCategories(updates)
    if (result.error) {
      toast.error(result.error)
      setCategories(initialCategories) // rollback
    }
  }

  // Define derived filtered lists
  const filteredCategories = useMemo(() => {
    return categories.filter(cat => {
      const matchesSearch = cat.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesStatus = tabFilter === 'all' ? true : 
                            (tabFilter === 'active' ? cat.is_active : !cat.is_active)
      return matchesSearch && matchesStatus
    })
  }, [categories, searchQuery, tabFilter])

  // Map to roots and children
  const roots = useMemo(() => {
    return filteredCategories.filter(c => !c.parent_id).sort((a,b) => a.sort_order - b.sort_order)
  }, [filteredCategories])

  const getChildren = (parentId: string) => {
    return filteredCategories.filter(c => c.parent_id === parentId).sort((a,b) => a.sort_order - b.sort_order)
  }

  if (loading) {
    return (
        <div className="space-y-3">
            {[1, 2, 3].map((i) => (
                <Card key={i} className="glass-card border-0">
                    <CardContent className="p-4 flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
  }

  if (categories.length === 0) {
    return null // Displayed via Client wrapper
  }

  return (
    <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white/40 p-2 rounded-xl border border-white/40 shadow-sm gap-4">
            <Tabs value={tabFilter} onValueChange={setTabFilter} className="w-full sm:w-auto">
            <TabsList className="bg-white/60">
                <TabsTrigger value="all">Todas</TabsTrigger>
                <TabsTrigger value="active">Ativas</TabsTrigger>
                <TabsTrigger value="inactive">Inativas</TabsTrigger>
            </TabsList>
            </Tabs>
            
            <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Buscar categoria..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/60 w-full"
            />
            </div>
        </div>

        {filteredCategories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
                Nenhuma categoria corresponde aos filtros selecionados.
            </div>
        ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={roots.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                        <AnimatePresence>
                            {roots.map(root => {
                                const children = getChildren(root.id)
                                const isExpanded = expandedRoots.has(root.id) || searchQuery !== '' // Auto expand if searching

                                return (
                                    <motion.div
                                        key={root.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2"
                                    >
                                        <SortableCategoryItem 
                                            category={root}
                                            isChild={false}
                                            expanded={isExpanded}
                                            onToggleExpand={() => toggleExpand(root.id)}
                                            hasChildren={children.length > 0}
                                            onEdit={() => onEdit(root)}
                                            onClone={() => onClone(root)}
                                            onDelete={() => setDeletingId(root.id)}
                                            usageCount={usageCounts[root.id] || 0}
                                        />

                                        {/* Render Children inside a nested SortableContext */}
                                        <AnimatePresence>
                                            {isExpanded && children.length > 0 && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="pl-8 sm:pl-12 space-y-2 mt-2"
                                                >
                                                    <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                                        {children.map(child => (
                                                            <SortableCategoryItem 
                                                                key={child.id}
                                                                category={child}
                                                                isChild={true}
                                                                expanded={false}
                                                                onToggleExpand={() => {}}
                                                                hasChildren={false}
                                                                onEdit={() => onEdit(child)}
                                                                onClone={() => onClone(child)}
                                                                onDelete={() => setDeletingId(child.id)}
                                                                usageCount={usageCounts[child.id] || 0}
                                                            />
                                                        ))}
                                                    </SortableContext>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                </SortableContext>
            </DndContext>
        )}

        {/* Delete Protection Dialog */}
        <AlertDialog open={!!deletingId} onOpenChange={(open: boolean) => !open && setDeletingId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="font-heading">Tem certeza que deseja remover?</AlertDialogTitle>
                    <AlertDialogDescription>
                    A operação é irreversível. O sistema irá bloquear internamente a exclusão se existirem Subcategorias ou Produtos vinculados a esta Categoria Pai para preservar a integridade.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                    onClick={(e: React.MouseEvent) => {
                        e.preventDefault()
                        handleDelete()
                    }}
                    disabled={isDeleting}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground focus:ring-destructive"
                    >
                    {isDeleting ? 'Removendo...' : 'Remover Categoria'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  )
}
