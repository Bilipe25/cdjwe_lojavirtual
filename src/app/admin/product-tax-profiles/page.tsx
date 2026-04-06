'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    duplicateProductTaxProfileAction,
    getProductTaxProfileUsageAction,
    listProductTaxProfilesAction,
    toggleProductTaxProfileStatusAction,
    type ProductTaxProfileListItem,
    type ProductTaxProfileUsageItem,
} from '@/app/admin/actions/products'
import { ProductTaxProfileList } from './components/ProductTaxProfileList'
import { ProductTaxProfileSummary } from './components/ProductTaxProfileSummary'
import { TaxProfileUsagePanel } from './components/TaxProfileUsagePanel'

export default function ProductTaxProfilesPage() {
    const router = useRouter()
    const [profiles, setProfiles] = useState<ProductTaxProfileListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
    const [usage, setUsage] = useState<ProductTaxProfileUsageItem[]>([])
    const [usageLoading, setUsageLoading] = useState(false)

    const loadProfiles = useCallback(async () => {
        setLoading(true)
        const result = await listProductTaxProfilesAction({
            search,
            includeInactive: true,
        })

        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao carregar perfis tributarios.')
            setProfiles([])
            setLoading(false)
            return
        }

        setProfiles(result.data)
        setSelectedProfileId((current) => {
            if (current && result.data?.some((item) => item.id === current)) {
                return current
            }
            return result.data?.[0]?.id || null
        })
        setLoading(false)
    }, [search])

    const loadUsage = useCallback(async (profileId: string | null) => {
        if (!profileId) {
            setUsage([])
            return
        }
        setUsageLoading(true)
        const result = await getProductTaxProfileUsageAction(profileId, 300)
        if (result.success && result.data) {
            setUsage(result.data)
        } else {
            setUsage([])
        }
        setUsageLoading(false)
    }, [])

    useEffect(() => {
        void loadProfiles()
    }, [loadProfiles])

    useEffect(() => {
        void loadUsage(selectedProfileId)
    }, [loadUsage, selectedProfileId])

    const summary = useMemo(() => {
        const active = profiles.filter((item) => item.is_active).length
        const inactive = profiles.length - active
        return { total: profiles.length, active, inactive }
    }, [profiles])

    const handleDuplicate = async (profileId: string) => {
        const result = await duplicateProductTaxProfileAction(profileId)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Falha ao duplicar perfil.')
            return
        }
        toast.success('Perfil tributario duplicado.')
        setSelectedProfileId(result.data.taxProfileId)
        await loadProfiles()
    }

    const handleToggle = async (profileId: string, nextState: boolean) => {
        const result = await toggleProductTaxProfileStatusAction(profileId, nextState)
        if (!result.success) {
            toast.error(result.error || 'Falha ao atualizar status do perfil.')
            return
        }
        toast.success(nextState ? 'Perfil ativado.' : 'Perfil inativado.')
        await loadProfiles()
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">Perfis Tributarios</h1>
                    <p className="text-muted-foreground mt-1">
                        Centralize regras fiscais de produto para preparar emissao de NF-e com baixo retrabalho.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void loadProfiles()}>
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        Atualizar
                    </Button>
                    <Button asChild className="gradient-navy border-0 text-white">
                        <Link href="/admin/product-tax-profiles/novo">
                            <Plus className="h-4 w-4 mr-1.5" />
                            Novo Perfil
                        </Link>
                    </Button>
                </div>
            </div>

            <ProductTaxProfileSummary total={summary.total} active={summary.active} inactive={summary.inactive} />

            <div className="relative max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome, codigo ou NCM..."
                    className="pl-9"
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
                <ProductTaxProfileList
                    profiles={profiles}
                    selectedId={selectedProfileId}
                    loading={loading}
                    onSelect={setSelectedProfileId}
                    onEdit={(profileId) => router.push(`/admin/product-tax-profiles/${profileId}/editar`)}
                    onDuplicate={(profileId) => void handleDuplicate(profileId)}
                    onToggle={(profileId, nextState) => void handleToggle(profileId, nextState)}
                />

                <TaxProfileUsagePanel loading={usageLoading} usage={usage} />
            </div>
        </div>
    )
}
