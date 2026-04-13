'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { motion } from 'framer-motion'

// UI Components
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'

// Icons
import {
  ArrowLeft, Building, User, Clock, History, Printer, Loader2,
  Package, CreditCard, FileText, Hash, ShieldCheck,
  MapPin, Receipt, Copy, ExternalLink,
} from 'lucide-react'

// Sub-components
import { statusConfig } from '../components/OrderFilters'
import { FiscalSection } from '../components/FiscalSection'
import { OrderPaymentSummaryCard } from '@/components/orders/OrderPaymentSummaryCard'
import { generateOrderReceiptPDF } from '@/lib/utils/pdf-order-generator'
import type { OrderStatus, OrderItem, SystemSettings } from '@/lib/types'

// ─── Types ────────────────────────────────────────

interface OrderDetail {
  id: string
  order_number: string
  status: OrderStatus
  total: number
  subtotal: number
  discount_amount: number
  coupon_code?: string | null
  coupon_discount_type?: 'percentage' | 'fixed' | null
  coupon_discount_value?: number | null
  coupon_discount_amount?: number | null
  created_at: string
  notes: string | null
  sales_channel?: 'customer_portal' | 'representative' | null
  payment_method_name?: string | null
  payment_method_code?: string | null
  payment_condition_name?: string | null
  payment_condition_description?: string | null
  payment_installments?: number | null
  payment_discount_percentage?: number | null
  payment_surcharge_percentage?: number | null
  store?: { company_name?: string | null; cnpj?: string | null } | null
  customer_profile?: { full_name?: string | null } | null
  created_by_profile?: { full_name?: string | null; role?: string | null } | null
  payment_condition?: {
    name?: string | null
    description?: string | null
    installments?: number | null
    discount_percentage?: number | null
    surcharge_percentage?: number | null
  } | null
  items?: OrderItem[]
}

interface StatusHistoryRecord {
  id: string
  status: string
  created_at: string
  changed_by: string
  notes?: string | null
  profile?: { full_name?: string | null } | null
}

