'use client'

import { Filter, Calendar, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { OrderStatus } from '@/lib/types'

const statusConfig: Record<OrderStatus, { label: string }> = {
    pending: { label: 'Em Análise' },
    approved: { label: 'Aprovado' },
    in_production: { label: 'Em Produção' },
    shipped: { label: 'Enviado' },
    delivered: { label: 'Entregue' },
    cancelled: { label: 'Cancelado' },
}

interface OrderFiltersProps {
    statusFilter: string
    dateFilter: string
    onStatusChange: (status: string) => void
    onDateChange: (date: string) => void
    onClearAll?: () => void
}

export function OrderFilters({
    statusFilter,
    dateFilter,
    onStatusChange,
    onDateChange,
    onClearAll
}: OrderFiltersProps) {
    return (
        <div className="space-y-6 pb-6">
            {/* Status Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold font-heading text-navy flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Status do Pedido
                    </h3>
                    {statusFilter !== 'all' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                </div>
                <Select value={statusFilter} onValueChange={(val) => onStatusChange(val ?? 'all')}>
                    <SelectTrigger className="w-full h-11 bg-muted/30 border-border/40 rounded-xl focus:ring-primary/20 transition-all">
                        <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/40 shadow-xl">
                        <SelectItem value="all">Todos os status</SelectItem>
                        {(Object.keys(statusConfig) as OrderStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                                {statusConfig[status].label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Date Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold font-heading text-navy flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Período
                    </h3>
                    {dateFilter !== 'all' && (
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                </div>
                <Select value={dateFilter} onValueChange={(val) => onDateChange(val ?? 'all')}>
                    <SelectTrigger className="w-full h-11 bg-muted/30 border-border/40 rounded-xl focus:ring-primary/20 transition-all">
                        <SelectValue placeholder="Todo o período" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border/40 shadow-xl">
                        <SelectItem value="all">Todo o período</SelectItem>
                        <SelectItem value="7">Últimos 7 dias</SelectItem>
                        <SelectItem value="30">Últimos 30 dias</SelectItem>
                        <SelectItem value="90">Últimos 90 dias</SelectItem>
                        <SelectItem value="180">Últimos 6 meses</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Clear All Footer */}
            {(statusFilter !== 'all' || dateFilter !== 'all') && onClearAll && (
                <div className="pt-2">
                    <Button
                        variant="ghost"
                        className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl gap-2 transition-colors"
                        onClick={onClearAll}
                    >
                        <X className="h-4 w-4" />
                        Limpar todos os filtros
                    </Button>
                </div>
            )}
        </div>
    )
}
