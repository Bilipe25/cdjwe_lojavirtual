import { useCallback, useState, type ReactNode } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, ShoppingBag, Shield, Pencil, Key } from 'lucide-react'
import { getCustomerAuditLog, getCustomerOrders } from '../actions'
import { CustomerGeneralTab } from './CustomerGeneralTab'
import { CustomerOrdersTab, type CustomerOrderSummary } from './CustomerOrdersTab'
import { CustomerAuditTab } from './CustomerAuditTab'
import type { CustomerWithStore } from './CustomerList'
import type { CustomerLoginAudit } from '@/lib/types'

type TabKey = 'general' | 'orders' | 'audit'

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Ativo', color: 'bg-green-100 text-green-800 border-green-200' },
    blocked: { label: 'Bloqueado', color: 'bg-red-100 text-red-800 border-red-200' },
    imported: { label: 'Importado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
}

interface CustomerDetailModalProps {
    customer: CustomerWithStore | null
    onClose: () => void
    onEdit: (customer: CustomerWithStore) => void
    onManageAccess: (customer: CustomerWithStore) => void
}

interface CustomerDetailContentProps {
    customer: CustomerWithStore
    onClose: () => void
    onEdit: (customer: CustomerWithStore) => void
    onManageAccess: (customer: CustomerWithStore) => void
}

function CustomerDetailContent({ customer, onClose, onEdit, onManageAccess }: CustomerDetailContentProps) {
    const [activeTab, setActiveTab] = useState<TabKey>('general')
    const [auditLog, setAuditLog] = useState<CustomerLoginAudit[]>([])
    const [orders, setOrders] = useState<CustomerOrderSummary[]>([])
    const [loadingAudit, setLoadingAudit] = useState(false)
    const [loadingOrders, setLoadingOrders] = useState(false)
    const [didLoadAudit, setDidLoadAudit] = useState(false)
    const [didLoadOrders, setDidLoadOrders] = useState(false)

    const store = customer.stores?.[0]
    const config = statusConfig[customer.status] || statusConfig.pending

    const loadAudit = useCallback(async () => {
        setLoadingAudit(true)
        const result = await getCustomerAuditLog(customer.id)
        if (result.data) {
            setAuditLog(result.data)
        }
        setDidLoadAudit(true)
        setLoadingAudit(false)
    }, [customer.id])

    const loadOrders = useCallback(async () => {
        setLoadingOrders(true)
        const result = await getCustomerOrders(customer.id)
        if (result.data) {
            setOrders(result.data as CustomerOrderSummary[])
        }
        setDidLoadOrders(true)
        setLoadingOrders(false)
    }, [customer.id])

    const handleTabChange = useCallback(
        (tab: TabKey) => {
            setActiveTab(tab)

            if (tab === 'audit' && !didLoadAudit && !loadingAudit) {
                void loadAudit()
            }

            if (tab === 'orders' && !didLoadOrders && !loadingOrders) {
                void loadOrders()
            }
        },
        [didLoadAudit, didLoadOrders, loadAudit, loadOrders, loadingAudit, loadingOrders]
    )

    const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
        { key: 'general', label: 'Geral', icon: <Building2 className="h-4 w-4" /> },
        { key: 'orders', label: 'Pedidos', icon: <ShoppingBag className="h-4 w-4" /> },
        { key: 'audit', label: 'Auditoria', icon: <Shield className="h-4 w-4" /> },
    ]

    return (
        <Sheet open onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
                <SheetHeader className="p-6 border-b bg-white z-10">
                    <div className="flex items-start gap-4">
                        <div className="h-14 w-14 rounded-full gradient-navy flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-lg">{customer.full_name.substring(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <SheetTitle className="font-heading text-lg truncate">{customer.full_name}</SheetTitle>
                            <SheetDescription className="truncate">{store?.company_name || customer.email}</SheetDescription>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <Badge className={`text-[10px] border ${config.color}`}>{config.label}</Badge>
                                {store?.customer_type?.name && (
                                    <Badge variant="outline" className="text-[10px] border-bronze/30 text-bronze bg-bronze/5">
                                        {store.customer_type.name}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => onEdit(customer)}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => onManageAccess(customer)}>
                            <Key className="h-3.5 w-3.5" /> Acesso
                        </Button>
                    </div>

                    <div className="flex border-b -mx-6 px-6 mt-4 gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => handleTabChange(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                                    activeTab === tab.key
                                        ? 'border-navy text-navy'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {activeTab === 'general' && <CustomerGeneralTab customer={customer} />}
                    {activeTab === 'orders' && <CustomerOrdersTab orders={orders} loading={loadingOrders} />}
                    {activeTab === 'audit' && <CustomerAuditTab auditLog={auditLog} loading={loadingAudit} />}
                </div>
            </SheetContent>
        </Sheet>
    )
}

export function CustomerDetailModal({ customer, onClose, onEdit, onManageAccess }: CustomerDetailModalProps) {
    if (!customer) {
        return null
    }

    return (
        <CustomerDetailContent
            key={customer.id}
            customer={customer}
            onClose={onClose}
            onEdit={onEdit}
            onManageAccess={onManageAccess}
        />
    )
}
