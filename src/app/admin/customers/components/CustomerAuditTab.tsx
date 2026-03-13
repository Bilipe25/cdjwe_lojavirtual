import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Shield, Clock, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CustomerLoginAudit } from '@/lib/types'

function parseDevice(userAgent: string | null): string {
    if (!userAgent) return 'Desconhecido'
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) return 'Mobile'
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS'
    if (userAgent.includes('Windows')) return 'Windows'
    if (userAgent.includes('Macintosh')) return 'Mac'
    if (userAgent.includes('Linux')) return 'Linux'
    return 'Desktop'
}

interface CustomerAuditTabProps {
    auditLog: CustomerLoginAudit[]
    loading: boolean
}

export function CustomerAuditTab({ auditLog, loading }: CustomerAuditTabProps) {
    if (loading) {
        return <div className="text-center py-10 text-muted-foreground text-sm">Carregando histórico...</div>
    }

    if (auditLog.length === 0) {
        return (
            <div className="text-center py-10">
                <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum acesso registrado</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {auditLog.map((entry) => (
                <div key={entry.id} className="bg-white rounded-lg p-3 border text-sm space-y-1">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-navy font-medium">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                            {parseDevice(entry.user_agent)}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {entry.ip_address && (
                            <span className="flex items-center gap-1">
                                <Globe className="h-3 w-3" /> {entry.ip_address}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
