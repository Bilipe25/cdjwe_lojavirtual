import React, { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Building, User, CreditCard, Calendar, Clock, History, Printer, Loader2 } from 'lucide-react'
import { statusConfig } from './OrderFilters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'

interface OrderDetailModalProps {
    order: any | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function OrderDetailModal({
    order,
    open,
    onOpenChange,
}: OrderDetailModalProps) {
    const [history, setHistory] = useState<any[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [isPrinting, setIsPrinting] = useState(false)
    const [settings, setSettings] = useState<any>(null)

    useEffect(() => {
        if (open && order?.id) {
            fetchHistory(order.id)
            fetchSettings()
        } else {
            setHistory([])
        }
    }, [open, order?.id])

    const fetchSettings = async () => {
        const supabase = createClient()
        const { data } = await supabase.from('system_settings').select('*').limit(1).single()
        if (data) setSettings(data)
    }

    const fetchHistory = async (orderId: string) => {
        setLoadingHistory(true)
        const supabase = createClient()
        const { data, error } = await supabase
            .from('order_status_history')
            .select(`
                id, 
                status, 
                created_at, 
                changed_by,
                profile:profiles!changed_by(full_name)
            `)
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })

        if (!error && data) {
            setHistory(data)
        }
        setLoadingHistory(false)
    }

    const handlePrint = async () => {
        if (!order) return
        setIsPrinting(true)
        try {
            await generateOrderReceiptPDF(order, order.items || [], settings)
        } finally {
            setIsPrinting(false)
        }
    }

