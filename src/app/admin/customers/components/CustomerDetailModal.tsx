import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Building2 } from 'lucide-react';
import type { CustomerWithStore } from './CustomerList';

const statusConfig = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Aprovado', color: 'bg-green-100 text-green-800 border-green-200' },
    blocked: { label: 'Bloqueado', color: 'bg-red-100 text-red-800 border-red-200' },
};

interface CustomerDetailModalProps {
    customer: CustomerWithStore | null;
    onClose: () => void;
}

export function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
    return (
        <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="font-heading">Detalhes do Cliente</DialogTitle>
                    <DialogDescription>Informações completas do cadastro</DialogDescription>
                </DialogHeader>
                {customer && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-full gradient-navy flex items-center justify-center">
                                <span className="text-white font-bold text-lg">
                                    {customer.full_name.substring(0, 2).toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <h3 className="font-semibold">{customer.full_name}</h3>
                                <Badge className={`text-[10px] border ${statusConfig[customer.status].color}`}>
                                    {statusConfig[customer.status].label}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{customer.email}</span>
                            </div>
                            {customer.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <span>{customer.phone}</span>
                                </div>
                            )}
                        </div>

                        {customer.stores?.[0] && (
                            <>
                                <div className="flex items-center gap-2 text-muted-foreground mt-4 border-t pt-4">
                                    <Building2 className="h-4 w-4" />
                                    <span className="text-sm font-medium">Empresa</span>
                                </div>
                                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                                    <p><strong>Razão Social:</strong> {customer.stores[0].company_name}</p>
                                    {customer.stores[0].trade_name && (
                                        <p><strong>Nome Fantasia:</strong> {customer.stores[0].trade_name}</p>
                                    )}
                                    <p><strong>CNPJ:</strong> {customer.stores[0].cnpj}</p>
                                    {customer.stores[0].address && (
                                        <p><strong>Endereço:</strong> {customer.stores[0].address}, {customer.stores[0].city} - {customer.stores[0].state}</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
