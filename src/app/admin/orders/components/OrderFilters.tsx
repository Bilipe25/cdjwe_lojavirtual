import React, { useEffect, useState } from 'react'
import {
    Search,
    Download,
    CheckCircle,
    Truck,
    Factory,
    XCircle,
    Package,
    ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { OrderStatus } from '@/lib/types'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const statusConfig: Record<
    OrderStatus,
    { label: string; color: string; icon: React.ElementType }
> = {
    pending: {
        label: 'Em Analise',
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        icon: ClipboardList,
    },
    approved: {
        label: 'Aprovado',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: CheckCircle,
    },
    in_production: {
        label: 'Em Producao',
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: Factory,
    },
    shipped: {
        label: 'Enviado',
        color: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        icon: Truck,
    },
    delivered: {
        label: 'Entregue',
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: Package,
    },
    cancelled: {
        label: 'Cancelado',
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
    },
}

interface OrderFiltersProps {
    onSearch: (term: string) => void
    currentSearch: string
    onStatusChange: (status: string | null) => void
    currentStatus: string
    onArchiveVisibilityChange: (visibility: 'active' | 'archived' | 'all') => void
    currentArchiveVisibility: 'active' | 'archived' | 'all'
    onExport: () => void
    selectedCount: number
    onBulkUpdateStatus: (newStatus: OrderStatus) => void
}

export function OrderFilters({
    onSearch,
    currentSearch,
    onStatusChange,
    currentStatus,
    onArchiveVisibilityChange,
    currentArchiveVisibility,
    onExport,
    selectedCount,
    onBulkUpdateStatus,
}: OrderFiltersProps) {
    const [inputValue, setInputValue] = useState(currentSearch)

    useEffect(() => {
        const timer = setTimeout(() => {
            if (inputValue !== currentSearch) {
                onSearch(inputValue)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [inputValue, onSearch, currentSearch])

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por pedido, razao social, CNPJ, representante ou observacoes..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="h-11 bg-white/60 pl-9"
                        title="Busca em pedido, observacoes, razao social, CNPJ e representante."
                    />
                </div>

                <Select value={currentStatus} onValueChange={onStatusChange}>
                    <SelectTrigger className="h-11 w-full bg-white/60 sm:w-48">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        {(Object.keys(statusConfig) as OrderStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                                {statusConfig[status].label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={currentArchiveVisibility}
                    onValueChange={(value) => onArchiveVisibilityChange(value as 'active' | 'archived' | 'all')}
                >
                    <SelectTrigger className="h-11 w-full bg-white/60 sm:w-48">
                        <SelectValue placeholder="Visibilidade" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">Pedidos ativos</SelectItem>
                        <SelectItem value="archived">Pedidos arquivados</SelectItem>
                        <SelectItem value="all">Todos os pedidos</SelectItem>
                    </SelectContent>
                </Select>

                <Button variant="outline" className="h-11 shrink-0 gap-2" onClick={onExport}>
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Exportar Excel</span>
                </Button>
            </div>

            <div
                className={`overflow-hidden transition-all duration-300 ${
                    selectedCount > 0 ? 'h-14 opacity-100' : 'h-0 opacity-0'
                }`}
            >
                <div className="flex h-full items-center justify-between rounded-lg border border-bronze/20 bg-bronze/10 px-4">
                    <span className="text-sm font-medium text-bronze-dark">
                        {selectedCount} {selectedCount === 1 ? 'pedido selecionado' : 'pedidos selecionados'}
                    </span>
                    <div className="flex gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button size="sm" className="gradient-bronze border-0 text-white shadow-sm" />
                                }
                            >
                                Alterar Status
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('approved')}>
                                    <CheckCircle className="mr-2 h-4 w-4 text-blue-600" />
                                    Aprovar lote
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('in_production')}>
                                    <Factory className="mr-2 h-4 w-4 text-purple-600" />
                                    Mandar para producao
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('shipped')}>
                                    <Truck className="mr-2 h-4 w-4 text-cyan-600" />
                                    Marcar como enviados
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('delivered')}>
                                    <Package className="mr-2 h-4 w-4 text-green-600" />
                                    Marcar como entregues
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </div>
    )
}
