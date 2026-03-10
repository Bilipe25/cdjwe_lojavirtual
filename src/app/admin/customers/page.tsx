'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Users,
    Search,
    Check,
    X,
    Ban,
    MoreHorizontal,
    Mail,
    Phone,
    Building2,
    Eye,
    Plus,
    Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Profile, Store } from '@/lib/types'
import { createCustomerAsAdmin } from './actions'

type CustomerWithStore = Profile & { stores: Store[] }

const statusConfig = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Aprovado', color: 'bg-green-100 text-green-800 border-green-200' },
    blocked: { label: 'Bloqueado', color: 'bg-red-100 text-red-800 border-red-200' },
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<CustomerWithStore[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStore | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)

    useEffect(() => {
        loadCustomers()
    }, [])

    const loadCustomers = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase
            .from('profiles')
            .select('*, stores(*)')
            .eq('role', 'client')
            .order('created_at', { ascending: false })

        if (data) setCustomers(data as CustomerWithStore[])
        setLoading(false)
    }

    const updateStatus = async (profileId: string, status: string) => {
        const supabase = createClient()
        const { error } = await supabase
            .from('profiles')
            .update({ status })
            .eq('id', profileId)

        if (error) {
            toast.error('Erro ao atualizar status')
            return
        }

        setCustomers(prev =>
            prev.map(c => c.id === profileId ? { ...c, status: status as Profile['status'] } : c)
        )
        toast.success(`Cliente ${status === 'approved' ? 'aprovado' : status === 'blocked' ? 'bloqueado' : 'atualizado'}!`)
    }

    const handleCreateCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsCreating(true)
        const formData = new FormData(e.currentTarget)
        const res = await createCustomerAsAdmin(formData)

        setIsCreating(false)
        if (res.error) {
            toast.error(res.error)
            return
        }

        toast.success('Cliente cadastrado e aprovado com sucesso!')
        setIsCreateOpen(false)
        loadCustomers() // reload list
    }

    const filtered = customers.filter((c) => {
        if (statusFilter !== 'all' && c.status !== statusFilter) return false
        if (search) {
            const s = search.toLowerCase()
            const store = c.stores?.[0]
            return (
                c.full_name.toLowerCase().includes(s) ||
                c.email.toLowerCase().includes(s) ||
                store?.company_name?.toLowerCase().includes(s) ||
                store?.cnpj?.includes(s)
            )
        }
        return true
    })

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
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

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome, email, CNPJ..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-11 bg-white/60"
                    />
                </div>
                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                    <SelectTrigger className="w-full sm:w-48 h-11 bg-white/60">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendentes</SelectItem>
                        <SelectItem value="approved">Aprovados</SelectItem>
                        <SelectItem value="blocked">Bloqueados</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Customer List */}
            {
                loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Card key={i} className="glass-card border-0">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-4">
                                        <Skeleton className="h-12 w-12 rounded-full" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-32" />
                                        </div>
                                        <Skeleton className="h-8 w-24" />
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                            <Users className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold">Nenhum cliente encontrado</h3>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((customer, i) => {
                            const store = customer.stores?.[0]
                            const config = statusConfig[customer.status]
                            return (
                                <motion.div
                                    key={customer.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                >
                                    <Card className="glass-card border-0 hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                                {/* Avatar */}
                                                <div className="h-12 w-12 rounded-full gradient-navy flex items-center justify-center shrink-0">
                                                    <span className="text-white font-semibold text-sm">
                                                        {customer.full_name.substring(0, 2).toUpperCase()}
                                                    </span>
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-semibold truncate">{customer.full_name}</h3>
                                                        <Badge className={`text-[10px] border ${config.color}`}>
                                                            {config.label}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground truncate">
                                                        {store?.company_name || 'Sem empresa'} • {store?.cnpj || 'Sem CNPJ'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {customer.email} • Desde {format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                                                    </p>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {customer.status === 'pending' && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                className="gradient-navy border-0 text-white gap-1"
                                                                onClick={() => updateStatus(customer.id, 'approved')}
                                                            >
                                                                <Check className="h-3.5 w-3.5" />
                                                                Aprovar
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="text-destructive gap-1"
                                                                onClick={() => updateStatus(customer.id, 'blocked')}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                                Recusar
                                                            </Button>
                                                        </>
                                                    )}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setSelectedCustomer(customer)}>
                                                                <Eye className="h-4 w-4 mr-2" />
                                                                Ver Detalhes
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            {customer.status !== 'approved' && (
                                                                <DropdownMenuItem onClick={() => updateStatus(customer.id, 'approved')}>
                                                                    <Check className="h-4 w-4 mr-2" />
                                                                    Aprovar
                                                                </DropdownMenuItem>
                                                            )}
                                                            {customer.status !== 'blocked' && (
                                                                <DropdownMenuItem
                                                                    onClick={() => updateStatus(customer.id, 'blocked')}
                                                                    className="text-destructive"
                                                                >
                                                                    <Ban className="h-4 w-4 mr-2" />
                                                                    Bloquear
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
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

            {/* Customer Detail Dialog */}
            <Dialog open={!!selectedCustomer} onOpenChange={(o) => !o && setSelectedCustomer(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)]">Detalhes do Cliente</DialogTitle>
                        <DialogDescription>Informações completas do cadastro</DialogDescription>
                    </DialogHeader>
                    {selectedCustomer && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-14 w-14 rounded-full gradient-navy flex items-center justify-center">
                                    <span className="text-white font-bold text-lg">
                                        {selectedCustomer.full_name.substring(0, 2).toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="font-semibold">{selectedCustomer.full_name}</h3>
                                    <Badge className={`text-[10px] border ${statusConfig[selectedCustomer.status].color}`}>
                                        {statusConfig[selectedCustomer.status].label}
                                    </Badge>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span>{selectedCustomer.email}</span>
                                </div>
                                {selectedCustomer.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <span>{selectedCustomer.phone}</span>
                                    </div>
                                )}
                            </div>

                            {selectedCustomer.stores?.[0] && (
                                <>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Building2 className="h-4 w-4" />
                                        <span className="text-sm font-medium">Empresa</span>
                                    </div>
                                    <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                                        <p><strong>Razão Social:</strong> {selectedCustomer.stores[0].company_name}</p>
                                        {selectedCustomer.stores[0].trade_name && (
                                            <p><strong>Nome Fantasia:</strong> {selectedCustomer.stores[0].trade_name}</p>
                                        )}
                                        <p><strong>CNPJ:</strong> {selectedCustomer.stores[0].cnpj}</p>
                                        {selectedCustomer.stores[0].address && (
                                            <p><strong>Endereço:</strong> {selectedCustomer.stores[0].address}, {selectedCustomer.stores[0].city} - {selectedCustomer.stores[0].state}</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Customer Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="font-[family-name:var(--font-heading)] text-2xl">
                            Novo Cliente
                        </DialogTitle>
                        <DialogDescription>
                            Crie um novo acesso de lojista. A conta já será aprovada automaticamente.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateCustomer} className="space-y-6 mt-4">
                        {/* Pessoais / Acesso */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                                <Users className="h-4 w-4" />
                                <span className="text-sm font-medium">Dados de Acesso (Login)</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nome do Responsável *</Label>
                                    <Input name="fullName" required placeholder="João da Silva" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Telefone / WhatsApp</Label>
                                    <Input name="phone" placeholder="(11) 99999-9999" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>E-mail (Login) *</Label>
                                    <Input name="email" type="email" required placeholder="joao@loja.com.br" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Senha Inicial *</Label>
                                    <Input name="password" type="text" required placeholder="Min 6 caracteres" className="bg-white/60" />
                                </div>
                            </div>
                        </div>

                        {/* Empresa */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                                <Building2 className="h-4 w-4" />
                                <span className="text-sm font-medium">Dados da Empresa</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2 sm:col-span-2">
                                    <Label>Razão Social *</Label>
                                    <Input name="companyName" required placeholder="João da Silva Móveis ME" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nome Fantasia</Label>
                                    <Input name="tradeName" placeholder="Loja do João" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>CNPJ *</Label>
                                    <Input name="cnpj" required placeholder="00.000.000/0001-00" className="bg-white/60" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isCreating} className="gradient-navy border-0 text-white min-w-[140px]">
                                {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                Salvar e Aprovar
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div >
    )
}
