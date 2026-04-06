'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, Search, TicketPercent, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type CouponStatusFilter = 'all' | 'active' | 'inactive' | 'expired' | 'scheduled'
type CouponTypeFilter = 'all' | 'percentage' | 'fixed'
type UsageStatusFilter = 'all' | 'reserved' | 'released'

type CouponOption = { id: string; name: string }

type CouponItem = {
    id: string
    code: string
    name: string
    description: string | null
    discountType: 'percentage' | 'fixed'
    discountValue: number
    minOrderAmount: number | null
    maxDiscountAmount: number | null
    maxUses: number | null
    currentUses: number
    maxUsesPerCustomer: number | null
    isCumulative: boolean
    isActive: boolean
    validFrom: string
    validUntil: string | null
    createdAt: string
    totalUses: number
    reservedUses: number
    releasedUses: number
    totalDiscountGranted: number
    customerTypeScopeIds: string[]
    priceTableScopeIds: string[]
    productScopeIds: string[]
    categoryScopeIds: string[]
}

type CouponSummary = {
    totalCoupons: number
    activeCoupons: number
    expiredCoupons: number
    inactiveCoupons: number
    totalUsages: number
}

type CouponUsageEntry = {
    id: string
    createdAt: string
    status: 'reserved' | 'released'
    discountAmount: number
    releaseReason: string | null
    order: { orderNumber: string | null }
    customer: { name: string | null; email: string | null }
}

type CouponUsageModalData = {
    coupon: { id: string; code: string; name: string; discountType: 'percentage' | 'fixed'; discountValue: number }
    summary: { totalUsages: number; reservedUsages: number; releasedUsages: number; uniqueCustomers: number; totalDiscountGranted: number }
    data: CouponUsageEntry[]
    pagination: { page: number; pageSize: number; total: number; hasMore: boolean }
}

type CouponFormState = {
    code: string
    name: string
    description: string
    discountType: 'percentage' | 'fixed'
    discountValue: string
    maxDiscountAmount: string
    minOrderAmount: string
    maxUses: string
    maxUsesPerCustomer: string
    isCumulative: boolean
    validFrom: string
    validUntil: string
    isActive: boolean
    customerTypeScopeIds: string[]
    priceTableScopeIds: string[]
    productScopeIds: string[]
    categoryScopeIds: string[]
}

const PAGE_SIZE = 20
const USAGE_PAGE_SIZE = 15

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

function toDateInput(value: string | null | undefined) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
}

function defaultFormState(): CouponFormState {
    const now = new Date()
    const nowLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    return {
        code: '',
        name: '',
        description: '',
        discountType: 'percentage',
        discountValue: '',
        maxDiscountAmount: '',
        minOrderAmount: '',
        maxUses: '',
        maxUsesPerCustomer: '',
        isCumulative: true,
        validFrom: nowLocal,
        validUntil: '',
        isActive: true,
        customerTypeScopeIds: [],
        priceTableScopeIds: [],
        productScopeIds: [],
        categoryScopeIds: [],
    }
}

function toFormState(coupon: CouponItem): CouponFormState {
    return {
        code: coupon.code,
        name: coupon.name,
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountValue: String(coupon.discountValue),
        maxDiscountAmount: coupon.maxDiscountAmount === null ? '' : String(coupon.maxDiscountAmount),
        minOrderAmount: coupon.minOrderAmount === null ? '' : String(coupon.minOrderAmount),
        maxUses: coupon.maxUses === null ? '' : String(coupon.maxUses),
        maxUsesPerCustomer: coupon.maxUsesPerCustomer === null ? '' : String(coupon.maxUsesPerCustomer),
        isCumulative: coupon.isCumulative,
        validFrom: toDateInput(coupon.validFrom),
        validUntil: toDateInput(coupon.validUntil),
        isActive: coupon.isActive,
        customerTypeScopeIds: [...coupon.customerTypeScopeIds],
        priceTableScopeIds: [...coupon.priceTableScopeIds],
        productScopeIds: [...coupon.productScopeIds],
        categoryScopeIds: [...coupon.categoryScopeIds],
    }
}

