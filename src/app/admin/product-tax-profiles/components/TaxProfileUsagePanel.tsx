import type { ProductTaxProfileUsageItem } from '@/app/admin/actions/products'

interface TaxProfileUsagePanelProps {
    loading: boolean
    usage: ProductTaxProfileUsageItem[]
}

export function TaxProfileUsagePanel({ loading, usage }: TaxProfileUsagePanelProps) {
    return (
        <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-navy mb-3">Produtos Vinculados</h3>
            {loading ? (
                <p className="text-xs text-muted-foreground">Carregando vinculacoes...</p>
            ) : usage.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum produto vinculado a este perfil.</p>
            ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {usage.map((item) => (
                        <div key={item.product_id} className="rounded-lg border border-slate-200 px-3 py-2">
                            <p className="text-sm font-medium text-navy">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                                /{item.product_slug} - {item.product_is_active ? 'Ativo' : 'Inativo'}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