// ─── Page ─────────────────────────────────────────

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<StatusHistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [settings, setSettings] = useState<SystemSettings | null>(null)

  const fetchOrder = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total, subtotal, discount_amount,
        coupon_code, coupon_discount_type, coupon_discount_value, coupon_discount_amount,
        created_at, notes, sales_channel,
        payment_method_name, payment_method_code,
        payment_condition_name, payment_condition_description,
        payment_installments, payment_discount_percentage, payment_surcharge_percentage,
        store:stores(company_name, cnpj),
        customer_profile:profiles!orders_profile_id_fkey(full_name),
        created_by_profile:profiles!orders_created_by_profile_id_fkey(full_name, role),
        payment_condition:payment_conditions(name, description, installments, discount_percentage, surcharge_percentage),
        items:order_items(*)
      `)
      .eq('id', orderId)
      .single()

    if (error || !data) {
      toast.error('Pedido não encontrado.')
      setLoading(false)
      return
    }

    const resolved = data as OrderDetail

    // Fallback for empty items
    if (!Array.isArray(resolved.items) || resolved.items.length === 0) {
      const { data: fallbackItems } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at')
      if (fallbackItems) resolved.items = fallbackItems as OrderItem[]
    }

    setOrder(resolved)
    setLoading(false)
  }, [orderId])

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('order_status_history')
      .select('id, status, created_at, changed_by, profile:profiles!changed_by(full_name)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (data) setHistory(data as StatusHistoryRecord[])
    setLoadingHistory(false)
  }, [orderId])

  const fetchSettings = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('system_settings').select('*').limit(1).single()
    if (data) setSettings(data)
  }

  useEffect(() => {
    fetchOrder()
    fetchHistory()
    fetchSettings()
  }, [fetchOrder, fetchHistory])

  const handlePrint = async () => {
    if (!order) return
    setIsPrinting(true)
    try {
      await generateOrderReceiptPDF(order, order.items || [], settings)
      toast.success('PDF gerado!')
    } finally {
      setIsPrinting(false)
    }
  }

  const copyChave = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado!')
  }

  // ─── Loading State ──────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/admin/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar aos Pedidos
        </Button>
      </div>
    )
  }

  const config = statusConfig[order.status]
  const isRepresentative = order.sales_channel === 'representative'
  const customerName = order.customer_profile?.full_name || 'N/A'
  const repName = order.created_by_profile?.full_name || (isRepresentative ? 'N/A' : 'Portal do Cliente')
  const items = order.items || []
  const couponDiscount = Number(order.coupon_discount_amount || 0)
  const paymentDiscount = Math.max(0, Number(order.discount_amount || 0) - couponDiscount)

  // ─── Render ─────────────────────────────────────

  return (
    <div className="space-y-6 pb-12">
      {/* ─── Top Bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl h-10 w-10 hover:bg-navy/5"
            onClick={() => router.push('/admin/orders')}
          >
            <ArrowLeft className="h-5 w-5 text-navy" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-heading text-gradient-navy truncate">
                {order.order_number}
              </h1>
              <Badge className={`${config.color} border text-xs`}>
                {config.label}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs ${isRepresentative ? 'border-primary/30 bg-primary/5 text-primary' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}
              >
                {isRepresentative ? 'Representante' : 'Cliente'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {format(new Date(order.created_at), "dd 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl font-bold text-navy border-navy/20 hover:bg-navy/5 h-9"
            onClick={handlePrint}
            disabled={isPrinting}
          >
            {isPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span className="hidden sm:inline">Comprovante</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-xl font-bold text-navy border-navy/20 hover:bg-navy/5 h-9"
            onClick={() => window.open(`/admin/fiscal-review/${orderId}`, '_blank')}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Revisão Fiscal</span>
          </Button>
        </div>
      </motion.div>

      {/* ─── Summary Cards Row ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <SummaryCard icon={Package} label="Itens" value={String(items.length)} color="text-blue-600 bg-blue-50" />
        <SummaryCard icon={CreditCard} label="Subtotal" value={`R$ ${order.subtotal?.toFixed(2)}`} color="text-emerald-600 bg-emerald-50" />
        <SummaryCard icon={Receipt} label="Desconto" value={`R$ ${order.discount_amount?.toFixed(2)}`} color="text-orange-600 bg-orange-50" />
        <SummaryCard icon={Hash} label="Total" value={`R$ ${order.total?.toFixed(2)}`} color="text-navy bg-navy/5" bold />
      </motion.div>

      {/* ─── Tabs Layout ─── */}
      <Tabs defaultValue="details">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="details" className="gap-1.5 text-xs sm:text-sm">
            <Building className="h-3.5 w-3.5" /> Detalhes
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5 text-xs sm:text-sm">
            <Package className="h-3.5 w-3.5" /> Itens
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5" /> Fiscal
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
            <History className="h-3.5 w-3.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab: Items ─── */}
        <TabsContent value="items">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-bold">Produto</TableHead>
                      <TableHead className="text-xs font-bold">Tecido / Cor</TableHead>
                      <TableHead className="text-xs font-bold text-center">Tam</TableHead>
                      <TableHead className="text-xs font-bold text-right">Qtd</TableHead>
                      <TableHead className="text-xs font-bold text-right">Unit (R$)</TableHead>
                      <TableHead className="text-xs font-bold text-right">Total (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum item encontrado neste pedido.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/20">
                          <TableCell>
                            <span className="font-medium text-navy text-sm">{item.product_name}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="font-normal text-[10px]">{item.fabric_name}</Badge>
                              <span className="text-xs text-muted-foreground">{item.color_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-medium">{item.size || '—'}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold text-sm text-gradient-bronze">{item.subtotal.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Totals Footer */}
              <div className="border-t bg-muted/10 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal ({items.length} itens)</span>
                  <span className="font-medium">R$ {order.subtotal?.toFixed(2)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Cupom ({order.coupon_code})</span>
                    <span>- R$ {couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {paymentDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Desc. pagamento</span>
                    <span>- R$ {paymentDiscount.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-navy">Total</span>
                  <span className="font-black text-2xl text-gradient-bronze">R$ {order.total?.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: Details ─── */}
        <TabsContent value="details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Store / Customer */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <h4 className="font-bold text-sm flex items-center gap-2 text-navy">
                  <Building className="h-4 w-4" /> Dados do Lojista
                </h4>
                <div className="space-y-2 text-sm">
                  <DetailRow label="Razão Social" value={order.store?.company_name || 'N/A'} />
                  <DetailRow label="CNPJ" value={order.store?.cnpj || 'N/A'} />
                  <DetailRow label="Cliente" value={customerName} />
                  <DetailRow label="Origem" value={isRepresentative ? 'Representante' : 'Portal do cliente'} />
                  <DetailRow label="Representante" value={repName} />
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <OrderPaymentSummaryCard
              order={order}
              title="Dados de Pagamento"
              variant="panel"
            />

            {/* Notes */}
            <Card className="border-0 shadow-sm md:col-span-2">
              <CardContent className="p-5">
                <h4 className="font-bold text-sm mb-3 text-navy">Observações do Pedido</h4>
                <div className="bg-amber-50/50 text-amber-900 rounded-xl p-4 border border-amber-100 min-h-[60px] text-sm">
                  {order.notes
                    ? <p>{order.notes}</p>
                    : <p className="text-amber-700/50 italic">Nenhuma observação informada.</p>
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Tab: Fiscal ─── */}
        <TabsContent value="fiscal">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <FiscalSection orderId={order.id} orderStatus={order.status} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Tab: History ─── */}
        <TabsContent value="history">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <h4 className="font-bold text-sm mb-4 text-navy flex items-center gap-2">
                <History className="h-4 w-4" /> Trilha de Auditoria
              </h4>

              {loadingHistory ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
                  Nenhuma transição de status registrada.
                </p>
              ) : (
                <div className="relative border-l-2 border-muted ml-4 pl-6 space-y-5">
                  {history.map((record) => {
                    const cnf = statusConfig[record.status as keyof typeof statusConfig]
                    return (
                      <div key={record.id} className="relative">
                        <div className={`absolute -left-[35px] h-4 w-4 rounded-full border-2 border-white shadow-sm ${cnf?.color || 'bg-gray-200'}`} />
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border rounded-lg p-3 shadow-sm">
                          <div>
                            <p className="font-medium text-sm flex items-center gap-2">
                              {cnf?.label && <Badge variant="outline" className={cnf.color}>{cnf.label}</Badge>}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {record.profile?.full_name || 'Sistema'}
                            </p>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground flex items-center gap-1 bg-muted/50 px-2 py-1 rounded mt-2 sm:mt-0">
                            <Clock className="h-3 w-3" />
                            {format(new Date(record.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Sub-Components ─────────────────────────────

function SummaryCard({ icon: Icon, label, value, color, bold }: {
  icon: React.ElementType; label: string; value: string; color: string; bold?: boolean
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-sm truncate ${bold ? 'font-black text-navy' : 'font-bold'}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  )
}
