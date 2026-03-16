import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, Download, Loader2, Save, Search, Tag, Upload, X } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PriceTable, PriceTableItem, ProductVariant } from '@/lib/types'
import { calculateProductPrice } from '@/lib/pricing/calculate-product-price'

interface PriceTableItemsDrawerProps {
    table: PriceTable | null
    isOpen: boolean
    onClose: () => void
}

type VariantWithRelations = ProductVariant & {
    product: {
        id: string
        name: string
        base_price: number
        has_size_variants?: boolean
        size?: string | null
    }
    fabric: { name: string; price_modifier: number }
    fabric_color: { name: string }
}

type FilterMode = 'all' | 'overrides' | 'no-override' | 'size-aware'

const FILTER_OPTIONS: Array<{ key: FilterMode; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'overrides', label: 'Com excecao' },
    { key: 'no-override', label: 'Sem excecao' },
    { key: 'size-aware', label: 'Com tamanhos' },
]

type ProductSizeMeta = {
    hasSizeVariants: boolean
    activeSizeOptions: number
    hasAbsoluteSizePrice: boolean
    legacySizeLabel: string | null
}

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

function isMissingSizeTableError(error: unknown) {
    const message = getErrorMessage(error, '').toLowerCase()
    return message.includes('product_size_options') && message.includes('does not exist')
}

