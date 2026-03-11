'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { createCustomerAsAdmin } from './actions'

// Components
import { CustomerFilters } from './components/CustomerFilters'
import { CustomerList, type CustomerWithStore } from './components/CustomerList'
import { CustomerFormModal } from './components/CustomerFormModal'
import { CustomerDetailModal } from './components/CustomerDetailModal'
import { type CustomerFormData } from './schema'

const ITEMS_PER_PAGE = 15;

export default function CustomersPage() {
    const supabase = createClient()

    // Data State
    const [customers, setCustomers] = useState<CustomerWithStore[]>([])
    
    // Server-side State
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)

    // Modals & Selection State
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStore | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    // Apply Debounce for Search filter
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(timer)
    }, [search])

    const loadData = useCallback(async () => {
        setLoading(true)
        
        // Base Query with Stores Inner Join
        let query = supabase
            .from('profiles')
            .select('*, stores(*)', { count: 'exact' })
            .eq('role', 'client')

        // Apply Filters
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter)
        }
        
        if (debouncedSearch) {
            // Buscando os IDs das stores que batem com o CNPJ ou Company Name
            const { data: storeMatches } = await supabase
                .from('stores')
                .select('profile_id')
                .or(`company_name.ilike.%${debouncedSearch}%,cnpj.ilike.%${debouncedSearch}%`);
                
            const storeProfileIds = storeMatches?.map(s => s.profile_id) || [];
            
            // Filtro Complexo: Ou o nome/email bate no profile, ou bateu lá na tabela stores
            const nameOrEmailFilter = `full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`;
            
            if (storeProfileIds.length > 0) {
                // Monta string de profiles ex: 'id.in.(1,2,3)'
                const profileInFilter = `id.in.(${storeProfileIds.join(',')})`;
                query = query.or(`${nameOrEmailFilter},${profileInFilter}`);
            } else {
                query = query.or(nameOrEmailFilter);
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
    }, [debouncedSearch, statusFilter, currentPage, supabase])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Reset pagination on filter changes
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearch, statusFilter])

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
        toast.success(`Cliente ${status === 'approved' ? 'aprovado' : status === 'blocked' ? 'bloqueado' : 'atualizado'}!`)
    }

    const handleCreateCustomer = async (data: CustomerFormData) => {
        setIsCreating(true)
        
        // Manual form data creation to adapt existing Server Action
        const formData = new FormData()
        formData.append('fullName', data.fullName)
        formData.append('email', data.email)
        formData.append('password', data.password)
        formData.append('companyName', data.companyName)
        formData.append('cnpj', data.cnpj)
        
        if (data.phone) formData.append('phone', data.phone)
        if (data.tradeName) formData.append('tradeName', data.tradeName)

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

    // Bulk Actions
    const handleBulkApprove = async () => {
        const { error } = await supabase.from('profiles').update({ status: 'approved' }).in('id', selectedIds)
        if (error) { toast.error('Erro ao aprovar clientes em massa.'); return }

        // Send approval emails to each approved customer
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
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Clientes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie os cadastros dos clientes
                    </p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="gradient-navy border-0 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Novo Cliente
                </Button>
            </div>

            <CustomerFilters 
                search={search}
                onSearchChange={setSearch}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
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

            <CustomerDetailModal 
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
            />

            <CustomerFormModal 
                isOpen={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                saving={isCreating}
                onSave={handleCreateCustomer}
            />
        </div>
    )
}
