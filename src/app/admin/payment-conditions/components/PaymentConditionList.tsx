'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Edit2, Trash2, CreditCard, Banknote, QrCodeIcon, MonitorSmartphone, Wallet, GripVertical, Copy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { PaymentCondition } from '@/lib/types'
import { deletePaymentCondition, reorderPaymentConditions } from '../actions'
import { toast } from 'sonner'

const ICONS: Record<string, React.ElementType> = {
  'credit-card': CreditCard,
  'banknote': Banknote,
  'qr-code': QrCodeIcon,
  'smartphone': MonitorSmartphone,
  'wallet': Wallet,
}

interface PaymentConditionListProps {
  conditions: PaymentCondition[]
  usageCounts: Record<string, number>
  loading: boolean
  onEdit: (cond: PaymentCondition) => void
  onClone: (cond: PaymentCondition) => void
}

// Inner Sortable Item Component
function SortablePaymentCard({ 
  cond, 
  usageCount,
  onEdit, 
  onClone,
  onDeleteRequest 
}: { 
  cond: PaymentCondition, 
  usageCount: number,
  onEdit: () => void, 
  onClone: () => void,
  onDeleteRequest: () => void 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cond.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.8 : 1,
  }

  const IconComp = cond.icon && ICONS[cond.icon] ? ICONS[cond.icon] : CreditCard

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`glass-card border-0 transition-all hover:shadow-md ${!cond.is_active ? 'opacity-70 grayscale-30' : ''}`}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            
            {/* Drag Handle */}
            <div 
              {...attributes} 
              {...listeners}
              className="hidden sm:flex self-stretch items-center justify-center cursor-grab active:cursor-grabbing px-1 hover:text-navy text-muted-foreground mr-1"
            >
              <GripVertical className="h-5 w-5" />
            </div>

            {/* Icon & Installments Avatar */}
            <div className="h-12 w-12 rounded-full bg-navy/5 flex items-center justify-center shrink-0 border border-navy/10 relative">
              <IconComp className="h-5 w-5 text-navy/40 absolute" />
              <span className="font-bold text-navy z-10">{cond.installments}x</span>
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg text-navy truncate">{cond.name}</h3>
                {!cond.is_active && (
                  <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                )}
                {cond.discount_percentage > 0 && (
                  <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]" title="Desconto Global">
                    -{cond.discount_percentage}%
                  </Badge>
                )}
                {cond.min_installment_value > 0 && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Min R$ {cond.min_installment_value.toFixed(2)}
                  </Badge>
                )}
                {(cond.surcharge_percentage > 0) && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]" title="Acréscimo">
                    +{cond.surcharge_percentage}%
                  </Badge>
                )}
                {usageCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]" title="Vezes utilizada em Pedidos">
                    📦 {usageCount} {usageCount === 1 ? 'uso' : 'usos'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {cond.description || 'Nenhuma descrição fornecida.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0 mt-2 sm:mt-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:text-primary"
                onClick={onClone}
              >
                <Copy className="h-4 w-4 mr-1.5" /> Clonar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:text-navy"
                onClick={onEdit}
              >
                <Edit2 className="h-4 w-4 mr-1.5" /> Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:text-destructive"
                onClick={onDeleteRequest}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function PaymentConditionList({ conditions: initialConditions, usageCounts, loading, onEdit, onClone }: PaymentConditionListProps) {
  const [conditions, setConditions] = useState<PaymentCondition[]>(initialConditions)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    setConditions(initialConditions)
  }, [initialConditions])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (over && active.id !== over.id) {
      setConditions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        
        const newArray = arrayMove(items, oldIndex, newIndex)
        
        // Re-assign sort_order sequentially inside the frontend to match visual order
        newArray.forEach((item, idx) => {
          item.sort_order = idx + 1
        })
        
        // Push the update to server
        const payload = newArray.map(c => ({ id: c.id, sort_order: c.sort_order }))
        reorderPaymentConditions(payload).then(res => {
          if (res.error) {
            toast.error(res.error)
            setConditions(initialConditions) // rollback
          }
        })
        
        return newArray
      })
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    
    const result = await deletePaymentCondition(deletingId)
    
    setIsDeleting(false)
    setDeletingId(null)
    
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Condição de pagamento removida com sucesso!')
      setConditions(prev => prev.filter(c => c.id !== deletingId))
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="glass-card border-0">
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
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

  const filteredConditions = conditions.filter(c => {
    if (filter === 'active') return c.is_active
    if (filter === 'inactive') return !c.is_active
    return true
  })

  return (
    <div className="space-y-4">
      
      {/* Filters */}
      <div className="flex justify-between items-center bg-white/40 p-1.5 rounded-xl border">
        <Tabs defaultValue="all" value={filter} onValueChange={(v: any) => setFilter(v)} className="w-full sm:w-auto">
          <TabsList className="bg-transparent h-9">
            <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-sm">
              Todas ({conditions.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-sm text-green-600 data-[state=active]:text-green-700">
              Ativas ({conditions.filter(c => c.is_active).length})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg text-sm text-muted-foreground">
              Inativas ({conditions.filter(c => !c.is_active).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {filteredConditions.length === 0 ? (
        <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Nenhuma condição {filter !== 'all' && (filter === 'active' ? 'ativa ' : 'inativa ')}encontrada</h3>
          <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
            Crie formas de pagamento ou altere os filtros.
          </p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={filteredConditions.map(c => c.id)} 
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              <AnimatePresence>
                {filteredConditions.map((cond) => (
                  <motion.div
                    key={cond.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <SortablePaymentCard 
                      cond={cond}
                      usageCount={usageCounts[cond.id] || 0}
                      onEdit={() => onEdit(cond)}
                      onClone={() => onClone(cond)}
                      onDeleteRequest={() => setDeletingId(cond.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Delete Protecion Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open: boolean) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Tem certeza que deseja remover?</AlertDialogTitle>
            <AlertDialogDescription>
              A operação é irreversível. O sistema irá bloquear internamente a exclusão se existirem vínculos com Pedidos ou Relatórios ativos para preservar integridade.
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
              {isDeleting ? 'Removendo...' : 'Remover Condição'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
