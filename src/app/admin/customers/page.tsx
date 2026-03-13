'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { createCustomerAsAdmin, updateCustomerAsAdmin } from './actions'
import type { CustomerType } from '@/lib/types'
import type { CustomerEditFormData } from './schema'

// Components
import { CustomerFilters } from './components/CustomerFilters'
import { CustomerList, type CustomerWithStore } from './components/CustomerList'
import { CustomerFormModal } from './components/CustomerFormModal'
import { CustomerDetailModal } from './components/CustomerDetailModal'
import { CustomerEditDrawer } from './components/CustomerEditDrawer'
import { CustomerImportModal } from './components/CustomerImportModal'
import { CustomerAccessModal } from './components/CustomerAccessModal'
import { type CustomerFormData } from './schema'

const ITEMS_PER_PAGE = 15;

export default function CustomersPage() {
    const supabase = createClient()

    // Data State
    const [customers, setCustomers] = useState<CustomerWithStore[]>([])
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    
    // Server-side State
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    // Modals & Selection State
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStore | null>(null)
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

    // Load customer types once
    useEffect(() => {
        const loadTypes = async () => {
            const { data } = await supabase
                .from('customer_types')
                .select('*')
                .eq('is_active', true)
                .order('sort_order')
            if (data) setCustomerTypes(data)
        }
        loadTypes()
    }, [])

    const loadData = useCallback(async () => {
        setLoading(true)
        
        // Base Query with Stores Inner Join + customer_type relation
        let query = supabase
            .from('profiles')
            .select('*, stores(*, customer_type:customer_types(*))', { count: 'exact' })
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

        // Type filter — need to filter by store's customer_type_id
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
    }, [debouncedSearch, statusFilter, typeFilter, currentPage, supabase])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Reset pagination on filter changes
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, statusFilter, typeFilter])

    // Toggle Selection
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    // Server Actions
    const updateStatus = async (profileId: string, status: string) => {
        if (status === 'delete') {
            if (!confirm('Tem certeza que deseja EXCLUIR este cliente? Esta ação não pode ser desfeita.')) return
            
            const { error } = await supabase.from('profiles').delete().eq('id', profileId)
            if (error) {
                toast.error('Erro ao excluir cliente')
                return
            }
            toast.success('Cliente excluído com sucesso!')
            loadData()
            return
        }

        const { error } = await supabase.from('profiles').update({ status }).eq('id', profileId)

        if (error) {
            toast.error('Erro ao atualizar status')
            return
        }

        // Send approval email to customer
        if (status === 'approved') {
            const customer = customers.find(c => c.id === profileId)
            if (customer?.email) {
                fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'account_approved',
                        payload: {
                            clientName: customer.full_name,
                            clientEmail: customer.email,
                        },
                    }),
                }).catch(() => {})
            }
        }

        setCustomers(prev =>
            prev.map(c => c.id === profileId ? { ...c, status: status as any } : c)
        )
        
        const statusLabels: Record<string, string> = {
            approved: 'aprovado',
            blocked: 'bloqueado',
            imported: 'marcado como importado',
            pending: 'marcado como pendente',
        }
        toast.success(`Cliente ${statusLabels[status] || 'atualizado'}!`)
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
        if (data.address) formData.append('address', data.address)
        if (data.city) formData.append('city', data.city)
        if (data.state) formData.append('state', data.state)
        if (data.zipCode) formData.append('zipCode', data.zipCode)

        const res = await createCustomerAsAdmin(formData)

        setIsCreating(false)
        
        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success('Cliente cadastrado e aprovado com sucesso!')
        setIsCreateOpen(false)
        loadData() 
    }

    const handleEditCustomer = async (profileId: string, storeId: string, data: CustomerEditFormData) => {
        const res = await updateCustomerAsAdmin(profileId, storeId, {
            fullName: data.fullName,
            email: data.email,
            phone: data.phone,
            companyName: data.companyName,
            tradeName: data.tradeName,
            cnpj: data.cnpj,
            customerTypeId: data.customerTypeId,
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
        loadData()
    }

    // Bulk Actions
    const handleBulkApprove = async () => {
        const { error } = await supabase.from('profiles').update({ status: 'approved' }).in('id', selectedIds)
        if (error) { toast.error('Erro ao aprovar clientes em massa.'); return }

        const approvedCustomers = customers.filter(c => selectedIds.includes(c.id))
        for (const customer of approvedCustomers) {
            if (customer.email) {
                fetch('/api/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'account_approved',
                        payload: {
                            clientName: customer.full_name,
                            clientEmail: customer.email,
                        },
                    }),
                }).catch(() => {})
            }
        }

        toast.success(`${selectedIds.length} clientes aprovados!`)
        setSelectedIds([])
        loadData()
    }

    const handleBulkBlock = async () => {
        const { error } = await supabase.from('profiles').update({ status: 'blocked' }).in('id', selectedIds)
        if (error) { toast.error('Erro ao bloquear clientes em massa.'); return }
        toast.success(`${selectedIds.length} clientes bloqueados!`)
        setSelectedIds([])
        loadData()
    }

    const handleBulkDelete = async () => {
        if (!confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE os ${selectedIds.length} clientes selecionados?`)) return
        const { error } = await supabase.from('profiles').delete().in('id', selectedIds)
        if (error) { toast.error('Erro ao excluir clientes.'); return }
        toast.success(`${selectedIds.length} clientes excluídos!`)
        setSelectedIds([])
        loadData()
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
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                typeFilter={typeFilter}
                onTypeChange={setTypeFilter}
                customerTypes={customerTypes}
                selectedCount={selectedIds.length}
                onBulkApprove={handleBulkApprove}
                onBulkBlock={handleBulkBlock}
                onBulkDelete={handleBulkDelete}
            />

            <CustomerList 
                customers={customers}
                loading={loading}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onViewDetail={setSelectedCustomer}
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
                            Próxima <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Detail Drawer */}
            <CustomerDetailModal 
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
                onEdit={(c) => { setSelectedCustomer(null); setEditCustomer(c); }}
                onManageAccess={(c) => { setSelectedCustomer(null); setAccessCustomer(c); }}
            />

            {/* Create Modal */}
            <CustomerFormModal 
                isOpen={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                saving={isCreating}
                onSave={handleCreateCustomer}
                customerTypes={customerTypes}
            />

            {/* Edit Drawer */}
            <CustomerEditDrawer
                customer={editCustomer}
                customerTypes={customerTypes}
                isOpen={!!editCustomer}
                onClose={() => setEditCustomer(null)}
                onSave={handleEditCustomer}
            />

            {/* Import Modal */}
            <CustomerImportModal
                isOpen={isImportOpen}
                onOpenChange={setIsImportOpen}
                onImportComplete={loadData}
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
