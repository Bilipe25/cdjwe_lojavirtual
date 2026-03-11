import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Loader2, Save, Tag, Download, Upload, CheckCheck, Filter, X, ChevronDown } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PriceTable, PriceTableItem, ProductVariant } from '@/lib/types'

interface PriceTableItemsDrawerProps {
    table: PriceTable | null
    isOpen: boolean
    onClose: () => void
}

type VariantWithRelations = ProductVariant & {
    product: { name: string, base_price: number }
    fabric: { name: string, price_modifier: number }
    fabric_color: { name: string }
}

type FilterMode = 'all' | 'overrides' | 'no-override'

export function PriceTableItemsDrawer({ table, isOpen, onClose }: PriceTableItemsDrawerProps) {
    const [variants, setVariants] = useState<VariantWithRelations[]>([])
    const [tableItems, setTableItems] = useState<Record<string, PriceTableItem>>({})

    // UI State
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [savingAll, setSavingAll] = useState(false)
    const [filterMode, setFilterMode] = useState<FilterMode>('all')

    // Local price inputs keyed by variant_id
    const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})

    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen && table) {
            loadData()
        } else {
            setSearch('')
            setVariants([])
            setTableItems({})
            setPriceInputs({})
            setFilterMode('all')
        }
    }, [isOpen, table])

    const loadData = async () => {
        if (!table) return
        setLoading(true)
        const supabase = createClient()

        try {
            const { data: vData, error: vError } = await supabase
                .from('product_variants')
                .select(`
                    *,
                    product:products(name, base_price),
                    fabric:fabrics(name, price_modifier),
                    fabric_color:fabric_colors(name)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false })

            if (vError) throw vError

            const { data: tData, error: tError } = await supabase
                .from('price_table_items')
                .select('*')
                .eq('price_table_id', table.id)

            if (tError) throw tError

            const itemsMap: Record<string, PriceTableItem> = {}
            const inputsMap: Record<string, string> = {}

            tData?.forEach(item => {
                itemsMap[item.product_variant_id] = item
                inputsMap[item.product_variant_id] = item.custom_price.toString()
            })

            setVariants(vData as unknown as VariantWithRelations[])
            setTableItems(itemsMap)
            setPriceInputs(inputsMap)
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao carregar os itens desta tabela.')
        } finally {
            setLoading(false)
        }
    }

    // --- Computed Data ---
    const filteredVariants = useMemo(() => {
        let list = variants

        // Search filter
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(v =>
                v.product.name.toLowerCase().includes(q) ||
                v.fabric.name.toLowerCase().includes(q) ||
                v.fabric_color.name.toLowerCase().includes(q)
            )
        }

        // Override filter
        if (filterMode === 'overrides') {
            list = list.filter(v => !!tableItems[v.id])
        } else if (filterMode === 'no-override') {
            list = list.filter(v => !tableItems[v.id])
        }

        return list
    }, [variants, search, filterMode, tableItems])

    const stats = useMemo(() => {
        const total = variants.length
        const withOverride = variants.filter(v => !!tableItems[v.id]).length
        const dirtyCount = variants.filter(v => {
            const existing = tableItems[v.id]
            const input = priceInputs[v.id]
            if (!existing && input) return true
            if (existing && input !== existing.custom_price.toString()) return true
            if (existing && (!input || input.trim() === '')) return true
            return false
        }).length
        return { total, withOverride, dirtyCount }
    }, [variants, tableItems, priceInputs])

    // --- CSV Export/Import ---
    const handleExportCSV = () => {
        if (!variants.length) {
            toast.error('Nenhum produto encontrado na base de dados.')
            return
        }

        const headers = ["ID Variante", "Produto", "Tecido/Cor", "Preço Fixo Customizado (Deixe vazio para herdar % global)", "Ref: Preço Visível da Tabela"]
        let csvContent = headers.join(";") + "\n"

        variants.forEach(v => {
            const baseCalc = v.product.base_price + (v.price_override ?? v.fabric.price_modifier)
            const globalDiscount = table ? table.discount_percentage : 0
            const standardTablePrice = baseCalc * (1 - (globalDiscount / 100))
            const rawPrice = priceInputs[v.id] || ''

            const row = [
                v.id,
                `"${v.product.name}"`,
                `"${v.fabric.name} / ${v.fabric_color.name}"`,
                rawPrice.toString().replace('.', ','),
                standardTablePrice.toFixed(2).replace('.', ',')
            ]
            csvContent += row.join(";") + "\n"
        })

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.setAttribute("href", url)
        link.setAttribute("download", `tabela_precos_${table?.name}_${new Date().toISOString().split('T')[0]}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success('Planilha Baixada! Mantenha a coluna ID Variante inalterada.')
    }

    const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string
                const lines = text.split('\n')
                if (lines.length < 2) throw new Error('Planilha vazia ou em formato incorreto')

                const newPrices: Record<string, string> = {}
                let countChanges = 0

                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(';')
                    if (row.length < 4) continue

                    const variantId = row[0].replace(/"/g, '').trim()
                    const customPriceStr = row[3].replace(/"/g, '').trim()

                    if (variantId.length >= 32) {
                        if (customPriceStr !== '') {
                            const normalizedNumber = customPriceStr.replace(',', '.')
                            newPrices[variantId] = normalizedNumber
                            countChanges++
                        } else {
                            newPrices[variantId] = ''
                        }
                    }
                }

                setPriceInputs(prev => ({ ...prev, ...newPrices }))
                toast.success(`Planilha Lida! ${countChanges} preço(s) modificado(s). Clique em "Salvar Tudo" para persistir.`)

            } catch (err) {
                console.error(err)
                toast.error('O Excel importado está incorreto. Use a Planilha baixada pelo sistema como modelo.')
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
        }
        reader.readAsText(file)
    }

    // --- Save Logic ---
    const handlePriceChange = (variantId: string, val: string) => {
        setPriceInputs(prev => ({ ...prev, [variantId]: val }))
    }

    const handleSaveItem = async (variantId: string) => {
        if (!table) return
        setSavingId(variantId)

        const supabase = createClient()
        const rawValue = priceInputs[variantId]

        try {
            if (!rawValue || rawValue.trim() === '') {
                const existingItem = tableItems[variantId]
                if (existingItem) {
                    const { error } = await supabase
                        .from('price_table_items')
                        .delete()
                        .eq('id', existingItem.id)

                    if (error) throw error

                    setTableItems(prev => {
                        const copy = { ...prev }
                        delete copy[variantId]
                        return copy
                    })
                    toast.success('Exceção removida!')
                }
                setSavingId(null)
                return
            }

            const customPrice = parseFloat(rawValue.replace(',', '.'))
            if (isNaN(customPrice) || customPrice < 0) {
                toast.error('Preço inválido')
                setSavingId(null)
                return
            }

            const existingItem = tableItems[variantId]

            if (existingItem) {
                const { error, data } = await supabase
                    .from('price_table_items')
                    .update({ custom_price: customPrice })
                    .eq('id', existingItem.id)
                    .select()
                    .single()

                if (error) throw error
                setTableItems(prev => ({ ...prev, [variantId]: data }))
            } else {
                const { error, data } = await supabase
                    .from('price_table_items')
                    .insert({
                        price_table_id: table.id,
                        product_variant_id: variantId,
                        custom_price: customPrice
                    })
                    .select()
                    .single()

                if (error) throw error
                setTableItems(prev => ({ ...prev, [variantId]: data }))
            }

            toast.success('Preço salvo!')
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao salvar o item.')
        } finally {
            setSavingId(null)
        }
    }

    const handleSaveAll = async () => {
        if (!table) return
        setSavingAll(true)

        const supabase = createClient()
        let saved = 0
        let errors = 0

        for (const variant of variants) {
            const rawValue = priceInputs[variant.id]
            const existingItem = tableItems[variant.id]

            // Check if dirty
            if (!existingItem && (!rawValue || rawValue.trim() === '')) continue
            if (existingItem && rawValue === existingItem.custom_price.toString()) continue

            try {
                if (!rawValue || rawValue.trim() === '') {
                    if (existingItem) {
                        const { error } = await supabase
                            .from('price_table_items')
                            .delete()
                            .eq('id', existingItem.id)
                        if (error) throw error
                        setTableItems(prev => {
                            const copy = { ...prev }
                            delete copy[variant.id]
                            return copy
                        })
                        saved++
                    }
                    continue
                }

                const customPrice = parseFloat(rawValue.replace(',', '.'))
                if (isNaN(customPrice) || customPrice < 0) continue

                if (existingItem) {
                    const { error, data } = await supabase
                        .from('price_table_items')
                        .update({ custom_price: customPrice })
                        .eq('id', existingItem.id)
                        .select()
                        .single()
                    if (error) throw error
                    setTableItems(prev => ({ ...prev, [variant.id]: data }))
                } else {
                    const { error, data } = await supabase
                        .from('price_table_items')
                        .insert({
                            price_table_id: table.id,
                            product_variant_id: variant.id,
                            custom_price: customPrice
                        })
                        .select()
                        .single()
                    if (error) throw error
                    setTableItems(prev => ({ ...prev, [variant.id]: data }))
                }
                saved++
            } catch {
                errors++
            }
        }

        setSavingAll(false)
        if (errors > 0) {
            toast.error(`${errors} item(ns) falharam ao salvar.`)
        } else {
            toast.success(`${saved} exceção(ões) salva(s) com sucesso!`)
        }
    }

    // --- Helpers ---
    const calcStdPrice = (variant: VariantWithRelations) => {
        const baseCalc = variant.product.base_price + (variant.price_override ?? variant.fabric.price_modifier)
        const globalDiscount = table ? table.discount_percentage : 0
        return baseCalc * (1 - (globalDiscount / 100))
    }

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:max-w-2xl! md:max-w-4xl! lg:max-w-[70vw]! xl:max-w-[75vw]! flex flex-col p-0 gap-0">
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b bg-white">
                    <SheetHeader className="p-0">
                        <SheetTitle className="text-lg font-heading text-navy flex items-center gap-2">
                            <Tag className="h-5 w-5 text-bronze" />
                            Exceções de Preço: {table?.name}
                        </SheetTitle>
                        <SheetDescription className="text-xs">
                            Defina um preço fixo (R$) para sobrepor o desconto global de {table?.discount_percentage}%.
                            Campos vazios herdam o desconto automaticamente.
                        </SheetDescription>
                    </SheetHeader>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Buscar produto, tecido ou cor..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-9 text-sm bg-slate-50"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Filter pills */}
                        <div className="flex items-center gap-1">
                            {([
                                { key: 'all', label: 'Todos' },
                                { key: 'overrides', label: 'Com Exceção' },
                                { key: 'no-override', label: 'Sem Exceção' },
                            ] as { key: FilterMode, label: string }[]).map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setFilterMode(f.key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${filterMode === f.key
                                        ? 'bg-navy text-white border-navy'
                                        : 'bg-white text-muted-foreground border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    {f.label}
                                    {f.key === 'overrides' && stats.withOverride > 0 && (
                                        <span className="ml-1 opacity-80">({stats.withOverride})</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-1 ml-auto">
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleImportCSV}
                            />
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="h-3.5 w-3.5" /> Importar
                            </Button>
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={handleExportCSV}>
                                <Download className="h-3.5 w-3.5" /> Exportar
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-4" />
                            <p className="text-sm">Carregando variações do catálogo...</p>
                        </div>
                    ) : filteredVariants.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground text-sm">Nenhuma variação encontrada.</p>
                            {(search || filterMode !== 'all') && (
                                <Button variant="link" size="sm" className="mt-2" onClick={() => { setSearch(''); setFilterMode('all') }}>
                                    Limpar filtros
                                </Button>
                            )}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-100 border-b">
                                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                                    <th className="text-left py-2.5 px-4 font-medium">Produto</th>
                                    <th className="text-left py-2.5 px-3 font-medium hidden md:table-cell">Tecido</th>
                                    <th className="text-left py-2.5 px-3 font-medium hidden lg:table-cell">Cor</th>
                                    <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">Preço Padrão</th>
                                    <th className="text-center py-2.5 px-3 font-medium whitespace-nowrap min-w-[160px]">Preço Fixo (R$)</th>
                                    <th className="text-center py-2.5 px-3 font-medium w-[52px]"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredVariants.map(variant => {
                                    const hasOverride = !!tableItems[variant.id]
                                    const isSavingThis = savingId === variant.id
                                    const standardTablePrice = calcStdPrice(variant)

                                    return (
                                        <tr
                                            key={variant.id}
                                            className={`group transition-colors hover:bg-slate-50/80 ${hasOverride ? 'bg-amber-50/40' : ''}`}
                                        >
                                            {/* Product Name */}
                                            <td className="py-2.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-navy truncate max-w-[200px] lg:max-w-[280px]">
                                                        {variant.product.name}
                                                    </span>
                                                    {hasOverride && (
                                                        <Badge className="bg-bronze/15 text-bronze text-[10px] px-1.5 py-0 border-0 shrink-0">
                                                            Fixo
                                                        </Badge>
                                                    )}
                                                </div>
                                                {/* Mobile: show fabric/color inline */}
                                                <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                                                    {variant.fabric.name} · {variant.fabric_color.name}
                                                </div>
                                            </td>

                                            {/* Fabric */}
                                            <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                                                {variant.fabric.name}
                                            </td>

                                            {/* Color */}
                                            <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell">
                                                {variant.fabric_color.name}
                                            </td>

                                            {/* Standard Price */}
                                            <td className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                                                <span className={hasOverride ? 'line-through opacity-50' : ''}>
                                                    R$ {standardTablePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>

                                            {/* Custom Price Input */}
                                            <td className="py-1.5 px-3">
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">R$</span>
                                                    <Input
                                                        value={priceInputs[variant.id] || ''}
                                                        onChange={(e) => handlePriceChange(variant.id, e.target.value)}
                                                        placeholder="—"
                                                        type="number"
                                                        step="0.01"
                                                        className={`pl-8 h-8 text-sm tabular-nums ${hasOverride ? 'font-semibold text-bronze border-bronze/30 focus-visible:ring-bronze' : 'border-slate-200'}`}
                                                    />
                                                </div>
                                            </td>

                                            {/* Save Button */}
                                            <td className="py-1.5 px-3 text-center">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleSaveItem(variant.id)}
                                                    disabled={isSavingThis}
                                                    className={`h-8 w-8 ${hasOverride ? 'text-bronze hover:text-bronze hover:bg-bronze/10' : 'text-muted-foreground hover:text-foreground'}`}
                                                >
                                                    {isSavingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <SheetFooter className="flex-row items-center justify-between gap-4 px-5 py-3 border-t bg-white shrink-0 mt-0">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span><strong className="text-foreground">{stats.total}</strong> variações</span>
                        <span className="h-3 w-px bg-slate-200" />
                        <span><strong className="text-bronze">{stats.withOverride}</strong> com exceção</span>
                        {stats.dirtyCount > 0 && (
                            <>
                                <span className="h-3 w-px bg-slate-200" />
                                <span className="text-amber-600"><strong>{stats.dirtyCount}</strong> não salvas</span>
                            </>
                        )}
                    </div>
                    <Button
                        onClick={handleSaveAll}
                        disabled={savingAll || stats.dirtyCount === 0}
                        className="gradient-navy border-0 text-white gap-2 h-9 px-5"
                    >
                        {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                        Salvar Tudo {stats.dirtyCount > 0 && `(${stats.dirtyCount})`}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
