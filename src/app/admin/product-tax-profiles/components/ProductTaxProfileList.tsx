import { Copy, Pencil, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ProductTaxProfileListItem } from '@/app/admin/actions/products'

interface ProductTaxProfileListProps {
    profiles: ProductTaxProfileListItem[]
    selectedId: string | null
    loading: boolean
    onSelect: (profileId: string) => void
    onEdit: (profileId: string) => void
    onDuplicate: (profileId: string) => void
    onToggle: (profileId: string, nextState: boolean) => void
}

export function ProductTaxProfileList({
    profiles,
    selectedId,
    loading,
    onSelect,
    onEdit,
    onDuplicate,
    onToggle,
}: ProductTaxProfileListProps) {
    if (loading) {
        return (
            <div className="rounded-xl border bg-white p-4">
                <p className="text-sm text-muted-foreground">Carregando perfis tributarios...</p>
            </div>
        )
    }

    if (profiles.length === 0) {
        return (
            <div className="rounded-xl border bg-white p-6 text-center">
                <p className="text-sm text-muted-foreground">Nenhum perfil tributario cadastrado.</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {profiles.map((profile) => {
                const isSelected = selectedId === profile.id
                return (
                    <div
                        key={profile.id}
                        className={`rounded-xl border bg-white p-4 transition-all ${isSelected ? 'border-navy shadow-sm' : 'border-slate-200'}`}
                    >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <button
                                type="button"
                                className="text-left"
                                onClick={() => onSelect(profile.id)}
                            >
                                <p className="text-sm font-semibold text-navy">{profile.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    Codigo: {profile.code} - Versao {profile.version}
                                </p>
                            </button>

                            <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline" className="bg-white">
                                    NCM: {profile.ncm || 'N/D'}
                                </Badge>
                                <Badge variant="outline" className="bg-white">
                                    CEST: {profile.cest || 'N/D'}
                                </Badge>
                                <Badge variant="outline" className="bg-white">
                                    CFOP: {profile.default_output_cfop || 'N/D'}
                                </Badge>
                                <Badge variant="outline" className="bg-white">
                                    Produtos: {profile.products_count}
                                </Badge>
                                <Badge
                                    className={
                                        profile.is_active
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                                    }
                                >
                                    {profile.is_active ? 'Ativo' : 'Inativo'}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => onEdit(profile.id)}>
                                    <Pencil className="h-3.5 w-3.5 mr-1" />
                                    Editar
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onDuplicate(profile.id)}>
                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                    Duplicar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onToggle(profile.id, !profile.is_active)}
                                >
                                    <Power className="h-3.5 w-3.5 mr-1" />
                                    {profile.is_active ? 'Inativar' : 'Ativar'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
