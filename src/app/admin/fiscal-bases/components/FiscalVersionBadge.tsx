import { Badge } from '@/components/ui/badge'
import type { FiscalReferenceVersionItem } from '@/app/admin/actions/fiscal-bases'

interface FiscalVersionBadgeProps {
    version: FiscalReferenceVersionItem | null
    stale?: boolean
    compact?: boolean
}

export function FiscalVersionBadge({ version, stale = false, compact = false }: FiscalVersionBadgeProps) {
    if (!version) {
        return (
            <Badge variant="outline" className="border-dashed text-slate-500">
                {'Sem vers\u00E3o ativa'}
            </Badge>
        )
    }

    return (
        <Badge
            variant="outline"
            className={
                stale
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : version.isActive
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-white text-slate-700'
            }
        >
            {compact ? version.versionLabel : `Versão ${version.versionLabel}`}
        </Badge>
    )
}
