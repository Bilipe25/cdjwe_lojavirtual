import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Mail, Phone, MapPin } from 'lucide-react'
import type { CustomerWithStore } from './CustomerList'

interface CustomerGeneralTabProps {
    customer: CustomerWithStore
}

export function CustomerGeneralTab({ customer }: CustomerGeneralTabProps) {
    const store = customer.stores?.[0]

    return (
        <div className="space-y-5">
            {/* Contact Info */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold text-navy">Contato</h4>
                <div className="bg-white rounded-lg p-3 space-y-2.5 text-sm border">
                    <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{customer.email}</span>
                    </div>
                    {customer.phone && (
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{customer.phone}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Company Info */}
            {store && (
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-navy">Empresa</h4>
                    <div className="bg-white rounded-lg p-3 space-y-1.5 text-sm border">
                        <p><strong>Razão Social:</strong> {store.company_name}</p>
                        {store.trade_name && <p><strong>Nome Fantasia:</strong> {store.trade_name}</p>}
                        <p><strong>CNPJ:</strong> {store.cnpj}</p>
                        {store.customer_type?.name && (
                            <p><strong>Tipo:</strong> {store.customer_type.name}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Address */}
            {store?.address && (
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-navy flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> Endereço
                    </h4>
                    <div className="bg-white rounded-lg p-3 text-sm border">
                        <p>{store.address}</p>
                        <p>{store.city && `${store.city}`}{store.state && ` - ${store.state}`}{store.zip_code && ` • CEP: ${store.zip_code}`}</p>
                    </div>
                </div>
            )}

            {/* Metadata */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold text-navy">Info</h4>
                <div className="bg-white rounded-lg p-3 text-xs text-muted-foreground space-y-1 border">
                    <p>Cadastrado em: {format(new Date(customer.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    <p>Atualizado em: {format(new Date(customer.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                </div>
            </div>
        </div>
    )
}