export function PriceTableItemsDrawer({ table, isOpen, onClose }: PriceTableItemsDrawerProps) {
    const [variants, setVariants] = useState<VariantWithRelations[]>([])
    const [tableItems, setTableItems] = useState<Record<string, PriceTableItem>>({})
    const [productSizeMetaMap, setProductSizeMetaMap] = useState<Record<string, ProductSizeMeta>>({})
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [savingAll, setSavingAll] = useState(false)
    const [filterMode, setFilterMode] = useState<FilterMode>('all')
    const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})
    const fileInputRef = useRef<HTMLInputElement>(null)

    const loadData = useCallback(async () => {
        if (!table) return
        setLoading(true)
        const supabase = createClient()

        try {
            const { data: variantsData, error: variantsError } = await supabase
                .from('product_variants')
                .select(`
                    *,
                    product:products(id, name, base_price, has_size_variants, size),
                    fabric:fabrics(name, price_modifier),
                    fabric_color:fabric_colors!product_variants_fabric_color_fk(name)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false })

            if (variantsError) throw variantsError

            const { data: tableItemsData, error: tableItemsError } = await supabase
                .from('price_table_items')
                .select('*')
                .eq('price_table_id', table.id)
            if (tableItemsError) throw tableItemsError

            const castVariants = (variantsData as VariantWithRelations[]) || []
            const itemsMap: Record<string, PriceTableItem> = {}
            const inputsMap: Record<string, string> = {}
            tableItemsData?.forEach((item) => {
                itemsMap[item.product_variant_id] = item
                inputsMap[item.product_variant_id] = item.custom_price.toString()
            })

            const sizeMetaMap: Record<string, ProductSizeMeta> = {}
            castVariants.forEach((variant) => {
                sizeMetaMap[variant.product.id] = {
                    hasSizeVariants: Boolean(variant.product.has_size_variants),
                    activeSizeOptions: 0,
                    hasAbsoluteSizePrice: false,
                    legacySizeLabel: variant.product.size || null,
                }
            })

            const productIds = Array.from(new Set(castVariants.map((variant) => variant.product.id)))
            if (productIds.length > 0) {
                const { data: sizeRows, error: sizeError } = await supabase
                    .from('product_size_options')
                    .select('product_id, is_active, price_mode')
                    .in('product_id', productIds)

                if (sizeError && !isMissingSizeTableError(sizeError)) throw sizeError
                sizeRows?.forEach((row) => {
                    const previous = sizeMetaMap[row.product_id]
                    if (!previous) return
                    sizeMetaMap[row.product_id] = {
                        ...previous,
                        activeSizeOptions: previous.activeSizeOptions + (row.is_active ? 1 : 0),
                        hasAbsoluteSizePrice: previous.hasAbsoluteSizePrice || row.price_mode === 'absolute',
                    }
                })
            }

            setVariants(castVariants)
            setTableItems(itemsMap)
            setPriceInputs(inputsMap)
            setProductSizeMetaMap(sizeMetaMap)
        } catch (error: unknown) {
            console.error(error)
            toast.error(getErrorMessage(error, 'Erro ao carregar os itens desta tabela.'))
        } finally {
            setLoading(false)
        }
    }, [table])

    useEffect(() => {
        if (isOpen && table) {
            void loadData()
            return
        }

        setSearch('')
        setVariants([])
        setTableItems({})
        setProductSizeMetaMap({})
        setPriceInputs({})
        setFilterMode('all')
    }, [isOpen, table, loadData])

    const filteredVariants = useMemo(() => {
        let list = variants
        if (search) {
            const query = search.toLowerCase()
            list = list.filter((variant) => {
                const sizeMeta = productSizeMetaMap[variant.product.id]
                return (
                    variant.product.name.toLowerCase().includes(query) ||
                    variant.fabric.name.toLowerCase().includes(query) ||
                    variant.fabric_color.name.toLowerCase().includes(query) ||
                    (sizeMeta?.legacySizeLabel || '').toLowerCase().includes(query)
                )
            })
        }

        if (filterMode === 'overrides') list = list.filter((variant) => Boolean(tableItems[variant.id]))
        if (filterMode === 'no-override') list = list.filter((variant) => !tableItems[variant.id])
        if (filterMode === 'size-aware') {
            list = list.filter((variant) => Boolean(productSizeMetaMap[variant.product.id]?.hasSizeVariants))
        }
        return list
    }, [filterMode, productSizeMetaMap, search, tableItems, variants])

    const stats = useMemo(() => {
        const withOverride = variants.filter((variant) => Boolean(tableItems[variant.id])).length
        const sizeAware = variants.filter((variant) => productSizeMetaMap[variant.product.id]?.hasSizeVariants).length
        const dirtyCount = variants.filter((variant) => {
            const existing = tableItems[variant.id]
            const input = priceInputs[variant.id]
            if (!existing && input) return true
            if (existing && input !== existing.custom_price.toString()) return true
            if (existing && (!input || input.trim() === '')) return true
            return false
        }).length
        return { total: variants.length, withOverride, sizeAware, dirtyCount }
    }, [priceInputs, productSizeMetaMap, tableItems, variants])

    const handleExportCSV = () => {
        if (!variants.length) {
            toast.error('Nenhum produto encontrado na base de dados.')
            return
        }

        const headers = [
            'ID Variante',
            'Produto',
            'Tecido/Cor',
            'Contexto de tamanho',
            'Preco fixo customizado',
            'Preco de referencia',
        ]
        let csvContent = `${headers.join(';')}\n`

        variants.forEach((variant) => {
            const sizeMeta = productSizeMetaMap[variant.product.id]
            const sizeContext = sizeMeta?.hasSizeVariants
                ? `${sizeMeta.activeSizeOptions} tamanhos`
                : sizeMeta?.legacySizeLabel || 'Sem tamanho'
            const standardTablePrice = calculateProductPrice({
                basePrice: variant.product.base_price,
                fabricModifier: variant.fabric.price_modifier,
                variantPriceOverride: variant.price_override,
                priceTable: { discountPercentage: table ? table.discount_percentage : 0, overrides: {} },
            }).finalPrice
            const rawPrice = priceInputs[variant.id] || ''

            const row = [
                variant.id,
                `"${variant.product.name}"`,
                `"${variant.fabric.name} / ${variant.fabric_color.name}"`,
                `"${sizeContext}"`,
                rawPrice.toString().replace('.', ','),
                standardTablePrice.toFixed(2).replace('.', ','),
            ]

            csvContent += `${row.join(';')}\n`
        })

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `tabela_precos_${table?.name}_${new Date().toISOString().split('T')[0]}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success('Planilha exportada com sucesso.')
    }

    const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (loadEvent) => {
            try {
                const text = (loadEvent.target?.result as string) || ''
                const lines = text.split('\n')
                if (lines.length < 2) throw new Error('Planilha vazia ou em formato incorreto')

                const newPrices: Record<string, string> = {}
                let countChanges = 0

                for (let index = 1; index < lines.length; index += 1) {
                    const row = lines[index].split(';')
                    if (row.length < 5) continue

                    const variantId = row[0].replace(/"/g, '').trim()
                    const customPriceStr = row[4].replace(/"/g, '').trim()

                    if (variantId.length >= 32) {
                        if (customPriceStr !== '') {
                            newPrices[variantId] = customPriceStr.replace(',', '.')
                            countChanges += 1
                        } else {
                            newPrices[variantId] = ''
                        }
                    }
                }

                setPriceInputs((previous) => ({ ...previous, ...newPrices }))
                toast.success(`Planilha lida. ${countChanges} preco(s) preparado(s) para salvar.`)
            } catch (error) {
                console.error(error)
                toast.error('Arquivo CSV invalido. Use o modelo exportado pelo sistema.')
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
        }
        reader.readAsText(file)
    }

    const saveItem = async (variantId: string, options?: { silent?: boolean }) => {
        if (!table) return
        if (!options?.silent) {
            setSavingId(variantId)
        }
        const supabase = createClient()
        const rawValue = priceInputs[variantId]

        try {
            if (!rawValue || rawValue.trim() === '') {
                const existingItem = tableItems[variantId]
                if (existingItem) {
                    const { error } = await supabase.from('price_table_items').delete().eq('id', existingItem.id)
                    if (error) throw error
                    setTableItems((previous) => {
                        const next = { ...previous }
                        delete next[variantId]
                        return next
                    })
                }
                if (!options?.silent) {
                    toast.success('Excecao atualizada.')
                }
                return
            }

            const customPrice = Number.parseFloat(rawValue.replace(',', '.'))
            if (Number.isNaN(customPrice) || customPrice < 0) {
                toast.error('Preco invalido.')
                return
            }

            const existingItem = tableItems[variantId]
            const payload = { price_table_id: table.id, product_variant_id: variantId, custom_price: customPrice }
            const query = existingItem
                ? supabase.from('price_table_items').update({ custom_price: customPrice }).eq('id', existingItem.id)
                : supabase.from('price_table_items').insert(payload)
            const { data, error } = await query.select().single()
            if (error) throw error
            setTableItems((previous) => ({ ...previous, [variantId]: data }))
            if (!options?.silent) {
                toast.success('Preco salvo.')
            }
        } catch (error: unknown) {
            if (!options?.silent) {
                toast.error(getErrorMessage(error, 'Erro ao salvar o item.'))
            }
            throw error
        } finally {
            if (!options?.silent) {
                setSavingId(null)
            }
        }
    }

    const saveAll = async () => {
        setSavingAll(true)
        let savedCount = 0
        let errorCount = 0
        for (const variant of variants) {
            const existingItem = tableItems[variant.id]
            const input = priceInputs[variant.id]
            if (!existingItem && (!input || input.trim() === '')) continue
            if (existingItem && input === existingItem.custom_price.toString()) continue
            try {
                await saveItem(variant.id, { silent: true })
                savedCount += 1
            } catch {
                errorCount += 1
            }
        }
        setSavingAll(false)
        if (errorCount > 0) {
            toast.error(`${errorCount} item(ns) falharam ao salvar.`)
            return
        }
        toast.success(`${savedCount} alteracao(oes) salvas com sucesso.`)
    }

    const calcReferencePrice = (variant: VariantWithRelations) =>
        calculateProductPrice({
            basePrice: variant.product.base_price,
            fabricModifier: variant.fabric.price_modifier,
            variantPriceOverride: variant.price_override,
            priceTable: { discountPercentage: table ? table.discount_percentage : 0, overrides: {} },
        }).finalPrice

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent
                side="right"
                className="flex h-full w-full flex-col gap-0 bg-slate-50/40 p-0 sm:max-w-2xl md:max-w-4xl lg:max-w-[72vw]"
            >
                <div className="border-b border-slate-200/80 bg-white/95 px-5 pb-4 pt-5 backdrop-blur">
                    <SheetHeader className="space-y-1 p-0">
                        <SheetTitle className="flex items-center gap-2 text-base font-heading text-navy md:text-lg">
                            <Tag className="h-4 w-4 text-bronze" />
                            Excecoes de preco: {table?.name}
                        </SheetTitle>
                        <SheetDescription className="text-[11px] leading-relaxed text-muted-foreground md:text-xs">
                            Camadas ativas: Cor - Tamanho - Tabela - Base. Produtos com tamanhos resolvem preco
                            final no checkout.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[220px] flex-1">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Buscar produto, tecido, cor ou tamanho..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                className="h-8 bg-white pl-8 pr-8 text-xs md:text-sm"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {FILTER_OPTIONS.map((filter) => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setFilterMode(filter.key)}
                                className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors md:text-xs ${
                                    filterMode === filter.key
                                        ? 'border-navy bg-navy text-white'
                                        : 'border-slate-200 bg-white text-muted-foreground hover:border-slate-300'
                                }`}
                            >
                                {filter.label}
                            </button>
                        ))}

                        <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleImportCSV}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 bg-white px-3 text-[11px] md:text-xs"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-3.5 w-3.5" />
                            Importar
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 bg-white px-3 text-[11px] md:text-xs"
                            onClick={handleExportCSV}
                        >
                            <Download className="h-3.5 w-3.5" />
                            Exportar
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Loader2 className="mb-3 h-7 w-7 animate-spin" />
                            <p className="text-sm">Carregando variacoes do catalogo...</p>
                        </div>
                    ) : filteredVariants.length === 0 ? (
                        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                            Nenhuma variacao encontrada para os filtros aplicados.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 border-b bg-slate-100/95 backdrop-blur">
                                <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                    <th className="px-4 py-2.5 text-left font-medium">Produto</th>
                                    <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">
                                        Tecido
                                    </th>
                                    <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Cor</th>
                                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                                        Preco referencia
                                    </th>
                                    <th className="min-w-[170px] whitespace-nowrap px-3 py-2.5 text-center font-medium">
                                        Preco fixo (R$)
                                    </th>
                                    <th className="w-[52px] px-3 py-2.5 text-center font-medium" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white/70">
                                {filteredVariants.map((variant) => {
                                    const hasOverride = Boolean(tableItems[variant.id])
                                    const isSavingThis = savingId === variant.id
                                    const sizeMeta = productSizeMetaMap[variant.product.id]

                                    return (
                                        <tr
                                            key={variant.id}
                                            className={`group transition-colors hover:bg-slate-50 ${
                                                hasOverride ? 'bg-amber-50/35' : ''
                                            }`}
                                        >
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="max-w-[220px] truncate font-medium text-navy lg:max-w-[290px]">
                                                        {variant.product.name}
                                                    </span>
                                                    {hasOverride && (
                                                        <Badge className="shrink-0 border-0 bg-bronze/15 px-1.5 py-0 text-[10px] text-bronze">
                                                            Fixo
                                                        </Badge>
                                                    )}
                                                    {sizeMeta?.hasSizeVariants && (
                                                        <Badge className="shrink-0 border border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] text-blue-700">
                                                            {sizeMeta.activeSizeOptions} tamanhos
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
                                                    {variant.fabric.name} - {variant.fabric_color.name}
                                                    {sizeMeta?.legacySizeLabel
                                                        ? ` - ${sizeMeta.legacySizeLabel}`
                                                        : ''}
                                                </div>
                                            </td>
                                            <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                                                {variant.fabric.name}
                                            </td>
                                            <td className="hidden px-3 py-2.5 text-muted-foreground lg:table-cell">
                                                {variant.fabric_color.name}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                                R${' '}
                                                {calcReferencePrice(variant).toLocaleString('pt-BR', {
                                                    minimumFractionDigits: 2,
                                                })}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <Input
                                                    value={priceInputs[variant.id] || ''}
                                                    onChange={(event) =>
                                                        setPriceInputs((previous) => ({
                                                            ...previous,
                                                            [variant.id]: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="--"
                                                    type="number"
                                                    step="0.01"
                                                    className={`h-8 border-slate-200 text-sm tabular-nums ${
                                                        hasOverride
                                                            ? 'border-bronze/30 font-semibold text-bronze focus-visible:ring-bronze'
                                                            : ''
                                                    }`}
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => void saveItem(variant.id)}
                                                    disabled={isSavingThis}
                                                    className={`h-8 w-8 ${
                                                        hasOverride
                                                            ? 'text-bronze hover:bg-bronze/10 hover:text-bronze'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    {isSavingThis ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Save className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <SheetFooter className="flex-row items-center justify-between gap-4 border-t border-slate-200/80 bg-white/95 px-5 py-3">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground md:text-xs">
                        <span>
                            <strong className="text-foreground">{stats.total}</strong> variacoes
                        </span>
                        <span className="h-3 w-px bg-slate-200" />
                        <span>
                            <strong className="text-bronze">{stats.withOverride}</strong> com excecao
                        </span>
                        <span className="h-3 w-px bg-slate-200" />
                        <span>
                            <strong className="text-blue-700">{stats.sizeAware}</strong> com tamanhos
                        </span>
                    </div>
                    <Button
                        onClick={() => void saveAll()}
                        disabled={savingAll || stats.dirtyCount === 0}
                        className="gradient-navy h-9 gap-2 border-0 px-4 text-xs text-white md:px-5 md:text-sm"
                    >
                        {savingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCheck className="h-4 w-4" />
                        )}
                        Salvar tudo {stats.dirtyCount > 0 && `(${stats.dirtyCount})`}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
