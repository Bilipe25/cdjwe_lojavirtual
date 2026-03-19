'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
    Banknote,
    Copy,
    CreditCard,
    Edit2,
    GripVertical,
    MonitorSmartphone,
    MoreHorizontal,
    QrCodeIcon,
    Trash2,
    Wallet,
} from 'lucide-react'
import type { PaymentCondition } from '@/lib/types'
import { deletePaymentCondition, reorderPaymentConditions } from '../actions'

const ICONS: Record<string, React.ElementType> = {
    'credit-card': CreditCard,
    banknote: Banknote,
    'qr-code': QrCodeIcon,
    smartphone: MonitorSmartphone,
    wallet: Wallet,
}

interface PaymentConditionListProps {
    conditions: PaymentCondition[]
    usageCounts: Record<string, number>
    loading: boolean
    onEdit: (condition: PaymentCondition) => void
    onClone: (condition: PaymentCondition) => void
}

function SortableConditionRow({
    condition,
    usageCount,
    onEdit,
    onClone,
    onDeleteRequest,
}: {
    condition: PaymentCondition
    usageCount: number
    onEdit: () => void
    onClone: () => void
    onDeleteRequest: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: condition.id,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 40 : 1,
        opacity: isDragging ? 0.82 : 1,
    }

    const IconComp = condition.icon && ICONS[condition.icon] ? ICONS[condition.icon] : CreditCard

    return (
        <div ref={setNodeRef} style={style} className="border-b border-slate-200 last:border-b-0">
            <div className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 md:flex-row md:items-center">
                <div
                    {...attributes}
                    {...listeners}
                    className="hidden cursor-grab items-center justify-center self-stretch px-1 text-slate-400 hover:text-navy md:flex"
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy/10 bg-navy/5 text-navy">
                        <IconComp className="absolute h-4 w-4 text-navy/25" />
                        <span className="relative text-xs font-bold">{condition.installments}x</span>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-slate-950">{condition.name}</h3>
                            {!condition.is_active && <Badge variant="secondary">Inativa</Badge>}
                            {condition.discount_percentage > 0 && (
                                <Badge className="border-green-200 bg-green-100 text-green-800">
                                    -{condition.discount_percentage}%
                                </Badge>
                            )}
                            {condition.surcharge_percentage > 0 && (
                                <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                                    +{condition.surcharge_percentage}%
                                </Badge>
                            )}
                            {usageCount > 0 && (
                                <Badge className="border-blue-200 bg-blue-100 text-blue-800">
                                    {usageCount} {usageCount === 1 ? 'uso' : 'usos'}
                                </Badge>
                            )}
                        </div>

                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                            {condition.description || 'Sem descrição comercial cadastrada.'}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            <span>Pedido mín. R$ {condition.min_order_value.toFixed(2)}</span>
                            {condition.max_order_value !== null && (
                                <span>Pedido máx. R$ {condition.max_order_value.toFixed(2)}</span>
                            )}
                            {condition.min_installment_value > 0 && (
                                <span>Parcela mín. R$ {condition.min_installment_value.toFixed(2)}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1 md:self-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                            <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem onClick={onEdit}>
                                <Edit2 className="h-4 w-4" />
                                Editar condição
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={onClone}>
                                <Copy className="h-4 w-4" />
                                Clonar condição
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={onDeleteRequest}>
                                <Trash2 className="h-4 w-4" />
                                Excluir condição
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    )
}

export function PaymentConditionList({
    conditions: initialConditions,
    usageCounts,
    loading,
    onEdit,
    onClone,
}: PaymentConditionListProps) {
    const [conditions, setConditions] = useState<PaymentCondition[]>(initialConditions)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
    const router = useRouter()

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    useEffect(() => {
        setConditions(initialConditions)
    }, [initialConditions])

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        setConditions((items) => {
            const oldIndex = items.findIndex((item) => item.id === active.id)
            const newIndex = items.findIndex((item) => item.id === over.id)
            const nextArray = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
                ...item,
                sort_order: index + 1,
            }))

            void reorderPaymentConditions(
                nextArray.map((item) => ({ id: item.id, sort_order: item.sort_order }))
            ).then((result) => {
                if (result.error) {
                    toast.error(result.error)
                    setConditions(initialConditions)
                    return
                }

                router.refresh()
            })

            return nextArray
        })
    }

    const handleDelete = async () => {
        if (!deletingId) return
        setIsDeleting(true)

        const result = await deletePaymentCondition(deletingId)
        setIsDeleting(false)
        setDeletingId(null)

        if (result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Condição removida com sucesso!')
        router.refresh()
    }

    if (loading) {
        return (
            <Card className="border-slate-200 shadow-sm">
                <CardContent className="divide-y divide-slate-200 p-0">
                    {[1, 2, 3].map((item) => (
                        <div key={item} className="flex items-center gap-4 px-4 py-4">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-56" />
                            </div>
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        )
    }

    const filteredConditions = conditions.filter((condition) => {
        if (filter === 'active') return condition.is_active
        if (filter === 'inactive') return !condition.is_active
        return true
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm">
                <Tabs value={filter} onValueChange={(value: string) => setFilter(value as typeof filter)}>
                    <TabsList className="h-9 bg-transparent p-0">
                        <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-slate-100">
                            Todas ({conditions.length})
                        </TabsTrigger>
                        <TabsTrigger value="active" className="rounded-lg data-[state=active]:bg-slate-100">
                            Ativas ({conditions.filter((condition) => condition.is_active).length})
                        </TabsTrigger>
                        <TabsTrigger value="inactive" className="rounded-lg data-[state=active]:bg-slate-100">
                            Inativas ({conditions.filter((condition) => !condition.is_active).length})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <p className="hidden text-xs text-slate-500 md:block">Arraste para reordenar a prioridade global.</p>
            </div>

            {filteredConditions.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white/60 py-14 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                        <CreditCard className="h-7 w-7 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">
                        Nenhuma condição {filter === 'active' ? 'ativa ' : filter === 'inactive' ? 'inativa ' : ''}encontrada
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">Crie condições comerciais ou ajuste os filtros.</p>
                </div>
            ) : (
                <Card className="overflow-hidden border-slate-200 shadow-sm">
                    <CardContent className="p-0">
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={filteredConditions.map((condition) => condition.id)} strategy={verticalListSortingStrategy}>
                                <AnimatePresence>
                                    {filteredConditions.map((condition) => (
                                        <motion.div
                                            key={condition.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            transition={{ duration: 0.16 }}
                                        >
                                            <SortableConditionRow
                                                condition={condition}
                                                usageCount={usageCounts[condition.id] || 0}
                                                onEdit={() => onEdit(condition)}
                                                onClone={() => onClone(condition)}
                                                onDeleteRequest={() => setDeletingId(condition.id)}
                                            />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </SortableContext>
                        </DndContext>
                    </CardContent>
                </Card>
            )}

            <AlertDialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover condição comercial?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A exclusão é permanente. Se a condição já estiver vinculada a pedidos ou meios de pagamento, o sistema bloqueará a operação para preservar a integridade.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault()
                                void handleDelete()
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Removendo...' : 'Remover condição'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