    if (!order) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-full! sm:max-w-[90vw]! md:max-w-3xl! w-full sm:w-[90vw]! h-dvh sm:h-[85vh] md:max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-0 sm:border rounded-none sm:rounded-xl">
                <DialogHeader className="p-4 md:p-6 pb-4 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-sm shrink-0">
                    <div className="flex items-center justify-between pr-8 sm:pr-4">
                        <div className="min-w-0 pr-2 flex-1">
                            <DialogTitle className="text-xl md:text-2xl font-(family-name:--font-heading) flex flex-wrap items-center gap-2 sm:gap-3">
                                <span className="truncate">Pedido {order.order_number}</span>
                                <Badge className={`${statusConfig[order.status as keyof typeof statusConfig]?.color} border text-[10px] sm:text-xs`}>
                                    {statusConfig[order.status as keyof typeof statusConfig]?.label}
                                </Badge>
                            </DialogTitle>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
                                {format(new Date(order.created_at), "dd 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        </div>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="shrink-0 gap-2 h-9 rounded-lg border-navy/20 text-navy hover:bg-navy/5 font-bold shadow-xs transition-all"
                            onClick={handlePrint}
                            disabled={isPrinting}
                        >
                            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin text-bronze" /> : <Printer className="h-4 w-4" />}
                            <span className="hidden sm:inline">Imprimir Comprovante</span>
                            <span className="sm:hidden">Imprimir</span>
                        </Button>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8">
                    {/* General Information Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-muted/30 p-4 rounded-xl space-y-3 border border-border/50">
                            <h4 className="font-semibold text-sm flex items-center gap-2 text-navy">
                                <Building className="h-4 w-4" /> Dados do Lojista
                            </h4>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-muted-foreground">Razão Social:</span> <span className="font-medium">{order.store?.company_name || 'N/A'}</span></p>
                                <p><span className="text-muted-foreground">CNPJ:</span> <span className="font-medium">{order.store?.cnpj || 'N/A'}</span></p>
                                <p><span className="text-muted-foreground">Representante:</span> <span className="font-medium">{order.profile?.full_name || 'N/A'}</span></p>
                            </div>
                        </div>

                        <div className="bg-muted/30 p-4 rounded-xl space-y-3 border border-border/50">
                            <h4 className="font-semibold text-sm flex items-center gap-2 text-navy">
                                <CreditCard className="h-4 w-4" /> Dados de Pagamento
                            </h4>
                            <div className="space-y-1 text-sm">
                                <p><span className="text-muted-foreground">Condição Comercial:</span> <span className="font-medium">{order.payment_condition?.name || 'Não Informada'}</span></p>
                                <p className="text-muted-foreground">Este pedido será faturado de acordo com a condição atrelada no ato do carrinho.</p>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Order Items */}
                    <div>
                        <h4 className="font-bold text-lg mb-4 text-navy">Itens Solicitados ({order.items?.length || 0})</h4>
                        <div className="space-y-3">
                            {order.items?.map((item: any) => (
                                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/50 hover:border-bronze/30 transition-colors bg-white">
                                    <div className="min-w-0 pr-4 mb-2 sm:mb-0">
                                        <p className="font-semibold text-base text-navy">{item.product_name}</p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                            <Badge variant="secondary" className="font-normal">{item.fabric_name}</Badge>
                                            <span className="text-muted-foreground text-xs">•</span>
                                            <span className="text-sm text-muted-foreground">{item.color_name}</span>
                                            {item.size && (
                                                <>
                                                    <span className="text-muted-foreground text-xs">•</span>
                                                    <span className="text-sm text-muted-foreground font-medium">Tam: {item.size}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right shrink-0 bg-muted/20 sm:bg-transparent p-2 sm:p-0 rounded-md">
                                        <p className="text-sm text-muted-foreground mb-0.5">{item.quantity}x de R$ {item.unit_price.toFixed(2)}</p>
                                        <p className="font-bold text-lg text-gradient-bronze">R$ {item.subtotal.toFixed(2)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Order Notes & Totals */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="order-2 md:order-1">
                            <h4 className="font-semibold text-sm mb-2 text-navy">Observações do Pedido</h4>
                            <div className="bg-amber-50/50 text-amber-900 rounded-xl p-4 border border-amber-100 min-h-[100px] text-sm">
                                {order.notes ? <p>{order.notes}</p> : <p className="text-amber-700/50 italic">Nenhuma observação informada pelo lojista neste pedido.</p>}
                            </div>
                        </div>
                        
                        <div className="order-1 md:order-2 bg-navy/5 p-6 rounded-xl border border-navy/10 space-y-2 text-sm flex flex-col justify-center">
                            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal dos Produtos</span><span className="font-medium">R$ {order.subtotal?.toFixed(2) || '0.00'}</span></div>
                            {order.discount_amount > 0 && (
                                <div className="flex justify-between text-green-600 font-medium"><span>Descontos Aplicados</span><span>- R$ {order.discount_amount.toFixed(2)}</span></div>
                            )}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center pt-1">
                                <span className="font-bold text-base text-navy">Total do Pedido</span>
                                <span className="font-black text-2xl text-gradient-bronze">R$ {order.total?.toFixed(2) || '0.00'}</span>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Brand New: Audit Trail / Status History */}
                    <div>
                        <h4 className="font-bold text-lg mb-4 text-navy flex items-center gap-2">
                            <History className="h-5 w-5" /> Trilha de Auditoria
                        </h4>
                        
                        {loadingHistory ? (
                            <div className="space-y-4">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">Não há transições de status registradas ainda.</p>
                        ) : (
                            <div className="relative border-l-2 border-muted ml-4 pl-6 space-y-6">
                                {history.map((record, index) => {
                                    const cnf = statusConfig[record.status as keyof typeof statusConfig];
                                    return (
                                        <div key={record.id} className="relative">
                                            {/* Timeline dot */}
                                            <div className={`absolute -left-[35px] h-4 w-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${cnf?.color || 'bg-gray-200'}`}>
                                            </div>
                                            
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border rounded-lg p-3 shadow-sm">
                                                <div className="mb-1 sm:mb-0">
                                                    <p className="font-medium text-sm flex items-center gap-2">
                                                        Status alterado para <Badge variant="outline" className={cnf?.color}>{cnf?.label}</Badge>
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <User className="h-3 w-3" />
                                                        Por {record.profile?.full_name || 'Sistema/Admin'}
                                                    </p>
                                                </div>
                                                <p className="text-xs font-mono text-muted-foreground flex items-center gap-1 bg-muted/50 px-2 py-1 rounded">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(record.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    {/* Padding bottom buffer */}
                    <div className="h-4"></div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
