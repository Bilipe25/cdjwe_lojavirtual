import React, { useState, useEffect } from 'react'
import {
    Search,
    Download,
    CheckCircle,
    Truck,
    Factory,
    XCircle,
    Package,
    ClipboardList
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

export const statusConfig: Record<OrderStatus, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Em Análise', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: ClipboardList },
    approved: { label: 'Aprovado', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle },
    in_production: { label: 'Em Produção', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Factory },
    shipped: { label: 'Enviado', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Truck },
    delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200', icon: Package },
    cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
}

interface OrderFiltersProps {
    onSearch: (term: string) => void;
    currentSearch: string;
    onStatusChange: (status: string | null) => void;
    currentStatus: string;
    onExport: () => void;
    selectedCount: number;
    onBulkUpdateStatus: (newStatus: OrderStatus) => void;
}

export function OrderFilters({
    onSearch,
    currentSearch,
    onStatusChange,
    currentStatus,
    onExport,
    selectedCount,
    onBulkUpdateStatus
}: OrderFiltersProps) {
    const [inputValue, setInputValue] = useState(currentSearch);

    // Smart Debounce
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
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nº do pedido, razão social ou CNPJ..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="pl-9 h-11 bg-white/60"
                        title="Dica: Você pode pesquisar pelo nome da empresa ou documento."
                    />
                </div>
                
                <Select value={currentStatus} onValueChange={onStatusChange}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        {(Object.keys(statusConfig) as OrderStatus[]).map(s => (
                            <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button variant="outline" className="h-11 gap-2 shrink-0" onClick={onExport}>
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Exportar Excel</span>
                </Button>
            </div>

            {/* Bulk Actions Bar */}
            <div className={`transition-all duration-300 overflow-hidden ${selectedCount > 0 ? 'h-14 opacity-100' : 'h-0 opacity-0'}`}>
                <div className="h-full bg-bronze/10 border border-bronze/20 rounded-lg flex items-center justify-between px-4">
                    <span className="text-sm font-medium text-bronze-dark">
                        {selectedCount} {selectedCount === 1 ? 'pedido selecionado' : 'pedidos selecionados'}
                    </span>
                    <div className="flex gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="gradient-bronze border-0 text-white shadow-sm">
                                    Alterar Status
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('approved')}>
                                    <CheckCircle className="h-4 w-4 mr-2 text-blue-600" /> Aprovar Lote
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('in_production')}>
                                    <Factory className="h-4 w-4 mr-2 text-purple-600" /> Mandar P| Produção
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('shipped')}>
                                    <Truck className="h-4 w-4 mr-2 text-cyan-600" /> Marcar como Enviados
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onBulkUpdateStatus('delivered')}>
                                    <Package className="h-4 w-4 mr-2 text-green-600" /> Marcar como Entregues
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </div>
    )
}
