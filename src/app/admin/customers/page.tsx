'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    createCustomerAsAdminTx,
    updateCustomerAsAdminTx,
    getCustomerTags,
    getRepresentatives,
    deleteCustomerAction,
    bulkDeleteCustomersAction,
    updateCustomerStatusAsAdmin,
    bulkUpdateCustomerStatusAsAdmin,
} from './actions'
import type { CustomerType, CustomerTag, Profile } from '@/lib/types'
import type { CustomerEditFormData } from './schema'

// Components
import { CustomerFilters } from './components/CustomerFilters'
import { CustomerList, type CustomerWithStore } from './components/CustomerList'
import { CustomerOverviewCards, type OverviewFilterKey } from './components/CustomerOverviewCards'
import { CustomerFormModal } from './components/CustomerFormModal'
import { CustomerEditDrawer } from './components/CustomerEditDrawer'
import { CustomerImportModal } from './components/CustomerImportModal'
import { CustomerAccessModal } from './components/CustomerAccessModal'
import { type CustomerFormData } from './schema'

const ITEMS_PER_PAGE = 15;
type CustomerStatusAction = 'pending' | 'approved' | 'blocked' | 'imported' | 'delete'

interface CustomerOverviewStats {
    total: number
    registered: number
    unregistered: number
    withoutEmail: number
}

const PLACEHOLDER_EMAIL_OR_FILTER = [
    'email.ilike.%@placeholder.invalid',
    'email.ilike.%@placeholder.local',
    'email.ilike.importado+%',
].join(',')

