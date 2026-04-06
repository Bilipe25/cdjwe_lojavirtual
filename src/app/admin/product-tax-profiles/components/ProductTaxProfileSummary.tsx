import { Badge } from '@/components/ui/badge'

interface ProductTaxProfileSummaryProps {
    total: number
    active: number
    inactive: number
}

export function ProductTaxProfileSummary({ total, active, inactive }: ProductTaxProfileSummaryProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-white">
                Total: {total}
            </Badge>
            <Badge className="bg-emerald-600 text-white">Ativos: {active}</Badge>
            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                Inativos: {inactive}
            </Badge>
        </div>
    )
}

