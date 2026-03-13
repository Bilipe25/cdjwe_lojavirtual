import { motion } from 'framer-motion';
import { Users, MoreHorizontal, Check, X, Ban, Eye, CheckSquare, Square, Pencil, Key, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { Profile, Store, CustomerType, StoreTag, CustomerTag } from '@/lib/types';

export type CustomerWithStore = Profile & { 
    stores: (Store & { 
        customer_type?: CustomerType,
        store_tags?: (StoreTag & { customer_tags?: CustomerTag })[],
        representative?: Profile
    })[] 
};

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Ativo', color: 'bg-green-100 text-green-800 border-green-200' },
    blocked: { label: 'Bloqueado', color: 'bg-red-100 text-red-800 border-red-200' },
    imported: { label: 'Importado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
};

interface CustomerListProps {
    customers: CustomerWithStore[];
    loading: boolean;
    selectedIds: string[];
    onToggleSelect: (id: string) => void;
    onViewDetail: (customer: CustomerWithStore) => void;
    onUpdateStatus: (id: string, status: string) => void;
    onEditCustomer: (customer: CustomerWithStore) => void;
    onManageAccess: (customer: CustomerWithStore) => void;
}

export function CustomerList({
    customers,
    loading,
    selectedIds,
    onToggleSelect,
    onViewDetail,
    onUpdateStatus,
    onEditCustomer,
    onManageAccess
}: CustomerListProps) {
    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="glass-card border-0">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-5 rounded-sm shrink-0" />
                                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-8 w-24 shrink-0" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (customers.length === 0) {
        return (
            <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground text-sm mt-1">
                    Experimente alterar os filtros ou limpar a pesquisa.
                </p>
            </div>
        );
    }

    return (
        <>
            {/* MOBILE VIEW (Cards) */}
            <div className="space-y-3 block lg:hidden">
                {customers.map((customer, i) => {
                    const store = customer.stores?.[0];
                    const config = statusConfig[customer.status] || statusConfig.pending;
                    const isSelected = selectedIds.includes(customer.id);
                    const customerTypeName = store?.customer_type?.name;
                    const representativeName = store?.representative?.full_name;
                    const storeTags = store?.store_tags?.map(st => st.customer_tags).filter(Boolean) || [];

                    return (
                        <motion.div
                            key={customer.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(i * 0.03, 0.3) }}
                        >
                            <Card className={`glass-card border-0 hover:shadow-md transition-all ${isSelected ? 'ring-2 ring-navy/50 bg-navy/5' : ''}`}>
                                <CardContent className="p-0">
                                    <div 
                                        className="flex flex-col sm:flex-row sm:items-center p-4 gap-4 cursor-pointer"
                                        onClick={() => onViewDetail(customer)}
                                    >
                                        {/* Checkbox & Avatar */}
                                        <div className="flex items-center gap-4 shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onToggleSelect(customer.id); }}
                                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-black/5"
                                            >
                                                {isSelected ? <CheckSquare className="h-5 w-5 text-navy" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                                            </button>

                                            <div className="h-12 w-12 rounded-full gradient-navy flex items-center justify-center shadow-sm">
                                                <span className="text-white font-semibold text-sm">
                                                    {customer.full_name.substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0 pr-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-navy truncate" title={customer.full_name}>{customer.full_name}</h3>
                                                <Badge className={`text-[10px] border shadow-sm ${config.color}`}>
                                                    {config.label}
                                                </Badge>
                                                {customerTypeName && (
                                                    <Badge variant="outline" className="text-[10px] border-bronze/30 text-bronze bg-bronze/5">
                                                        {customerTypeName}
                                                    </Badge>
                                                )}
                                                {storeTags.map((t, idx) => (
                                                    <Badge key={idx} className={`text-[10px] font-normal border shadow-sm ${t?.color || 'bg-slate-100 text-slate-800'}`}>
                                                        {t?.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <p className="text-sm text-muted-foreground truncate" title={store?.company_name || 'Sem empresa'}>
                                                {store?.company_name || 'Sem empresa'} <span className="text-xs opacity-70">• {store?.cnpj || 'S/ CNPJ'}</span>
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5 opacity-80 flex items-center gap-2">
                                                <span>{customer.email}</span>
                                                {representativeName && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-navy font-medium text-[11px]" title="Representante">
                                                            👤 {representativeName}
                                                        </span>
                                                    </>
                                                )}
                                                <span>•</span>
                                                <span>{format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0 ml-12 sm:ml-0" onClick={e => e.stopPropagation()}>
                                            {(customer.status === 'pending' || customer.status === 'imported') && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        className="gradient-navy border-0 text-white gap-1 shadow-sm h-8"
                                                        onClick={() => onUpdateStatus(customer.id, 'approved')}
                                                    >
                                                        <Check className="h-3.5 w-3.5" />
                                                        <span className="hidden md:inline">Aprovar</span>
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-destructive gap-1 h-8"
                                                        onClick={() => onUpdateStatus(customer.id, 'blocked')}
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                        <span className="hidden md:inline">Recusar</span>
                                                    </Button>
                                                </>
                                            )}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => onViewDetail(customer)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Ver Detalhes
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onEditCustomer(customer)}>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onManageAccess(customer)}>
                                                        <Key className="h-4 w-4 mr-2" />
                                                        Gerenciar Acesso
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {customer.status !== 'approved' && (
                                                        <DropdownMenuItem onClick={() => onUpdateStatus(customer.id, 'approved')}>
                                                            <Check className="h-4 w-4 mr-2" />
                                                            Aprovar
                                                        </DropdownMenuItem>
                                                    )}
                                                    {customer.status !== 'blocked' && (
                                                        <DropdownMenuItem
                                                            onClick={() => onUpdateStatus(customer.id, 'blocked')}
                                                            className="text-destructive"
                                                        >
                                                            <Ban className="h-4 w-4 mr-2" />
                                                            Bloquear
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => onUpdateStatus(customer.id, 'delete')}
                                                        className="text-red-700 focus:bg-red-50 focus:text-red-800"
                                                    >
                                                        <X className="h-4 w-4 mr-2" />
                                                        Excluir Cliente
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </div>

            {/* DESKTOP VIEW (Table) */}
            <div className="hidden lg:block bg-white/60 rounded-xl border border-white/40 shadow-sm overflow-hidden backdrop-blur-md">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Empresa / CNPJ</TableHead>
                            <TableHead>Contato</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Tags</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.map((customer) => {
                            const store = customer.stores?.[0];
                            const config = statusConfig[customer.status] || statusConfig.pending;
                            const isSelected = selectedIds.includes(customer.id);
                            const customerTypeName = store?.customer_type?.name;
                            const representativeName = store?.representative?.full_name;
                            const storeTags = store?.store_tags?.map(st => st.customer_tags).filter(Boolean) || [];

                            return (
                                <TableRow 
                                    key={customer.id} 
                                    className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${isSelected ? 'bg-navy/5 hover:bg-navy/10' : ''}`}
                                    onClick={() => onViewDetail(customer)}
                                >
                                    <TableCell onClick={(e) => e.stopPropagation()} className="py-3">
                                        <button
                                            type="button"
                                            onClick={() => onToggleSelect(customer.id)}
                                            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-black/5"
                                        >
                                            {isSelected ? <CheckSquare className="h-5 w-5 text-navy" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                                        </button>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full gradient-navy flex items-center justify-center shadow-sm shrink-0">
                                                <span className="text-white font-semibold text-xs">
                                                    {customer.full_name.substring(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm text-navy">{customer.full_name}</p>
                                                <p className="text-xs text-muted-foreground">Reg. {format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm text-foreground">{store?.company_name || 'Sem empresa cadastrada'}</span>
                                            <span className="text-xs text-muted-foreground">{store?.cnpj || 'Sem CNPJ'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{customer.email}</span>
                                            {customer.phone ? (
                                                <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Sem telefone</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <Badge className={`text-[11px] font-medium border shadow-sm ${config.color}`}>
                                            {config.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-3">
                                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                                            <div className="flex items-center gap-1 flex-wrap">
                                                {customerTypeName && (
                                                    <Badge variant="outline" className="text-[10px] border-bronze/30 text-bronze bg-bronze/5 px-1.5 py-0 h-5">
                                                        {customerTypeName}
                                                    </Badge>
                                                )}
                                                {storeTags.slice(0, 2).map((t, idx) => (
                                                    <Badge key={idx} className={`text-[10px] font-normal border shadow-sm px-1.5 py-0 h-5 max-w-[100px] truncate ${t?.color || 'bg-slate-100 text-slate-800'}`}>
                                                        {t?.name}
                                                    </Badge>
                                                ))}
                                                {storeTags.length > 2 && (
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-white">+{storeTags.length - 2}</Badge>
                                                )}
                                            </div>
                                            {representativeName && (
                                                <div className="flex items-center text-[11px] font-medium text-navy/80">
                                                    <Users className="h-3 w-3 mr-1" />
                                                    <span className="truncate max-w-[140px]" title={representativeName}>{representativeName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right py-3" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-2">
                                            {(customer.status === 'pending' || customer.status === 'imported') && (
                                                <div className="flex items-center gap-1 mr-2 border-r pr-2 border-slate-200">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                        title="Aprovar Cliente"
                                                        onClick={() => onUpdateStatus(customer.id, 'approved')}
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        title="Recusar Cliente"
                                                        onClick={() => onUpdateStatus(customer.id, 'blocked')}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            )}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => onViewDetail(customer)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Ver Detalhes
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onEditCustomer(customer)}>
                                                        <Pencil className="h-4 w-4 mr-2" />
                                                        Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => onManageAccess(customer)}>
                                                        <Key className="h-4 w-4 mr-2" />
                                                        Gerenciar Acesso
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    {customer.status !== 'approved' && (
                                                        <DropdownMenuItem onClick={() => onUpdateStatus(customer.id, 'approved')}>
                                                            <Check className="h-4 w-4 mr-2" />
                                                            Aprovar
                                                        </DropdownMenuItem>
                                                    )}
                                                    {customer.status !== 'blocked' && (
                                                        <DropdownMenuItem
                                                            onClick={() => onUpdateStatus(customer.id, 'blocked')}
                                                            className="text-destructive"
                                                        >
                                                            <Ban className="h-4 w-4 mr-2" />
                                                            Bloquear
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onClick={() => onUpdateStatus(customer.id, 'delete')}
                                                        className="text-red-700 focus:bg-red-50 focus:text-red-800"
                                                    >
                                                        <X className="h-4 w-4 mr-2" />
                                                        Excluir Cliente
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </>
    );
}
