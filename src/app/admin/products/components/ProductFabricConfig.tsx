'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, CheckSquare, Square, Minus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getProductVariantConfig, type FabricConfigGroup } from '@/app/admin/actions/variants'

interface ProductFabricConfigProps {
    productId: string | undefined
    onChange: (payload: {
        activeVariantIds: string[]
        priceOverrides: Record<string, number | null>
        skuOverrides: Record<string, string | null>
        priceTouched: boolean
        skuTouched: boolean
    }) => void
}

export function ProductFabricConfig({ productId, onChange }: ProductFabricConfigProps) {
    const [groups, setGroups] = useState<FabricConfigGroup[]>([])
    const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
    const [expandedFabrics, setExpandedFabrics] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
    const [skuInputs, setSkuInputs] = useState<Record<string, string>>({})
    const hasUserInteractedRef = useRef(false)

    // Keep onChange in a ref so it never triggers unnecessary re-runs
    const onChangeRef = useRef(onChange)
    useEffect(() => {
        onChangeRef.current = onChange
    }, [onChange])

    const parsePrice = (val: string) => {
        if (!val || val.trim() === '') return null
        const parsed = parseFloat(val.replace(',', '.'))
        if (Number.isNaN(parsed)) return null
        return parsed < 0 ? null : parsed
    }

    // Sync activeIds and prices to parent onChange safely AFTER rendering
    useEffect(() => {
        // Only notify if we have data (avoid initial empty set call)
        if (groups.length > 0 && hasUserInteractedRef.current) {
            const priceOverrides: Record<string, number | null> = {}
            Object.entries(priceInputs).forEach(([variantId, value]) => {
                priceOverrides[variantId] = parsePrice(value)
            })

            const skuOverrides: Record<string, string | null> = {}
            Object.entries(skuInputs).forEach(([variantId, value]) => {
                const normalized = value.trim()
                skuOverrides[variantId] = normalized.length > 0 ? normalized : null
            })

            onChangeRef.current({
                activeVariantIds: Array.from(activeIds),
                priceOverrides,
                skuOverrides,
                priceTouched: false,
                skuTouched: false,
            })
        }
    }, [activeIds, priceInputs, skuInputs, groups.length])

    const loadConfig = useCallback(async (id: string) => {
        setLoading(true)
        setLoadError(null)

        const result = await getProductVariantConfig(id)
        if (result.error) {
            setLoadError(result.error)
            setGroups([])
            setActiveIds(new Set())
            setExpandedFabrics(new Set())
            setPriceInputs({})
            setSkuInputs({})
            setLoading(false)
            return
        }

        if (result.data) {
            hasUserInteractedRef.current = false
            setGroups(result.data)

            const initialActiveIds = new Set<string>()
            const initialPrices: Record<string, string> = {}
            const initialSkus: Record<string, string> = {}

            result.data.forEach((group) => {
                group.colors.forEach((color) => {
                    if (color.isActive) initialActiveIds.add(color.variantId)
                    initialPrices[color.variantId] =
                        color.price_override !== null && color.price_override !== undefined
                            ? color.price_override.toString()
                            : ''
                    initialSkus[color.variantId] = color.sku || ''
                })
            })

            setActiveIds(initialActiveIds)
            setExpandedFabrics(new Set(result.data.map((group) => group.fabric.id)))
            setPriceInputs(initialPrices)
            setSkuInputs(initialSkus)
        }

        setLoading(false)
    }, [])

    useEffect(() => {
        if (productId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void loadConfig(productId)
        }
    }, [productId, loadConfig])

    const toggleVariant = (variantId: string) => {
        hasUserInteractedRef.current = true
        setActiveIds((prev) => {
            const next = new Set(prev)
            if (next.has(variantId)) next.delete(variantId)
            else next.add(variantId)
            return next
        })
    }

    const toggleFabric = (group: FabricConfigGroup, activate: boolean) => {
        hasUserInteractedRef.current = true
        setActiveIds((prev) => {
            const next = new Set(prev)
            group.colors.forEach((color) => {
                if (activate) next.add(color.variantId)
                else next.delete(color.variantId)
            })
            return next
        })
    }

    const toggleAll = (activate: boolean) => {
        hasUserInteractedRef.current = true
        setActiveIds(() => {
            const next = new Set<string>()
            if (activate) {
                groups.forEach((group) => group.colors.forEach((color) => next.add(color.variantId)))
            }
            return next
        })
    }

    const toggleExpand = (fabricId: string) => {
        setExpandedFabrics((prev) => {
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
                    Salve o produto primeiro para configurar quais tecidos e cores estarao disponiveis.
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

    if (loadError) {
        return (
            <div className="text-center py-12 text-sm space-y-2">
                <p className="text-destructive">Falha ao carregar tecidos e cores.</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadConfig(productId)}>
                    Tentar novamente
                </Button>
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

    const totalVariants = groups.reduce((acc, group) => acc + group.colors.length, 0)
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
                {groups.map((group) => {
                    const fabricActive = group.colors.filter((color) => activeIds.has(color.variantId)).length
                    const fabricTotal = group.colors.length
                    const isExpanded = expandedFabrics.has(group.fabric.id)
                    const allFabricActive = fabricActive === fabricTotal
                    const noneFabricActive = fabricActive === 0

                    return (
                        <div key={group.fabric.id} className="border rounded-xl overflow-hidden bg-white/50">
                            {/* Fabric Header Row */}
                            <div
                                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                                onClick={() => toggleExpand(group.fabric.id)}
                            >
                                <span className="text-muted-foreground">
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
                                <div className="flex gap-1 ml-1" onClick={(event) => event.stopPropagation()}>
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

                            {/* Color + Price */}
                            {isExpanded && (
                                <div className="px-3 pb-3 pt-3 flex flex-col gap-2 border-t bg-muted/10">
                                    {group.colors.map((color) => {
                                        const active = activeIds.has(color.variantId)
                                        return (
                                            <div
                                                key={color.variantId}
                                                className={`flex items-center gap-3 rounded-lg border p-2 transition-colors ${
                                                    active ? 'border-primary/40 bg-primary/5' : 'border-border bg-white/70'
                                                }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleVariant(color.variantId)}
                                                    title={active ? `Desativar: ${color.name}` : `Ativar: ${color.name}`}
                                                    className="flex items-center gap-2 min-w-0"
                                                >
                                                    <span
                                                        className="h-6 w-6 rounded-full border border-black/10 shrink-0"
                                                        style={{
                                                            backgroundColor: color.hex_code || '#e5e7eb',
                                                            ...(color.image_url
                                                                ? {
                                                                      backgroundImage: `url(${color.image_url})`,
                                                                      backgroundSize: 'cover',
                                                                  }
                                                                : {}),
                                                        }}
                                                    />
                                                    <span
                                                        className={`text-xs font-medium truncate ${
                                                            active ? 'text-foreground' : 'text-muted-foreground'
                                                        }`}
                                                    >
                                                        {color.name}
                                                    </span>
                                                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                                                </button>

                                                <div className="ml-auto flex items-center gap-2">
                                                    <span className="text-[11px] text-muted-foreground">SKU</span>
                                                    <Input
                                                        value={skuInputs[color.variantId] || ''}
                                                        onChange={(event) => {
                                                            hasUserInteractedRef.current = true
                                                            const value = event.target.value.toUpperCase()
                                                            setSkuInputs((prev) => ({ ...prev, [color.variantId]: value }))
                                                            onChangeRef.current({
                                                                activeVariantIds: Array.from(activeIds),
                                                                priceOverrides: Object.fromEntries(
                                                                    Object.entries(priceInputs).map(([variantId, inputValue]) => [
                                                                        variantId,
                                                                        parsePrice(inputValue),
                                                                    ])
                                                                ),
                                                                skuOverrides: {
                                                                    ...Object.fromEntries(
                                                                        Object.entries(skuInputs).map(([variantId, inputValue]) => [
                                                                            variantId,
                                                                            inputValue.trim() || null,
                                                                        ])
                                                                    ),
                                                                    [color.variantId]: value.trim() || null,
                                                                },
                                                                priceTouched: false,
                                                                skuTouched: true,
                                                            })
                                                        }}
                                                        placeholder="Opcional"
                                                        className="h-7 w-36 text-xs uppercase"
                                                        maxLength={60}
                                                    />
                                                    <span className="text-[11px] text-muted-foreground">R$</span>
                                                    <Input
                                                        value={priceInputs[color.variantId] || ''}
                                                        onChange={(event) => {
                                                            hasUserInteractedRef.current = true
                                                            const value = event.target.value
                                                            setPriceInputs((prev) => ({ ...prev, [color.variantId]: value }))
                                                            onChangeRef.current({
                                                                activeVariantIds: Array.from(activeIds),
                                                                priceOverrides: {
                                                                    ...Object.fromEntries(
                                                                        Object.entries(priceInputs).map(([variantId, inputValue]) => [
                                                                            variantId,
                                                                            parsePrice(inputValue),
                                                                        ])
                                                                    ),
                                                                    [color.variantId]: parsePrice(value),
                                                                },
                                                                skuOverrides: Object.fromEntries(
                                                                    Object.entries(skuInputs).map(([variantId, inputValue]) => [
                                                                        variantId,
                                                                        inputValue.trim() || null,
                                                                    ])
                                                                ),
                                                                priceTouched: true,
                                                                skuTouched: false,
                                                            })
                                                        }}
                                                        placeholder="Padrao"
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="h-7 w-28 text-xs tabular-nums"
                                                    />
                                                </div>
                                            </div>
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
