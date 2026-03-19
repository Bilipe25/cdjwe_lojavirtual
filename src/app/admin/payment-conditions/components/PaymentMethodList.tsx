'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
    Banknote,
    ChevronRight,
    CreditCard,
    Landmark,
    MonitorSmartphone,
    MoreHorizontal,
    QrCodeIcon,
    Trash2,
    Wallet,
} from 'lucide-react'
import type { PaymentMethod } from '@/lib/types'
import { deletePaymentMethod } from '../actions'

const ICONS: Record<string, React.ElementType> = {
    pix: QrCodeIcon,
    'credit-card': CreditCard,
    banknote: Banknote,
    'bank-transfer': Landmark,
    smartphone: MonitorSmartphone,
    wallet: Wallet,
}

interface PaymentMethodListProps {
    methods: PaymentMethod[]
    loading?: boolean
    usageCounts: Record<string, number>
    onOpenMethod: (method: PaymentMethod) => void
}

export function PaymentMethodList({
    methods,
    loading = false,
    usageCounts,
    onOpenMethod,
}: PaymentMethodListProps) {
    const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const handleDelete = async () => {
        if (!deletingMethodId) return
        setIsDeleting(true)

        const result = await deletePaymentMethod(deletingMethodId)
        setIsDeleting(false)
        setDeletingMethodId(null)

        if (result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Meio removido com sucesso!')
        router.refresh()
    }

    if (loading) {
        return (
            <Card className="border-slate-200 shadow-sm">
                <CardContent className="divide-y divide-slate-200 p-0">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="flex items-center gap-4 px-4 py-4">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-64" />
                            </div>
                            <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        )
    }

    if (methods.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 py-14 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                    <CreditCard className="h-7 w-7 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900">Nenhum meio de pagamento cadastrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Crie o primeiro meio para organizar a experiência de pagamento do checkout.
                </p>
            </div>
        )
    }

    return (
        <>
            <Card className="overflow-hidden border-slate-200 shadow-sm">
                <CardContent className="divide-y divide-slate-200 p-0">
                    {methods.map((method) => {
                        const IconComp = method.icon && ICONS[method.icon] ? ICONS[method.icon] : CreditCard
                        const activeConditionsCount =
                            method.conditions?.filter((condition) => condition.is_active).length || 0
                        const totalConditionsCount = method.conditions?.length || 0
                        const usageCount = usageCounts[method.id] || 0

                        return (
                            <div
                                key={method.id}
                                className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/80 lg:flex-row lg:items-center"
                            >
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-navy/10 bg-navy/5 text-navy">
                                        <IconComp className="h-4.5 w-4.5" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="truncate text-sm font-semibold text-slate-950">{method.name}</h3>
                                            {!method.is_active && <Badge variant="secondary">Inativo</Badge>}
                                            {usageCount > 0 && (
                                                <Badge className="border-blue-200 bg-blue-100 text-blue-800">
                                                    {usageCount} {usageCount === 1 ? 'pedido' : 'pedidos'}
                                                </Badge>
                                            )}
                                        </div>

                                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                                            {method.description || 'Sem descrição institucional cadastrada.'}
                                        </p>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                                {activeConditionsCount} ativa{activeConditionsCount === 1 ? '' : 's'}
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                                {totalConditionsCount} condição{totalConditionsCount === 1 ? '' : 'ões'}
                                            </Badge>
                                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                                Cód. {method.code}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 lg:self-center">
                                    <Button
                                        variant="ghost"
                                        className="h-9 gap-1.5 rounded-lg px-3 text-slate-700 hover:bg-slate-100"
                                        onClick={() => onOpenMethod(method)}
                                    >
                                        Abrir
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><MoreHorizontal className="h-4 w-4" /></Button>} />
                                        <DropdownMenuContent align="end" className="min-w-44">
                                            <DropdownMenuItem onClick={() => onOpenMethod(method)}>
                                                <ChevronRight className="h-4 w-4" />
                                                Abrir meio
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onClick={() => setDeletingMethodId(method.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Excluir meio
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        )
                    })}
                </CardContent>
            </Card>

            <AlertDialog open={Boolean(deletingMethodId)} onOpenChange={(open) => !open && setDeletingMethodId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover meio de pagamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se este meio já estiver em pedidos, regras de tabela ou vínculos ativos, a exclusão será bloqueada para proteger a integridade do sistema.
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
                            {isDeleting ? 'Removendo...' : 'Remover meio'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
