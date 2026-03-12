'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, CheckSquare, Square, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getProductVariantConfig, type FabricConfigGroup } from '@/app/admin/actions/variants'

interface ProductFabricConfigProps {
    productId: string | undefined
    onChange: (activeVariantIds: string[]) => void
}

export function ProductFabricConfig({ productId, onChange }: ProductFabricConfigProps) {
    const [groups, setGroups] = useState<FabricConfigGroup[]>([])
    const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
    const [expandedFabrics, setExpandedFabrics] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)

    // Keep onChange in a ref so it never triggers unnecessary re-runs
    const onChangeRef = useRef(onChange)
    useEffect(() => { onChangeRef.current = onChange }, [onChange])

    // Sync activeIds to parent onChange safely AFTER rendering
    useEffect(() => {
        // Only notify if we have data (avoid initial empty set call)
        if (groups.length > 0) {
            onChangeRef.current(Array.from(activeIds))
        }
    }, [activeIds, groups.length])

    const loadConfig = useCallback(async (id: string) => {
        setLoading(true)
        const { data } = await getProductVariantConfig(id)
        if (data) {
            setGroups(data)
            const initial = new Set<string>()
            data.forEach(g => g.colors.forEach(c => { if (c.isActive) initial.add(c.variantId) }))
            setActiveIds(initial)
            setExpandedFabrics(new Set(data.map(g => g.fabric.id)))
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        if (productId) {
            loadConfig(productId)
        }
    }, [productId, loadConfig])

    const toggleVariant = (variantId: string) => {
        setActiveIds(prev => {
            const next = new Set(prev)
            if (next.has(variantId)) next.delete(variantId)
            else next.add(variantId)
            return next
        })
    }

    const toggleFabric = (group: FabricConfigGroup, activate: boolean) => {
        setActiveIds(prev => {
            const next = new Set(prev)
            group.colors.forEach(c => {
                if (activate) next.add(c.variantId)
                else next.delete(c.variantId)
            })
            return next
        })
    }

    const toggleAll = (activate: boolean) => {
        setActiveIds(() => {
            const next = new Set<string>()
            if (activate) {
                groups.forEach(g => g.colors.forEach(c => next.add(c.variantId)))
            }
            return next
        })
    }

    const toggleExpand = (fabricId: string) => {
        setExpandedFabrics(prev => {
            const next = new Set(prev)
            if (next.has(fabricId)) next.delete(fabricId)
            else next.add(fabricId)
            return next
        })
    }

    if (!productId) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Minus className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                    Salve o produto primeiro para configurar quais tecidos e cores estarão disponíveis.
                </p>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (groups.length === 0) {
        return (
            <div className="text-center py-12 text-sm text-muted-foreground">
                Nenhum tecido ou cor encontrado. Cadastre tecidos e cores primeiro.
            </div>
        )
    }

    const totalVariants = groups.reduce((acc, g) => acc + g.colors.length, 0)
    const totalActive = activeIds.size
    const allActive = totalActive === totalVariants
    const noneActive = totalActive === 0

    return (
        <div className="space-y-3">
            {/* Global Header */}
            <div className="flex items-center justify-between pb-2 border-b">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Disponibilidade
                    </span>
                    <Badge variant={totalActive === 0 ? 'destructive' : 'secondary'} className="text-xs h-5">
                        {totalActive}/{totalVariants} ativos
                    </Badge>
                </div>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleAll(true)}
                        disabled={allActive}
                    >
                        Ativar Todos
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => toggleAll(false)}
                        disabled={noneActive}
                    >
                        Desativar Todos
                    </Button>
                </div>
            </div>

            {/* Fabric Groups */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {groups.map(group => {
                    const fabricActive = group.colors.filter(c => activeIds.has(c.variantId)).length
                    const fabricTotal = group.colors.length
                    const isExpanded = expandedFabrics.has(group.fabric.id)
                    const allFabricActive = fabricActive === fabricTotal
                    const noneFabricActive = fabricActive === 0

                    return (
                        <div key={group.fabric.id} className="border rounded-xl overflow-hidden bg-white/50">
                            {/* Fabric Header Row */}
                            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                                onClick={() => toggleExpand(group.fabric.id)}
                            >
                                <span className="text-muted-foreground">
                                    {isExpanded
                                        ? <ChevronDown className="h-4 w-4" />
                                        : <ChevronRight className="h-4 w-4" />
                                    }
                                </span>

                                {/* Fabric swatch */}
                                {group.fabric.image_url ? (
                                    <div
                                        className="h-6 w-6 rounded-md border border-black/10 shrink-0 bg-center bg-cover"
                                        style={{ backgroundImage: `url(${group.fabric.image_url})` }}
                                    />
                                ) : (
                                    <div className="h-6 w-6 rounded-md border border-black/10 bg-muted shrink-0" />
                                )}

                                <span className="flex-1 text-sm font-medium">{group.fabric.name}</span>

                                <Badge
                                    variant={noneFabricActive ? 'destructive' : allFabricActive ? 'default' : 'secondary'}
                                    className="text-[10px] h-5 shrink-0"
                                >
                                    {fabricActive}/{fabricTotal}
                                </Badge>

                                {/* Per-fabric quick-toggle buttons */}
                                <div className="flex gap-1 ml-1" onClick={e => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        title="Ativar todas as cores"
                                        disabled={allFabricActive}
                                        onClick={() => toggleFabric(group, true)}
                                        className="p-1 rounded hover:bg-green-100 text-green-600 disabled:opacity-30 transition-colors"
                                    >
                                        <CheckSquare className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        title="Desativar todas as cores"
                                        disabled={noneFabricActive}
                                        onClick={() => toggleFabric(group, false)}
                                        className="p-1 rounded hover:bg-red-100 text-red-500 disabled:opacity-30 transition-colors"
                                    >
                                        <Square className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Color Chips */}
                            {isExpanded && (
                                <div className="px-3 pb-3 pt-1 flex flex-wrap gap-2 border-t bg-muted/10">
                                    {group.colors.map(color => {
                                        const active = activeIds.has(color.variantId)
                                        return (
                                            <button
                                                key={color.variantId}
                                                type="button"
                                                onClick={() => toggleVariant(color.variantId)}
                                                title={active ? `Desativar: ${color.name}` : `Ativar: ${color.name}`}
                                                className={`
                                                    flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium
                                                    transition-all duration-150 select-none
                                                    ${active
                                                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                                        : 'border-border bg-white text-muted-foreground opacity-50 hover:opacity-80'
                                                    }
                                                `}
                                            >
                                                {/* Color swatch dot */}
                                                <span
                                                    className="h-3.5 w-3.5 rounded-full border border-black/10 shrink-0"
                                                    style={{
                                                        backgroundColor: color.hex_code || '#e5e7eb',
                                                        ...(color.image_url ? {
                                                            backgroundImage: `url(${color.image_url})`,
                                                            backgroundSize: 'cover',
                                                        } : {})
                                                    }}
                                                />
                                                {color.name}
                                                {active && (
                                                    <span className="ml-0.5 text-primary">✓</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