function statusMeta(coupon: CouponItem) {
    const now = Date.now()
    const validFrom = new Date(coupon.validFrom).getTime()
    const validUntil = coupon.validUntil ? new Date(coupon.validUntil).getTime() : null

    if (!coupon.isActive) return { label: 'Inativo', className: 'bg-slate-100 text-slate-700 border-slate-200' }
    if (validUntil !== null && now > validUntil) return { label: 'Expirado', className: 'bg-red-100 text-red-700 border-red-200' }
    if (Number.isFinite(validFrom) && now < validFrom) return { label: 'Agendado', className: 'bg-blue-100 text-blue-700 border-blue-200' }
    return { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

function MultiSelect({ label, options, selected, onChange }: { label: string; options: CouponOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <select
                multiple
                value={selected}
                onChange={(event) => {
                    const values = Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                    onChange(values)
                }}
                className="h-32 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
            >
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-500">Selecionados: {selected.length}</p>
        </div>
    )
}

export default function CouponsPage() {
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const [coupons, setCoupons] = useState<CouponItem[]>([])
    const [summary, setSummary] = useState<CouponSummary>({ totalCoupons: 0, activeCoupons: 0, expiredCoupons: 0, inactiveCoupons: 0, totalUsages: 0 })
    const [options, setOptions] = useState<{ customerTypes: CouponOption[]; priceTables: CouponOption[]; categories: CouponOption[]; products: CouponOption[] }>({ customerTypes: [], priceTables: [], categories: [], products: [] })
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<CouponStatusFilter>('all')
    const [typeFilter, setTypeFilter] = useState<CouponTypeFilter>('all')
    const [createdFrom, setCreatedFrom] = useState('')
    const [createdTo, setCreatedTo] = useState('')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [totalRows, setTotalRows] = useState(0)
    const [formOpen, setFormOpen] = useState(false)
    const [editingCoupon, setEditingCoupon] = useState<CouponItem | null>(null)
    const [formState, setFormState] = useState<CouponFormState>(defaultFormState())
    const [usageOpen, setUsageOpen] = useState(false)
    const [usageLoading, setUsageLoading] = useState(false)
    const [usageFilter, setUsageFilter] = useState<UsageStatusFilter>('all')
    const [usagePage, setUsagePage] = useState(1)
    const [usageData, setUsageData] = useState<CouponUsageModalData | null>(null)

    const usageCouponId = usageData?.coupon.id || null

    const fetchCoupons = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status: statusFilter, type: typeFilter })
            if (search.trim()) params.set('q', search.trim())
            if (createdFrom) params.set('createdFrom', createdFrom)
            if (createdTo) params.set('createdTo', createdTo)

            const response = await fetch(`/api/marketing/coupons?${params.toString()}`)
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Falha ao carregar cupons.')

            setCoupons(payload.data || [])
            setSummary(payload.summary || { totalCoupons: 0, activeCoupons: 0, expiredCoupons: 0, inactiveCoupons: 0, totalUsages: 0 })
            setOptions(payload.options || { customerTypes: [], priceTables: [], categories: [], products: [] })
            setHasMore(Boolean(payload.pagination?.hasMore))
            setTotalRows(payload.pagination?.total || 0)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Erro ao carregar cupons.')
        } finally {
            setLoading(false)
        }
    }, [createdFrom, createdTo, page, search, statusFilter, typeFilter])

    useEffect(() => {
        void fetchCoupons()
    }, [fetchCoupons])

    const fetchUsage = useCallback(async (couponId: string, nextPage = usagePage, nextStatus = usageFilter) => {
        setUsageLoading(true)
        try {
            const params = new URLSearchParams({ page: String(nextPage), pageSize: String(USAGE_PAGE_SIZE), status: nextStatus })
            const response = await fetch(`/api/marketing/coupons/${couponId}/usage?${params.toString()}`)
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Falha ao carregar historico.')
            setUsageData(payload as CouponUsageModalData)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Erro ao carregar historico.')
        } finally {
            setUsageLoading(false)
        }
    }, [usageFilter, usagePage])

    useEffect(() => {
        if (!usageOpen || !usageCouponId) return
        void fetchUsage(usageCouponId, usagePage, usageFilter)
    }, [fetchUsage, usageCouponId, usageFilter, usageOpen, usagePage])

    const openCreate = useCallback(() => {
        setEditingCoupon(null)
        setFormState(defaultFormState())
        setFormOpen(true)
    }, [])

    const openEdit = useCallback((coupon: CouponItem) => {
        setEditingCoupon(coupon)
        setFormState(toFormState(coupon))
        setFormOpen(true)
    }, [])

    const openUsage = useCallback((coupon: CouponItem) => {
        setUsageFilter('all')
        setUsagePage(1)
        setUsageData({
            coupon: { id: coupon.id, code: coupon.code, name: coupon.name, discountType: coupon.discountType, discountValue: coupon.discountValue },
            summary: { totalUsages: coupon.totalUses, reservedUsages: coupon.reservedUses, releasedUsages: coupon.releasedUses, uniqueCustomers: 0, totalDiscountGranted: coupon.totalDiscountGranted },
            data: [],
            pagination: { page: 1, pageSize: USAGE_PAGE_SIZE, total: 0, hasMore: false },
        })
        setUsageOpen(true)
    }, [])

    const saveCoupon = useCallback(async () => {
        setSubmitting(true)
        try {
            const endpoint = editingCoupon ? `/api/marketing/coupons/${editingCoupon.id}` : '/api/marketing/coupons'
            const method = editingCoupon ? 'PATCH' : 'POST'
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formState }),
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Falha ao salvar cupom.')

            toast.success(editingCoupon ? 'Cupom atualizado com sucesso.' : 'Cupom criado com sucesso.')
            setFormOpen(false)
            setEditingCoupon(null)
            setFormState(defaultFormState())
            await fetchCoupons()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Erro ao salvar cupom.')
        } finally {
            setSubmitting(false)
        }
    }, [editingCoupon, fetchCoupons, formState])

    const toggleCoupon = useCallback(async (coupon: CouponItem) => {
        setTogglingId(coupon.id)
        try {
            const response = await fetch(`/api/marketing/coupons/${coupon.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !coupon.isActive }),
            })
            const payload = await response.json()
            if (!response.ok) throw new Error(payload.error || 'Falha ao alterar status do cupom.')

            toast.success(!coupon.isActive ? 'Cupom ativado.' : 'Cupom desativado.')
            await fetchCoupons()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Erro ao alterar status.')
        } finally {
            setTogglingId(null)
        }
    }, [fetchCoupons])

    const cards = [
        { title: 'Cupons ativos', value: summary.activeCoupons, icon: TicketPercent, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        { title: 'Cupons expirados', value: summary.expiredCoupons, icon: CalendarClock, color: 'text-red-700 bg-red-50 border-red-200' },
        { title: 'Usos registrados', value: summary.totalUsages, icon: Users, color: 'text-blue-700 bg-blue-50 border-blue-200' },
    ]

    const discountLabel = useMemo(() => (coupon: CouponItem) => {
        if (coupon.discountType === 'percentage') return `${coupon.discountValue}%`
        return `R$ ${formatCurrency(coupon.discountValue)}`
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold font-heading text-gradient-navy">
                        <TicketPercent className="h-6 w-6" />
                        Cupons
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Gestao enterprise de cupons com regras, vigencia, limites e historico de uso.
                    </p>
                </div>
                <Button onClick={openCreate} className="gradient-bronze border-0 text-white">
                    Novo cupom
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {cards.map((card) => (
                    <Card key={card.title} className="border-slate-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{card.title}</p>
                                    <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                                </div>
                                <div className={cn('rounded-xl border p-2.5', card.color)}>
                                    <card.icon className="h-4 w-4" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Filtros</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar codigo, nome ou descricao" className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={(value) => { if (!value) return; setStatusFilter(value); setPage(1) }}>
                        <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os status</SelectItem>
                            <SelectItem value="active">Ativos</SelectItem>
                            <SelectItem value="inactive">Inativos</SelectItem>
                            <SelectItem value="expired">Expirados</SelectItem>
                            <SelectItem value="scheduled">Agendados</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={(value) => { if (!value) return; setTypeFilter(value); setPage(1) }}>
                        <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os tipos</SelectItem>
                            <SelectItem value="percentage">Percentual</SelectItem>
                            <SelectItem value="fixed">Valor fixo</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input type="date" value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); setPage(1) }} />
                    <Input type="date" value={createdTo} onChange={(e) => { setCreatedTo(e.target.value); setPage(1) }} />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Lista de cupons</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando cupons...</div>
                    ) : coupons.length === 0 ? (
                        <div className="py-16 text-center text-sm text-slate-500">Nenhum cupom encontrado para os filtros selecionados.</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr>
                                            {['Codigo', 'Tipo', 'Status', 'Validade', 'Usos', 'Criado em', 'Acoes'].map((header) => (
                                                <th key={header} className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{header}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {coupons.map((coupon) => {
                                            const state = statusMeta(coupon)
                                            return (
                                                <tr key={coupon.id} className="hover:bg-slate-50/70">
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                                                        <p className="font-semibold text-slate-900">{coupon.code}</p>
                                                        <p className="text-xs text-slate-500">{coupon.name}</p>
                                                    </td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">
                                                        <p className="font-medium text-slate-900">{coupon.discountType === 'percentage' ? 'Percentual' : 'Valor fixo'}</p>
                                                        <p>{discountLabel(coupon)}</p>
                                                        {coupon.maxDiscountAmount !== null && <p>Teto: R$ {formatCurrency(coupon.maxDiscountAmount)}</p>}
                                                    </td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top"><Badge className={cn('border text-xs', state.className)}>{state.label}</Badge></td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">
                                                        <p>{formatDateTime(coupon.validFrom)}</p>
                                                        <p className="mt-1 text-slate-500">ate {coupon.validUntil ? formatDateTime(coupon.validUntil) : 'sem data fim'}</p>
                                                    </td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">
                                                        <p>{coupon.totalUses}{coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ' / sem limite'}</p>
                                                        <p className="mt-1 text-slate-500">Reservados: {coupon.reservedUses}</p>
                                                    </td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top text-xs text-slate-600">{formatDateTime(coupon.createdAt)}</td>
                                                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 text-xs" onClick={() => openEdit(coupon)}>Editar</Button>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 text-xs" onClick={() => openUsage(coupon)}>Uso</Button>
                                                            <Button size="sm" variant="outline" className="h-8 rounded-lg border-slate-200 text-xs" onClick={() => void toggleCoupon(coupon)} disabled={togglingId === coupon.id}>
                                                                {togglingId === coupon.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : coupon.isActive ? 'Desativar' : 'Ativar'}
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-slate-500">Pagina {page} - {totalRows} registro(s)</p>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="h-8 rounded-lg"><ChevronLeft className="mr-1 h-3.5 w-3.5" />Anterior</Button>
                                    <Button size="sm" variant="outline" onClick={() => setPage((current) => current + 1)} disabled={!hasMore} className="h-8 rounded-lg">Proxima<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Dialog open={formOpen} onOpenChange={setFormOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>{editingCoupon ? `Editar cupom ${editingCoupon.code}` : 'Novo cupom'}</DialogTitle>
                        <DialogDescription>Configure regras de desconto, elegibilidade, limites e vigencia.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold">1. Informacoes basicas</h3>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1.5"><Label>Codigo</Label><Input value={formState.code} onChange={(e) => setFormState((p) => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
                                <div className="space-y-1.5"><Label>Nome interno</Label><Input value={formState.name} onChange={(e) => setFormState((p) => ({ ...p, name: e.target.value }))} /></div>
                            </div>
                            <div className="space-y-1.5"><Label>Descricao</Label><Textarea rows={3} value={formState.description} onChange={(e) => setFormState((p) => ({ ...p, description: e.target.value }))} /></div>
                        </section>

                        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold">2. Regra do desconto</h3>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                <div className="space-y-1.5"><Label>Tipo</Label><Select value={formState.discountType} onValueChange={(value) => { if (!value) return; setFormState((p) => ({ ...p, discountType: value })) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentual</SelectItem><SelectItem value="fixed">Valor fixo</SelectItem></SelectContent></Select></div>
                                <div className="space-y-1.5"><Label>Valor</Label><Input type="number" min="0" step="0.01" value={formState.discountValue} onChange={(e) => setFormState((p) => ({ ...p, discountValue: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label>Max. desconto</Label><Input type="number" min="0" step="0.01" value={formState.maxDiscountAmount} onChange={(e) => setFormState((p) => ({ ...p, maxDiscountAmount: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label>Pedido minimo</Label><Input type="number" min="0" step="0.01" value={formState.minOrderAmount} onChange={(e) => setFormState((p) => ({ ...p, minOrderAmount: e.target.value }))} /></div>
                            </div>
                        </section>

                        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold">3. Elegibilidade</h3>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                <MultiSelect label="Tipos de cliente" options={options.customerTypes} selected={formState.customerTypeScopeIds} onChange={(ids) => setFormState((p) => ({ ...p, customerTypeScopeIds: ids }))} />
                                <MultiSelect label="Tabelas de preco" options={options.priceTables} selected={formState.priceTableScopeIds} onChange={(ids) => setFormState((p) => ({ ...p, priceTableScopeIds: ids }))} />
                                <MultiSelect label="Categorias" options={options.categories} selected={formState.categoryScopeIds} onChange={(ids) => setFormState((p) => ({ ...p, categoryScopeIds: ids }))} />
                                <MultiSelect label="Produtos" options={options.products} selected={formState.productScopeIds} onChange={(ids) => setFormState((p) => ({ ...p, productScopeIds: ids }))} />
                            </div>
                        </section>

                        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold">4. Controle de uso</h3>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1.5"><Label>Limite total</Label><Input type="number" min="0" step="1" value={formState.maxUses} onChange={(e) => setFormState((p) => ({ ...p, maxUses: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label>Limite por cliente</Label><Input type="number" min="0" step="1" value={formState.maxUsesPerCustomer} onChange={(e) => setFormState((p) => ({ ...p, maxUsesPerCustomer: e.target.value }))} /></div>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <div><p className="text-sm font-medium">Cumulativo com desconto de pagamento</p><p className="text-xs text-slate-500">Quando desativado, bloqueia desconto de pagamento no checkout.</p></div>
                                <Switch checked={formState.isCumulative} onCheckedChange={(checked) => setFormState((p) => ({ ...p, isCumulative: checked }))} />
                            </div>
                        </section>

                        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold">5. Vigencia e ativacao</h3>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-1.5"><Label>Inicio</Label><Input type="datetime-local" value={formState.validFrom} onChange={(e) => setFormState((p) => ({ ...p, validFrom: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label>Fim</Label><Input type="datetime-local" value={formState.validUntil} onChange={(e) => setFormState((p) => ({ ...p, validUntil: e.target.value }))} /></div>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <div><p className="text-sm font-medium">Cupom ativo</p><p className="text-xs text-slate-500">Cupons inativos nao podem ser aplicados.</p></div>
                                <Switch checked={formState.isActive} onCheckedChange={(checked) => setFormState((p) => ({ ...p, isActive: checked }))} />
                            </div>
                        </section>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
                        <Button onClick={() => void saveCoupon()} disabled={submitting} className="gradient-bronze border-0 text-white">
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingCoupon ? 'Salvar alteracoes' : 'Criar cupom'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Historico de uso</DialogTitle>
                        <DialogDescription>Reservas e liberacoes vinculadas ao cupom selecionado.</DialogDescription>
                    </DialogHeader>

                    {!usageData ? (
                        <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Cupom</p>
                                        <p className="text-lg font-bold text-slate-900">{usageData.coupon.code}</p>
                                        <p className="text-sm text-slate-500">{usageData.coupon.name}</p>
                                    </div>
                                    <p className="text-sm text-slate-700">Desconto: {usageData.coupon.discountType === 'percentage' ? `${usageData.coupon.discountValue}%` : `R$ ${formatCurrency(usageData.coupon.discountValue)}`}</p>
                                </div>
                                <Separator className="my-3" />
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
                                    <div><p className="text-xs text-slate-500">Usos</p><p className="font-semibold">{usageData.summary.totalUsages}</p></div>
                                    <div><p className="text-xs text-slate-500">Reservados</p><p className="font-semibold">{usageData.summary.reservedUsages}</p></div>
                                    <div><p className="text-xs text-slate-500">Liberados</p><p className="font-semibold">{usageData.summary.releasedUsages}</p></div>
                                    <div><p className="text-xs text-slate-500">Clientes</p><p className="font-semibold">{usageData.summary.uniqueCustomers}</p></div>
                                    <div><p className="text-xs text-slate-500">Desconto total</p><p className="font-semibold">R$ {formatCurrency(usageData.summary.totalDiscountGranted)}</p></div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Select value={usageFilter} onValueChange={(value) => { if (!value) return; setUsageFilter(value); setUsagePage(1) }}>
                                    <SelectTrigger className="w-[220px]"><SelectValue placeholder="Status" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="reserved">Reservado</SelectItem>
                                        <SelectItem value="released">Liberado</SelectItem>
                                    </SelectContent>
                                </Select>
                                {usageLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                            </div>

                            {usageData.data.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Nenhum registro para este filtro.</div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="min-w-full border-separate border-spacing-0">
                                        <thead>
                                            <tr>
                                                {['Data', 'Status', 'Pedido', 'Cliente', 'Desconto', 'Detalhes'].map((header) => (
                                                    <th key={header} className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{header}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {usageData.data.map((entry) => (
                                                <tr key={entry.id} className="hover:bg-slate-50/60">
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs">{formatDateTime(entry.createdAt)}</td>
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs"><Badge className={cn('border text-[10px]', entry.status === 'reserved' ? 'border-blue-200 bg-blue-100 text-blue-700' : 'border-slate-200 bg-slate-100 text-slate-700')}>{entry.status === 'reserved' ? 'Reservado' : 'Liberado'}</Badge></td>
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs">{entry.order.orderNumber || '-'}</td>
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs"><p>{entry.customer.name || '-'}</p><p className="text-slate-500">{entry.customer.email || '-'}</p></td>
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs font-medium">R$ {formatCurrency(entry.discountAmount)}</td>
                                                    <td className="border-b border-slate-100 px-3 py-2 text-xs">{entry.status === 'released' ? entry.releaseReason || 'Liberado' : 'Uso reservado'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-500">Pagina {usageData.pagination.page} - {usageData.pagination.total} registro(s)</p>
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setUsagePage((current) => Math.max(1, current - 1))} disabled={usagePage <= 1}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Anterior</Button>
                                    <Button size="sm" variant="outline" onClick={() => setUsagePage((current) => current + 1)} disabled={!usageData.pagination.hasMore}>Proxima<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