export default function CustomersPage() {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])

    // Data State
    const [customers, setCustomers] = useState<CustomerWithStore[]>([])
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    const [customerTags, setCustomerTags] = useState<CustomerTag[]>([])
    const [representatives, setRepresentatives] = useState<Partial<Profile>[]>([])

    
    // Server-side State
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [overviewStats, setOverviewStats] = useState<CustomerOverviewStats>({
        total: 0,
        registered: 0,
        unregistered: 0,
        withoutEmail: 0,
    })
    const [loadingOverview, setLoadingOverview] = useState(true)
    const [overviewFilter, setOverviewFilter] = useState<OverviewFilterKey>('registered')

    // Modals & Selection State
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    // New modals
    const [editCustomer, setEditCustomer] = useState<CustomerWithStore | null>(null)
    const [isImportOpen, setIsImportOpen] = useState(false)
    const [accessCustomer, setAccessCustomer] = useState<CustomerWithStore | null>(null)

    // Apply Debounce for Search filter
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    // Load auxiliary data once
    useEffect(() => {
        const loadAuxData = async () => {
            const { data: typesData } = await supabase
                .from('customer_types')
                .select('*')
                .order('is_active', { ascending: false })
                .order('sort_order')
            if (typesData) setCustomerTypes(typesData)

            const tagsRes = await getCustomerTags()
            if (tagsRes.data) setCustomerTags(tagsRes.data as CustomerTag[])

            const repsRes = await getRepresentatives()
            if (repsRes.data) setRepresentatives(repsRes.data as Partial<Profile>[])
        }
        loadAuxData()
    }, [supabase])

    const loadData = useCallback(async () => {
        setLoading(true)
        
        // Base Query with Stores Inner Join + customer_type relation + store_tags relation
        let query = supabase
            .from('profiles')
            .select('*, stores!stores_profile_id_fkey(*, customer_type:customer_types(*), store_tags(customer_tags(*)), representative:profiles!stores_representative_id_fkey(id, full_name))', { count: 'exact' })
            .eq('role', 'client')

        // Apply Filters
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter)
        }
        
        if (debouncedSearch) {
            const { data: storeMatches } = await supabase
                .from('stores')
                .select('profile_id')
                .or(`company_name.ilike.%${debouncedSearch}%,cnpj.ilike.%${debouncedSearch}%`);
                
            const storeProfileIds = storeMatches?.map(s => s.profile_id) || [];
            
            const nameOrEmailFilter = `full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`;
            
            if (storeProfileIds.length > 0) {
                const profileInFilter = `id.in.(${storeProfileIds.join(',')})`;
                query = query.or(`${nameOrEmailFilter},${profileInFilter}`);
            } else {
                query = query.or(nameOrEmailFilter);
            }
        }

        // Type filter â€” need to filter by store's customer_type_id
        if (typeFilter !== 'all') {
            const { data: typeStores } = await supabase
                .from('stores')
                .select('profile_id')
                .eq('customer_type_id', typeFilter)
            
            const typeProfileIds = typeStores?.map(s => s.profile_id) || []
            if (typeProfileIds.length > 0) {
                query = query.in('id', typeProfileIds)
            } else {
                // No matches for this type, set empty result
                setCustomers([])
                setTotalCount(0)
                setLoading(false)
                return
            }
        }

        if (overviewFilter === 'registered') {
            query = query
                .eq('status', 'approved')
                .not('email', 'ilike', '%@placeholder.invalid')
                .not('email', 'ilike', '%@placeholder.local')
                .not('email', 'ilike', 'importado+%')
        }

        if (overviewFilter === 'withoutEmail') {
            const { data: noEmailProfiles } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'client')
                .or(PLACEHOLDER_EMAIL_OR_FILTER)

            const idsWithoutEmail = noEmailProfiles?.map((profile) => profile.id) || []
            if (idsWithoutEmail.length > 0) {
                query = query.in('id', idsWithoutEmail)
            } else {
                setCustomers([])
                setTotalCount(0)
                setLoading(false)
                return
            }
        }

        if (overviewFilter === 'unregistered') {
            const { data: unregisteredProfiles } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'client')
                .or(`status.eq.imported,status.eq.pending,${PLACEHOLDER_EMAIL_OR_FILTER}`)

            const idsUnregistered = unregisteredProfiles?.map((profile) => profile.id) || []
            if (idsUnregistered.length > 0) {
                query = query.in('id', idsUnregistered)
            } else {
                setCustomers([])
                setTotalCount(0)
                setLoading(false)
                return
            }
        }

        // Pagination
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        
        query = query.order('created_at', { ascending: false }).range(from, to)

        const { data, count, error } = await query

        if (error) {
            toast.error('Erro ao carregar clientes')
        } else {
            if (data) setCustomers(data as CustomerWithStore[])
            if (count !== null) setTotalCount(count)
        }
        
        setLoading(false)
    }, [debouncedSearch, statusFilter, typeFilter, currentPage, overviewFilter, supabase])

    const loadOverviewStats = useCallback(async () => {
        setLoadingOverview(true)
        try {
            const [totalRes, registeredRes, unregisteredRes, withoutEmailRes] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'client'),
                supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'client')
                    .eq('status', 'approved')
                    .not('email', 'ilike', '%@placeholder.invalid')
                    .not('email', 'ilike', '%@placeholder.local')
                    .not('email', 'ilike', 'importado+%'),
                supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'client')
                    .or(`status.eq.imported,status.eq.pending,${PLACEHOLDER_EMAIL_OR_FILTER}`),
                supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'client')
                    .or(PLACEHOLDER_EMAIL_OR_FILTER),
            ])

            setOverviewStats({
                total: totalRes.count || 0,
                registered: registeredRes.count || 0,
                unregistered: unregisteredRes.count || 0,
                withoutEmail: withoutEmailRes.count || 0,
            })
        } catch {
            toast.error('Erro ao carregar totais de clientes')
        } finally {
            setLoadingOverview(false)
        }
    }, [supabase])

    const refreshCustomersPage = useCallback(async () => {
        await Promise.all([loadData(), loadOverviewStats()])
    }, [loadData, loadOverviewStats])

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadData()
        }, 0)
        return () => clearTimeout(timer)
    }, [loadData])

    useEffect(() => {
        const timer = setTimeout(() => {
            void loadOverviewStats()
        }, 0)
        return () => clearTimeout(timer)
    }, [loadOverviewStats])

    const handleSearchChange = (value: string) => {
        setSearch(value)
        setCurrentPage(1)
    }

    const handleStatusFilterChange = (value: string) => {
        setStatusFilter(value)
        setCurrentPage(1)
    }

    const handleTypeFilterChange = (value: string) => {
        setTypeFilter(value)
        setCurrentPage(1)
    }

    const handleOverviewCardClick = (key: OverviewFilterKey) => {
        setOverviewFilter((previous) => {
            if (key === 'total') return 'total'
            return previous === key ? 'total' : key
        })
        setCurrentPage(1)
    }

    // Toggle Selection
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    // Server Actions
    const updateStatus = async (profileId: string, status: CustomerStatusAction) => {
        if (status === 'delete') {
            if (!confirm('Tem certeza que deseja EXCLUIR este cliente? Esta aÃ§Ã£o nÃ£o pode ser desfeita.')) return
            
            const result = await deleteCustomerAction(profileId)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success('Cliente excluÃ­do com sucesso!')
            void refreshCustomersPage()
            return
        }

        const result = await updateCustomerStatusAsAdmin(profileId, status)
        if (result.error) {
            toast.error(result.error)
            return
        }

        setCustomers(prev =>
            prev.map(c => c.id === profileId ? { ...c, status } : c)
        )
        
        const statusLabels: Record<string, string> = {
            approved: 'aprovado',
            blocked: 'bloqueado',
            imported: 'marcado como importado',
            pending: 'marcado como pendente',
        }
        toast.success(`Cliente ${statusLabels[status] || 'atualizado'}!`)
        void loadOverviewStats()
    }

    const handleCreateCustomer = async (data: CustomerFormData) => {
        setIsCreating(true)
        
        const formData = new FormData()
        formData.append('fullName', data.fullName)
        formData.append('email', data.email)
        formData.append('password', data.password)
        formData.append('companyName', data.companyName)
        formData.append('cnpj', data.cnpj)
        
        if (data.phone) formData.append('phone', data.phone)
        if (data.tradeName) formData.append('tradeName', data.tradeName)
        if (data.customerTypeId) formData.append('customerTypeId', data.customerTypeId)
        if (data.representativeId) formData.append('representativeId', data.representativeId)
        if (data.tagIds) formData.append('tagIds', JSON.stringify(data.tagIds))
        if (data.address) formData.append('address', data.address)
        if (data.city) formData.append('city', data.city)
        if (data.state) formData.append('state', data.state)
        if (data.zipCode) formData.append('zipCode', data.zipCode)

        const res = await createCustomerAsAdminTx(formData)

        setIsCreating(false)
        
        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success('Cliente cadastrado e aprovado com sucesso!')
        setIsCreateOpen(false)
        void refreshCustomersPage() 
    }

    const handleEditCustomer = async (profileId: string, storeId: string, data: CustomerEditFormData) => {
        const res = await updateCustomerAsAdminTx(profileId, storeId, {
            fullName: data.fullName,
            email: data.email,
            phone: data.phone,
            companyName: data.companyName,
            tradeName: data.tradeName,
            cnpj: data.cnpj,
            customerTypeId: data.customerTypeId,
            representativeId: data.representativeId,
            tagIds: data.tagIds,
            address: data.address,
            city: data.city,
            state: data.state,
            zipCode: data.zipCode,
        })

        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success('Cliente atualizado com sucesso!')
        setEditCustomer(null)
        void refreshCustomersPage()
    }

    // Bulk Actions
    const handleBulkApprove = async () => {
        const result = await bulkUpdateCustomerStatusAsAdmin(selectedIds, 'approved')
        if (result.error) { toast.error(result.error); return }

        toast.success(`${selectedIds.length} clientes aprovados!`)
        setSelectedIds([])
        void refreshCustomersPage()
    }

    const handleBulkBlock = async () => {
        const result = await bulkUpdateCustomerStatusAsAdmin(selectedIds, 'blocked')
        if (result.error) { toast.error(result.error); return }
        toast.success(`${selectedIds.length} clientes bloqueados!`)
        setSelectedIds([])
        void refreshCustomersPage()
    }

    const handleBulkDelete = async () => {
        if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE os ${selectedIds.length} clientes selecionados?`)) return
        const result = await bulkDeleteCustomersAction(selectedIds)
        if (result.error) { toast.error(result.error); return }
        toast.success(`${selectedIds.length} clientes excluÃ­dos!`)
        setSelectedIds([])
        void refreshCustomersPage()
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Clientes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Centro de gerenciamento de clientes
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsImportOpen(true)} className="gap-2">
                        <Upload className="h-4 w-4" />
                        Importar CSV
                    </Button>
                    <Button onClick={() => setIsCreateOpen(true)} className="gradient-navy border-0 text-white gap-2">
                        <Plus className="h-4 w-4" />
                        Novo Cliente
                    </Button>
                </div>
            </div>

            <CustomerFilters 
                search={search}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusChange={handleStatusFilterChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeFilterChange}
                customerTypes={customerTypes}
                selectedCount={selectedIds.length}
                onBulkApprove={handleBulkApprove}
                onBulkBlock={handleBulkBlock}
                onBulkDelete={handleBulkDelete}
            />

            <CustomerOverviewCards
                stats={overviewStats}
                loading={loadingOverview}
                activeKey={overviewFilter}
                onCardClick={handleOverviewCardClick}
            />

            <CustomerList 
                customers={customers}
                loading={loading}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onViewDetail={(c) => router.push(`/admin/customers/${c.id}`)}
                onUpdateStatus={updateStatus}
                onEditCustomer={setEditCustomer}
                onManageAccess={setAccessCustomer}
            />

            {/* Pagination Controls */}
            {!loading && totalCount > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between pt-4 border-t border-white/20 mt-8">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} de {totalCount} clientes
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        >
                            PrÃ³xima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            <CustomerFormModal 
                isOpen={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                saving={isCreating}
                onSave={handleCreateCustomer}
                customerTypes={customerTypes}
                customerTags={customerTags}
                representatives={representatives}
            />

            {/* Edit Drawer */}
            <CustomerEditDrawer
                customer={editCustomer}
                customerTypes={customerTypes}
                customerTags={customerTags}
                representatives={representatives}
                isOpen={!!editCustomer}
                onClose={() => setEditCustomer(null)}
                onSave={handleEditCustomer}
            />

            {/* Import Modal */}
            <CustomerImportModal
                isOpen={isImportOpen}
                onOpenChange={setIsImportOpen}
                onImportComplete={() => {
                    void refreshCustomersPage()
                }}
            />

            {/* Access Modal */}
            <CustomerAccessModal
                customer={accessCustomer}
                isOpen={!!accessCustomer}
                onClose={() => setAccessCustomer(null)}
            />
        </div>
    )
}
