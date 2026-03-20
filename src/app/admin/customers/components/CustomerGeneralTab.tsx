import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import type { CustomerWithStore } from './CustomerList'
import type { CustomerType, CustomerTag, Profile } from '@/lib/types'
import { ClientContactCard } from './ClientContactCard'
import { ClientCompanyCard } from './ClientCompanyCard'

interface CustomerGeneralTabProps {
    customer: CustomerWithStore
    customerTypes: CustomerType[]
    customerTags: CustomerTag[]
    representatives: Partial<Profile>[]
    onContactUpdated: (updated: Partial<CustomerWithStore>) => void
    onCompanyUpdated: () => void
}

export function CustomerGeneralTab({ customer, customerTypes, customerTags, representatives, onContactUpdated, onCompanyUpdated }: CustomerGeneralTabProps) {
    return (
        <div className="space-y-4">
            {/* Contact Card */}
            <ClientContactCard customer={customer} onUpdated={onContactUpdated} />

            {/* Company Card */}
            <ClientCompanyCard
                customer={customer}
                customerTypes={customerTypes}
                customerTags={customerTags}
                representatives={representatives}
                onUpdated={onCompanyUpdated}
            />

            {/* Metadata (Read-only) */}
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-navy flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4" /> Linha do Tempo
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cadastrado em</p>
                        <p className="text-sm font-medium">{format(new Date(customer.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Última atualização</p>
                        <p className="text-sm font-medium">{format(new Date(customer.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
