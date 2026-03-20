'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Building2, ShoppingBag, Shield, Pencil, Key, FileText, Ban, Check, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getCustomerAuditLog, getCustomerOrders, updateCustomerStatusAsAdmin, getCustomerTags, getRepresentatives, updateCustomerAsAdminTx } from '../actions'
import type { CustomerWithStore } from '../components/CustomerList'
import type { CustomerLoginAudit, CustomerType, CustomerTag, Profile } from '@/lib/types'
import type { CustomerOrderSummary } from '../components/CustomerOrdersTab'
import type { CustomerEditFormData } from '../schema'

// Components
import { CustomerGeneralTab } from '../components/CustomerGeneralTab'
import { CustomerOrdersTab } from '../components/CustomerOrdersTab'
import { CustomerAuditTab } from '../components/CustomerAuditTab'
import { CustomerAccessTab } from '../components/CustomerAccessTab'
import { CustomerEditDrawer } from '../components/CustomerEditDrawer'
import { CustomerAddressManager } from '../components/CustomerAddressManager'

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
    const [activeTab, setActiveTab] = useState<'general' | 'access' | 'orders' | 'audit' | 'addresses'>('general')

    // Lookup data states for Edit Drawer
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    const [customerTags, setCustomerTags] = useState<CustomerTag[]>([])
    const [representatives, setRepresentatives] = useState<Partial<Profile>[]>([])
    const [isEditOpen, setIsEditOpen] = useState(false)

    // Tab data states
    const [auditLog, setAuditLog] = useState<CustomerLoginAudit[]>([])
    const [orders, setOrders] = useState<CustomerOrderSummary[]>([])
    const [loadingAudit, setLoadingAudit] = useState(false)
    const [loadingOrders, setLoadingOrders] = useState(false)
    const [didLoadAudit, setDidLoadAudit] = useState(false)
    const [didLoadOrders, setDidLoadOrders] = useState(false)

    useEffect(() => {
        let isMounted = true

        const loadCustomerProfile = async () => {
            setLoading(true)
            
            // Replicate the list query logic but for single ID
            const { data, error } = await supabase
                .from('profiles')
                .select('*, stores!stores_profile_id_fkey(*, customer_type:customer_types(*), store_tags(customer_tags(*)), representative:profiles!stores_representative_id_fkey(id, full_name))')
                .eq('role', 'client')
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

    // Load tabs data when clicked
    useEffect(() => {
        if (!customer) return

        if (activeTab === 'audit' && !didLoadAudit && !loadingAudit) {
            setLoadingAudit(true)
            getCustomerAuditLog(customer.id).then(res => {
                if (res.data) setAuditLog(res.data)
                setDidLoadAudit(true)
                setLoadingAudit(false)
            })
        }

        if (activeTab === 'orders' && !didLoadOrders && !loadingOrders) {
            setLoadingOrders(true)
            getCustomerOrders(customer.id).then(res => {
                if (res.data) setOrders(res.data as CustomerOrderSummary[])
                setDidLoadOrders(true)
                setLoadingOrders(false)
            })
        }
    }, [activeTab, customer, didLoadAudit, didLoadOrders, loadingAudit, loadingOrders])

    // Edit Handler
    const handleSaveCustomer = async (profileId: string, storeId: string, formData: CustomerEditFormData) => {
        try {
            const result = await updateCustomerAsAdminTx(profileId, storeId, formData)
            if (!result.success) {
                toast.error(result.error || 'Erro ao atualizar cliente')
            } else {
                toast.success('Cliente atualizado com sucesso!')
                // Force reload
                window.location.reload()
            }
        } catch (error) {
            console.error(error)
            toast.error('Erro inesperado ao atualizar')
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

    // Component Content...
    return (
        <div className="space-y-6 pb-20">
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
            <div className="relative rounded-2xl border border-border/60 bg-white/90 shadow-sm overflow-hidden p-6 md:p-8 backdrop-blur-md">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    {/* Identity Container */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 flex-1 text-center sm:text-left z-10 relative">
                        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-navy via-[#1e293b] to-[#0f172a] flex items-center justify-center shadow-lg shrink-0 border-4 border-white/50 ring-1 ring-black/5">
                            <span className="text-white font-bold text-3xl tracking-wider">
                                {customer.full_name.substring(0, 2).toUpperCase()}
                            </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <h1 className="text-3xl md:text-4xl font-bold font-heading text-navy flex items-center justify-center sm:justify-start gap-3 flex-wrap leading-tight">
                                {customer.full_name}
                                <Badge className={`text-xs border shadow-sm px-2.5 py-0.5 ${config.color}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75 mr-1.5 inline-block"></span>
                                    {config.label}
                                </Badge>
                            </h1>
                            <p className="text-muted-foreground mt-1 text-sm md:text-base flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                                <Building2 className="h-4 w-4 opacity-70" />
                                {store?.company_name || 'Sem empresa cadastrada'}
                                {store?.cnpj && <span className="text-xs opacity-70 ml-1">CNPJ: {store.cnpj}</span>}
                            </p>
                            
                            <div className="flex items-center justify-center sm:justify-start gap-2 mt-3 flex-wrap">
                                {customerTypeLabel && (
                                    <Badge variant="outline" className="border-bronze/30 text-bronze bg-bronze/5">
                                        {customerTypeLabel}
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
                        <Button variant="outline" size="sm" className="bg-white shadow-sm" onClick={() => setIsEditOpen(true)}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar Cadastro
                        </Button>
                        <Button variant="outline" size="sm" className="bg-white shadow-sm" onClick={() => setActiveTab('access')}>
                            <Key className="h-4 w-4 mr-2" /> Acessos
                        </Button>
                        {customer.status !== 'approved' ? (
                            <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                            >
                                <Check className="h-4 w-4 mr-2" /> Aprovar
                            </Button>
                        ) : (
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                                <Ban className="h-4 w-4 mr-2" /> Bloquear
                            </Button>
                        )}
                    </div>
                </div>

                {/* Info Bar at Header bottom */}
                <div className="mt-6 pt-5 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span className="font-medium">E-mail:</span>
                        <span className="truncate" title={customer.email || ''}>{customer.email || 'NÃ£o informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Telefone:</span>
                        <span>{customer.phone || 'NÃ£o informado'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Cadastrado em:</span>
                        <span>{format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                </div>
                
                {/* Mobile Actions Bottom */}
                <div className="flex md:hidden mt-4 gap-2 pt-4 border-t border-border/50 overflow-x-auto pb-1 scrollbar-hide">
                    <Button variant="outline" size="sm" className="bg-white whitespace-nowrap" onClick={() => setIsEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white whitespace-nowrap" onClick={() => setActiveTab('access')}>
                        <Key className="h-3.5 w-3.5 mr-1" /> Acessos
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30 whitespace-nowrap">
                        <Ban className="h-3.5 w-3.5 mr-1" /> Bloquear
                    </Button>
                </div>
            </div>

            {/* Navigation Tabs (Desktop Grid, Mobile Scrollable) */}
            <div className="flex gap-1 border-b border-border/60 overflow-x-auto scrollbar-hide">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'general' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <FileText className="h-4 w-4" /> Informações Gerais
                </button>
                <button
                    onClick={() => setActiveTab('access')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'access' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Key className="h-4 w-4" /> Acessos do Sistema
                </button>
                <button
                    onClick={() => setActiveTab('addresses')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'addresses' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <MapPin className="h-4 w-4" /> Endereços
                </button>
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'orders' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <ShoppingBag className="h-4 w-4" /> Pedidos Recentes
                </button>
                <button
                    onClick={() => setActiveTab('audit')}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === 'audit' ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <Shield className="h-4 w-4" /> Auditoria e Logs
                </button>
            </div>

            {/* Tab Contents */}
            <div>
                {activeTab === 'general' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerGeneralTab customer={customer} />
                    </div>
                )}
                
                {activeTab === 'access' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerAccessTab customer={customer} />
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
                
                {activeTab === 'orders' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerOrdersTab orders={orders} loading={loadingOrders} />
                    </div>
                )}
                
                {activeTab === 'audit' && (
                    <div className="bg-white rounded-2xl border p-6 shadow-sm">
                        <CustomerAuditTab auditLog={auditLog} loading={loadingAudit} />
                    </div>
                )}
            </div>

            {/* Global Edit Drawer for this page */}
            <CustomerEditDrawer 
                customer={customer}
                customerTypes={customerTypes}
                customerTags={customerTags}
                representatives={representatives}
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onSave={handleSaveCustomer}
            />
        </div>
    )
}
