'use client'

import { useEffect, useState, useMemo, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Building2, ShoppingBag, Shield, Pencil, Key, FileText, Ban, Check, MapPin, CreditCard, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { getCustomerAuditLog, getCustomerOrders, getCustomerTags, getRepresentatives, updateCustomerStatusAsAdmin } from '../actions'
import type { CustomerWithStore } from '../components/CustomerList'
import type { CustomerLoginAudit, CustomerType, CustomerTag, Profile } from '@/lib/types'
import type { CustomerOrderSummary } from '../components/CustomerOrdersTab'

// Components
import { CustomerGeneralTab } from '../components/CustomerGeneralTab'
import { CustomerOrdersTab } from '../components/CustomerOrdersTab'
import { CustomerAuditTab } from '../components/CustomerAuditTab'
import { CustomerAccessTab } from '../components/CustomerAccessTab'
import { CustomerAddressManager } from '../components/CustomerAddressManager'
import { CustomerCommercialTab } from '../components/CustomerCommercialTab'
import { CustomerRepresentativeTab } from '../components/CustomerRepresentativeTab'
import { CustomerFinancialTab } from '../components/CustomerFinancialTab'
import { ClientFiscalSection } from '../components/ClientFiscalSection'

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Ativo', color: 'bg-green-100 text-green-800 border-green-200' },
    blocked: { label: 'Bloqueado', color: 'bg-red-100 text-red-800 border-red-200' },
    imported: { label: 'Importado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
}

export default function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const resolvedParams = use(params)
    const customerId = resolvedParams.id
    
    // ... skipping state
    const [customer, setCustomer] = useState<CustomerWithStore | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [activeTab, setActiveTab] = useState<'general' | 'access' | 'orders' | 'audit' | 'addresses' | 'commercial' | 'fiscal' | 'representative' | 'financial'>('general')

    // Lookup data states for Edit Drawer
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    const [customerTags, setCustomerTags] = useState<CustomerTag[]>([])
    const [representatives, setRepresentatives] = useState<Partial<Profile>[]>([])

    // Tab data states
    const [auditLog, setAuditLog] = useState<CustomerLoginAudit[]>([])
    const [orders, setOrders] = useState<CustomerOrderSummary[]>([])
    const [loadingAudit, setLoadingAudit] = useState(false)
    const [loadingOrders, setLoadingOrders] = useState(false)
    const [didLoadAudit, setDidLoadAudit] = useState(false)
    const [didLoadOrders, setDidLoadOrders] = useState(false)
    const [updatingHeaderStatus, setUpdatingHeaderStatus] = useState(false)

    useEffect(() => {
        let isMounted = true

        const loadCustomerProfile = async () => {
            setLoading(true)
            
            // Replicate the list query logic but for single ID
            const { data, error } = await supabase
                .from('profiles')
                .select('*, stores!stores_profile_id_fkey(*, customer_type:customer_types(*), store_tags(customer_tags(*)), representative:profiles!stores_representative_id_fkey(id, full_name))')
                .in('role', ['client', 'representative', 'driver'])
                .eq('id', customerId)
                .single()

            if (!isMounted) return

            if (error || !data) {
                console.error(error)
                setNotFound(true)
            } else {
                setCustomer(data as CustomerWithStore)
                
                // Preload lookups for edit drawer to avoid delay when opening
                Promise.all([
                    supabase.from('customer_types').select('*').order('name'),
                    getCustomerTags(),
                    getRepresentatives()
                ]).then(([typesRes, tagsRes, repsRes]) => {
                    if (isMounted) {
                        if (typesRes.data) setCustomerTypes(typesRes.data)
                        if ('data' in tagsRes && tagsRes.data) setCustomerTags(tagsRes.data as CustomerTag[])
                        if ('data' in repsRes && repsRes.data) setRepresentatives(repsRes.data as Partial<Profile>[])
                    }
                })
            }
            
            setLoading(false)
        }

        void loadCustomerProfile()
        
        return () => {
            isMounted = false
        }
    }, [customerId, supabase])

    const loadAuditTabData = useCallback(async () => {
        if (!customer || didLoadAudit || loadingAudit) return

        setLoadingAudit(true)
        try {
            const result = await getCustomerAuditLog(customer.id)
            if (result.data) setAuditLog(result.data)
            setDidLoadAudit(true)
        } finally {
            setLoadingAudit(false)
        }
    }, [customer, didLoadAudit, loadingAudit])

    const loadOrdersTabData = useCallback(async () => {
        if (!customer || didLoadOrders || loadingOrders) return

        setLoadingOrders(true)
        try {
            const result = await getCustomerOrders(customer.id)
            if (result.data) setOrders(result.data as CustomerOrderSummary[])
            setDidLoadOrders(true)
        } finally {
            setLoadingOrders(false)
        }
    }, [customer, didLoadOrders, loadingOrders])

    // Load tabs data when clicked
    useEffect(() => {
        if (activeTab === 'audit') {
            void loadAuditTabData()
            return
        }

        if (activeTab === 'orders') {
            void loadOrdersTabData()
        }
    }, [activeTab, loadAuditTabData, loadOrdersTabData])

    useEffect(() => {
        if (activeTab === 'representative' && customer?.role !== 'representative') {
            setActiveTab('general')
        }
    }, [activeTab, customer?.role])

    // Inline update handlers
    const handleContactUpdated = (updated: Partial<CustomerWithStore>) => {
        setCustomer(prev => prev ? { ...prev, ...updated } as CustomerWithStore : prev)
    }

    const handleCompanyUpdated = () => {
        // Reload the full profile to get fresh store/type/rep/tags data
        window.location.reload()
    }

    const handleRepresentativeUpdated = (representativeId: string | null) => {
        setCustomer((previous) => {
            if (!previous?.stores?.length) return previous

            const updatedStores = [...previous.stores]
            const currentStore = { ...updatedStores[0] }
            currentStore.representative_id = representativeId
            currentStore.representative = undefined
            updatedStores[0] = currentStore

            return {
                ...previous,
                stores: updatedStores,
            } as CustomerWithStore
        })
    }

    const handleAccessUpdated = (updates: { role: 'client' | 'representative' | 'driver'; status: 'pending' | 'approved' | 'blocked' | 'imported' }) => {
        setCustomer((previous) => {
            if (!previous) return previous
            return { ...previous, role: updates.role, status: updates.status } as CustomerWithStore
        })
    }

    const handleStatusChange = async (nextStatus: 'approved' | 'blocked') => {
        if (!customer) return
        setUpdatingHeaderStatus(true)
        try {
            const result = await updateCustomerStatusAsAdmin(customer.id, nextStatus)
            if (result.error) {
                toast.error(result.error)
                return
            }

            setCustomer((previous) => (
                previous ? { ...previous, status: nextStatus } as CustomerWithStore : previous
            ))
            toast.success(nextStatus === 'approved' ? 'Acesso liberado com sucesso!' : 'Acesso bloqueado com sucesso!')
        } finally {
            setUpdatingHeaderStatus(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6 pb-20">
                <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="rounded-2xl border bg-white/90 p-6 md:p-8 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                        <div className="flex items-center sm:items-start gap-5 w-full">
                            <Skeleton className="h-24 w-24 rounded-full shrink-0" />
                            <div className="space-y-3 w-full max-w-sm mt-2">
                                <Skeleton className="h-8 w-3/4" />
                                <Skeleton className="h-5 w-1/2" />
                                <div className="flex gap-2 mt-4">
                                    <Skeleton className="h-6 w-20 rounded-md" />
                                    <Skeleton className="h-6 w-32 rounded-md" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (notFound || !customer) {
        return (
            <div className="space-y-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
                <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Ban className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold font-heading text-gradient-navy">Cliente nao encontrado</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                    O registro que voce tentou acessar nao existe mais ou voce nao possui permissao.
                </p>
                <Button onClick={() => router.push('/admin/customers')} variant="outline" className="mt-4">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para Lista
                </Button>
            </div>
        )
    }

    const store = customer.stores?.[0]
    const config = statusConfig[customer.status] || statusConfig.pending
    const customerTypeLabel = store?.customer_type?.name
    const representativeName = store?.representative?.full_name
    const isRepresentativeProfile = customer.role === 'representative'
    const isDriverProfile = customer.role === 'driver'

    // Component Content...
    return (
        <div className="space-y-4 sm:space-y-6 pb-20 overflow-x-hidden">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                <Link href="/admin/customers" className="hover:text-navy transition-colors inline-flex items-center font-medium">
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                    Clientes
                </Link>
                <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                <span className="text-navy font-semibold truncate max-w-[200px] sm:max-w-none">
                    {customer.full_name}
                </span>
            </div>

            {/* Premium Header */}
            <div className="relative rounded-2xl border border-border/60 bg-white/90 shadow-sm overflow-hidden p-4 sm:p-6 md:p-8 backdrop-blur-md">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    {/* Identity Container */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 flex-1 text-center sm:text-left z-10 relative">
                        <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full bg-gradient-to-br from-navy via-[#1e293b] to-[#0f172a] flex items-center justify-center shadow-lg shrink-0 border-4 border-white/50 ring-1 ring-black/5">
                            <span className="text-white font-bold text-xl sm:text-3xl tracking-wider">
                                {customer.full_name.substring(0, 2).toUpperCase()}
                            </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-3xl md:text-4xl font-bold font-heading text-navy flex items-center justify-center sm:justify-start gap-2 sm:gap-3 flex-wrap leading-tight wrap-break-word">
                                <span className="wrap-break-word">{customer.full_name}</span>
                                <Badge className={`text-xs border shadow-sm px-2.5 py-0.5 ${config.color}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75 mr-1.5 inline-block"></span>
                                    {config.label}
                                </Badge>
                            </h1>
                            <p className="text-muted-foreground mt-1 text-xs sm:text-sm md:text-base flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 flex-wrap">
                                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-70 shrink-0" />
                                <span className="truncate">{store?.company_name || 'Sem empresa cadastrada'}</span>
                                {(store?.document_number || store?.cnpj) && (
                                    <span className="text-xs opacity-70 hidden sm:inline">
                                        Documento: {store?.document_number || store?.cnpj}
                                    </span>
                                )}
                            </p>
                            
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 flex-wrap">
                                {customerTypeLabel && (
                                    <Badge variant="outline" className="border-bronze/30 text-bronze bg-bronze/5">
                                        {customerTypeLabel}
                                    </Badge>
                                )}
                                {isRepresentativeProfile && (
                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                                        Representante ativo
                                    </Badge>
                                )}
                                {isDriverProfile && (
                                    <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                                        Motorista ativo
                                    </Badge>
                                )}
                                {store?.store_tags?.map((t, idx) => t.customer_tags && (
                                    <Badge key={idx} variant="outline" className={`font-normal bg-white ${t.customer_tags.color || ''}`}>
                                        {t.customer_tags.name}
                                    </Badge>
                                ))}
                                {representativeName && (
                                    <div className="text-xs font-medium text-navy bg-navy/5 px-2 py-1 rounded-md border border-navy/10 flex items-center shadow-sm">
                                        Rep: {representativeName}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Desktop */}
                    <div className="hidden md:flex items-start gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="bg-white shadow-sm" onClick={() => setActiveTab('general')}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar Cadastro
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white shadow-sm" onClick={() => setActiveTab('access')}>
                            <Key className="h-4 w-4 mr-2" /> Acessos
                        </Button>
                        {customer.status !== 'approved' ? (
                            <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                onClick={() => void handleStatusChange('approved')}
                                disabled={updatingHeaderStatus}
                            >
                                <Check className="h-4 w-4 mr-2" /> Aprovar
                            </Button>
                        ) : (
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => void handleStatusChange('blocked')}
                                disabled={updatingHeaderStatus}
                            >
                                <Ban className="h-4 w-4 mr-2" /> Bloquear
                            </Button>
                        )}
                    </div>
                </div>

                {/* Info Bar at Header bottom */}
                <div className="mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">E-mail:</span>
                        <span className="truncate" title={customer.email || ''}>{customer.email || 'Nao informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Telefone:</span>
                        <span>{customer.phone || 'Nao informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Cadastrado em:</span>
                        <span>{format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                </div>
                
                {/* Mobile Actions Bottom */}
                <div className="flex md:hidden mt-4 gap-2 pt-4 border-t border-border/50 overflow-x-auto pb-1 scrollbar-hide">
                    <Button variant="outline" size="sm" className="bg-white whitespace-nowrap" onClick={() => setActiveTab('general')}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white whitespace-nowrap" onClick={() => setActiveTab('access')}>
                        <Key className="h-3.5 w-3.5 mr-1" /> Acessos
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 whitespace-nowrap"
                        onClick={() => void handleStatusChange(customer.status === 'approved' ? 'blocked' : 'approved')}
                        disabled={updatingHeaderStatus}
                    >
                        {customer.status === 'approved' ? (
                            <>
                                <Ban className="h-3.5 w-3.5 mr-1" /> Bloquear
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="-mx-4 sm:mx-0">
                <div className="flex border-b border-border/60 overflow-x-auto scrollbar-hide px-4 sm:px-0">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'general' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Informacoes Gerais</span>
                        <span className="sm:hidden">Geral</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('access')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'access' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Key className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Acessos do Sistema</span>
                        <span className="sm:hidden">Acessos</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('addresses')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'addresses' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Enderecos
                    </button>
                    <button
                        onClick={() => setActiveTab('commercial')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'commercial' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Financeiro/Comercial
                    </button>
                    <button
                        onClick={() => setActiveTab('fiscal')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'fiscal' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Fiscal NF-e
                    </button>
                    <button
                        onClick={() => setActiveTab('financial')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'financial' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Contas a Receber</span>
                        <span className="sm:hidden">Faturas</span>
                    </button>
                    {isRepresentativeProfile && (
                        <button
                            onClick={() => setActiveTab('representative')}
                            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                                activeTab === 'representative' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            Configuracao do Representante
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'orders' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Pedidos
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === 'audit' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Auditoria e Logs</span>
                        <span className="sm:hidden">Auditoria</span>
                    </button>
                </div>
            </div>

            {/* Tab Contents */}
            <div>
                {activeTab === 'general' && (
                    <CustomerGeneralTab
                        customer={customer}
                        customerTypes={customerTypes}
                        customerTags={customerTags}
                        representatives={representatives}
                        onContactUpdated={handleContactUpdated}
                        onCompanyUpdated={handleCompanyUpdated}
                    />
                )}
                
                {activeTab === 'access' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerAccessTab customer={customer} onAccessUpdated={handleAccessUpdated} />
                    </div>
                )}
                
                {activeTab === 'addresses' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <h3 className="font-heading text-lg font-bold mb-4 text-navy">Gerenciar Locais de Entrega</h3>
                        {store ? (
                            <CustomerAddressManager storeId={store.id} />
                        ) : (
                            <p className="text-sm text-muted-foreground">Cliente nao possui uma loja/empresa associada para gerenciar enderecos.</p>
                        )}
                    </div>
                )}
                
                {activeTab === 'commercial' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        {store ? (
                            <CustomerCommercialTab
                                storeId={store.id}
                                initialRepresentativeId={store.representative_id || null}
                                onRepresentativeUpdated={handleRepresentativeUpdated}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Cliente nao possui loja associada para configuracao comercial.
                            </p>
                        )}
                    </div>
                )}

                {activeTab === 'fiscal' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        {store ? (
                            <ClientFiscalSection storeId={store.id} />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Cliente nao possui loja associada para configuracao fiscal.
                            </p>
                        )}
                    </div>
                )}

                {activeTab === 'financial' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerFinancialTab
                            profileId={customer.id}
                            profileName={customer.full_name}
                            companyName={store?.company_name || ''}
                        />
                    </div>
                )}
                
                {activeTab === 'orders' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerOrdersTab orders={orders} loading={loadingOrders} />
                    </div>
                )}

                {activeTab === 'representative' && isRepresentativeProfile && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerRepresentativeTab profileId={customer.id} />
                    </div>
                )}
                
                {activeTab === 'audit' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerAuditTab auditLog={auditLog} loading={loadingAudit} />
                    </div>
                )}
            </div>
        </div>
    )
}
