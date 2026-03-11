import React from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
    MoreHorizontal,
    Eye,
    XCircle,
    CheckSquare,
    Square,
    ClipboardList
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { statusConfig } from './OrderFilters'
import type { OrderStatus } from '@/lib/types'

const statusFlow: OrderStatus[] = ['pending', 'approved', 'in_production', 'shipped', 'delivered']

export interface OrderWithDetails {
    id: string;
    order_number: string;
    status: OrderStatus;
    total: number;
    subtotal: number;
    discount_amount: number;
    created_at: string;
    notes: string | null;
    store?: { company_name: string; cnpj: string };
    profile?: { full_name: string };
    payment_condition?: { name: string };
    items?: any[];
}

interface OrderListProps {
    orders: OrderWithDetails[];
    loading: boolean;
    selectedOrders: string[];
    onToggleSelect: (id: string) => void;
    onViewDetail: (order: OrderWithDetails) => void;
    onUpdateStatus: (id: string, newStatus: OrderStatus) => void;
}

export function OrderList({
    orders,
    loading,
    selectedOrders,
    onToggleSelect,
    onViewDetail,
    onUpdateStatus
}: OrderListProps) {

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="glass-card border-0">
                        <CardContent className="p-4 flex items-center gap-4">
                            <Skeleton className="h-6 w-6 rounded" />
                            <Skeleton className="h-10 w-10 rounded-lg" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-1/3" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                            <Skeleton className="h-8 w-24" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (orders.length === 0) {
        return (
            <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ClipboardList className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhum pedido encontrado</h3>
                <p className="text-muted-foreground text-sm mt-1">
                    Não existem pedidos que correspondam aos filtros atuais.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {orders.map((order, i) => {
                const config = statusConfig[order.status];
                const isSelected = selectedOrders.includes(order.id);

                return (
                    <motion.div 
                        key={order.id} 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    >
                        <Card 
                            className={`glass-card border-0 hover:shadow-md transition-all cursor-pointer ${
                                isSelected ? 'ring-2 ring-bronze bg-bronze/5' : ''
                            } ${order.status === 'cancelled' ? 'opacity-70 grayscale-[0.5]' : ''}`}
                            onClick={() => onViewDetail(order)}
                        >
                            <CardContent className="p-0">
                                <div className="flex flex-col sm:flex-row sm:items-center p-4 gap-4">
                                    
                                    {/* Selection & Icon */}
                                    <div className="flex items-center gap-4 shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onToggleSelect(order.id); }}
                                            className="h-8 w-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 border transition-colors shrink-0"
                                        >
                                            {isSelected ? (
                                                <CheckSquare className="h-5 w-5 text-bronze" />
                                            ) : (
                                                <Square className="h-5 w-5 text-muted-foreground/50" />
                                            )}
                                        </button>
                                        <div className={`h-10 w-10 flex-shrink-0 rounded-lg flex items-center justify-center ${config.color}`}>
                                            <config.icon className="h-5 w-5" />
                                        </div>
                                    </div>

                                    {/* Order Main Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="font-bold text-navy truncate" title={order.order_number}>
                                                {order.order_number}
                                            </h3>
                                            <Badge variant="outline" className={`text-[10px] ${config.color}`}>
                                                {config.label}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground truncate">
                                            <span className="font-medium text-slate-700 truncate max-w-[200px]" title={order.store?.company_name}>
                                                {order.store?.company_name || 'Sem Empresa'}
                                            </span>
                                            <span className="hidden sm:inline">•</span>
                                            <span className="truncate max-w-[150px]" title={order.profile?.full_name}>
                                                {order.profile?.full_name || 'Sem Cliente'}
                                            </span>
                                            <span className="hidden sm:inline">•</span>
                                            <span>
                                                {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="bg-muted px-1.5 py-0.5 rounded truncate max-w-[150px]">
                                                {order.payment_condition?.name || 'Condição N/A'}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'itens'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Group */}
                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0">
                                        <span className="text-lg font-bold text-gradient-bronze">
                                            R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy">
                                                        <MoreHorizontal className="h-5 w-5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onClick={() => onViewDetail(order)}>
                                                        <Eye className="h-4 w-4 mr-2" /> Ver Detalhes
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    
                                                    {statusFlow.map((s) => {
                                                        if (s === order.status) return null
                                                        const FlowIcon = statusConfig[s].icon
                                                        return (
                                                            <DropdownMenuItem key={s} onClick={() => onUpdateStatus(order.id, s)}>
                                                                <FlowIcon className="h-4 w-4 mr-2" />
                                                                Marcar como {statusConfig[s].label}
                                                            </DropdownMenuItem>
                                                        )
                                                    })}

                                                    {order.status !== 'cancelled' && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem 
                                                                onClick={() => onUpdateStatus(order.id, 'cancelled')} 
                                                                className="text-destructive focus:bg-destructive/10"
                                                            >
                                                                <XCircle className="h-4 w-4 mr-2" /> Cancelar Pedido
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )
            })}
        </div>
    )
}
