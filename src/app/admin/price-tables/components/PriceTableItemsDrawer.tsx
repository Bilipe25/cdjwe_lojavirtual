import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, Loader2, Save, Tag, Download, Upload } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
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

// Flat structure mimicking the joined data from Supabase
type VariantWithRelations = ProductVariant & {
    product: { name: string, base_price: number }
    fabric: { name: string, price_modifier: number }
    fabric_color: { name: string }
}

export function PriceTableItemsDrawer({ table, isOpen, onClose }: PriceTableItemsDrawerProps) {
    const [variants, setVariants] = useState<VariantWithRelations[]>([])
    const [tableItems, setTableItems] = useState<Record<string, PriceTableItem>>({})
    
    // UI State
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [savingId, setSavingId] = useState<string | null>(null)
    
    // Local Inputs for prices keyed by variant_id
    const [priceInputs, setPriceInputs] = useState<Record<string, string>>({})

    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen && table) {
            loadData()
        } else {
            // Reset state
            setSearch('')
            setVariants([])
            setTableItems({})
            setPriceInputs({})
        }
    }, [isOpen, table])

    const loadData = async () => {
        if (!table) return
        setLoading(true)
        const supabase = createClient()

        try {
            // 1. Fetch Variants
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

            // 2. Fetch Existing Price Table Items
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

    const handleExportCSV = () => {
        if (!variants.length) {
            toast.error('Nenhum produto encontrado na base de dados.')
            return
        }

        // CSV Header: Variant ID (internal lock), Name, Custom Price (if exists), Reference Price
        const headers = ["ID Variante", "Produto", "Tecido/Cor", "Preço Fixo Customizado (Deixe vazio para herdar % global)", "Ref: Preço Visível da Tabela"]
        
        let csvContent = headers.join(";") + "\n"
        
        variants.forEach(v => {
            const hasOverride = tableItems[v.id]
            const baseCalc = v.product.base_price + (v.price_override ?? v.fabric.price_modifier)
            const globalDiscount = table ? table.discount_percentage : 0
            const standardTablePrice = baseCalc * (1 - (globalDiscount / 100))
            const rawPrice = priceInputs[v.id] || ''

            const row = [
                v.id,
                `"${v.product.name}"`, // Wrap in quotes if there are spaces
                `"${v.fabric.name} / ${v.fabric_color.name}"`,
                rawPrice.toString().replace('.', ','), // Revert to Brazilian standard for Excel
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
                // Basic split by line
                const lines = text.split('\n')
                if (lines.length < 2) throw new Error('Planilha vazia ou em formato incorreto')

                const newPrices: Record<string, string> = {}
                let countChanges = 0

                // Parse skipping header
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(';')
                    if (row.length < 4) continue // Skip invalid lines

                    const variantId = row[0].replace(/"/g, '').trim()
                    const customPriceStr = row[3].replace(/"/g, '').trim() // 4th column

                    // Validate if ID is UUID-like (simplistic check to avoid garbage lines)
                    if (variantId.length >= 32) {
                        if (customPriceStr !== '') {
                            // If user typed 1.500,00 we must treat correctly in JS.
                            // Simply convert COMMA to DOT for internal usage. (Assume they didn't use '.' for thousands)
                            const normalizedNumber = customPriceStr.replace(',', '.')
                            newPrices[variantId] = normalizedNumber
                            countChanges++
                        } else {
                            // Set to empty intentionally (will erase if we had an override)
                            newPrices[variantId] = ''
                        }
                    }
                }

                // Hydrate local UI State immediately
                setPriceInputs(prev => ({ ...prev, ...newPrices }))
                toast.success(`Planilha Lida! ${countChanges} preço(s) modificado(s) na tela. Lembre-se de clicar em salvar um a um ou crie um "Salvar Lote" no futuro.`)
                
            } catch (err) {
                console.error(err)
                toast.error('O Excel importado está incorreto. Use a Planilha baixada pelo sistema como modelo.')
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = ''
            }
        }
        reader.readAsText(file)
    }

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
                // Se apagou o valor, deletamos do BD a exceção.
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
                    toast.success('Exceção de preço removida!')
                }
                setSavingId(null)
                return
            }

            // Converter para float
            const customPrice = parseFloat(rawValue.replace(',', '.'))
            if (isNaN(customPrice) || customPrice < 0) {
                toast.error('Preço inválido')
                setSavingId(null)
                return
            }

            const existingItem = tableItems[variantId]

            if (existingItem) {
                // Update
                const { error, data } = await supabase
                    .from('price_table_items')
                    .update({ custom_price: customPrice })
                    .eq('id', existingItem.id)
                    .select()
                    .single()

                if (error) throw error
                setTableItems(prev => ({ ...prev, [variantId]: data }))
                toast.success('Preço customizado atualizado!')
            } else {
                // Insert
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
                toast.success('Preço customizado definido!')
            }

        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao salvar o item.')
        } finally {
            setSavingId(null)
        }
    }

    const filteredVariants = variants.filter(v => 
        v.product.name.toLowerCase().includes(search.toLowerCase()) ||
        v.fabric.name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
                <div className="p-6 border-b">
                    <SheetHeader>
                        <SheetTitle className="text-xl font-heading text-navy flex items-center gap-2">
                            <Tag className="h-5 w-5 text-bronze" />
                            Exceções: {table?.name}
                        </SheetTitle>
                        <SheetDescription>
                            Defina um PREÇO FIXO EXATo em Reais (R$) para sobrepor o desconto global da Tabela de Preços.
                            Se estiver vazio, o móvel adotará o desconto normal ({table?.discount_percentage}%).
                        </SheetDescription>
                    </SheetHeader>
                    
                    <div className="relative mt-4 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome do sofá ou tecido..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 bg-white/60"
                            />
                        </div>
                        
                        {/* Hidden File Input */}
                        <input 
                            type="file" 
                            accept=".csv" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleImportCSV} 
                        />
                        
                        <Button variant="outline" size="icon" title="Importar Excel CSV" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" title="Anotar no Excel (Exportar)" onClick={handleExportCSV}>
                            <Download className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-4" />
                            <p>Carregando as variações da fábrica...</p>
                        </div>
                    ) : filteredVariants.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground">Nenhuma variação encontrada.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredVariants.map(variant => {
                                const hasOverride = !!tableItems[variant.id]
                                const isSavingThis = savingId === variant.id
                                
                                // Calc the standard system price to show as reference
                                const baseCalc = variant.product.base_price + (variant.price_override ?? variant.fabric.price_modifier)
                                const globalDiscount = table ? table.discount_percentage : 0
                                const standardTablePrice = baseCalc * (1 - (globalDiscount / 100))

                                return (
                                    <div 
                                        key={variant.id} 
                                        className={`p-4 rounded-xl border bg-white transition-all ${hasOverride ? 'border-bronze shadow-sm' : ''}`}
                                    >
                                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-navy">{variant.product.name}</h4>
                                                    {hasOverride && (
                                                        <Badge className="bg-bronze hover:bg-bronze text-[10px] text-white">Preço Fixo</Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span>Tecido: <strong className="text-foreground">{variant.fabric.name}</strong></span>
                                                    <span>Cor: <strong className="text-foreground">{variant.fabric_color.name}</strong></span>
                                                    {variant.sku && <span>SKU: {variant.sku}</span>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 w-full sm:w-auto">
                                                <div className="text-right hidden sm:block">
                                                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Preço Padrão da Tabela</p>
                                                    <p className="text-sm line-through opacity-70">
                                                        R$ {standardTablePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                                
                                                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                                    <div className="relative w-full sm:w-32">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">R$</span>
                                                        <Input 
                                                            value={priceInputs[variant.id] || ''}
                                                            onChange={(e) => handlePriceChange(variant.id, e.target.value)}
                                                            placeholder="0,00"
                                                            type="number"
                                                            step="0.01"
                                                            className={`pl-9 border-slate-300 ${hasOverride ? 'font-bold text-bronze focus-visible:ring-bronze' : ''}`}
                                                        />
                                                    </div>
                                                    <Button 
                                                        size="icon" 
                                                        variant={hasOverride ? "default" : "secondary"}
                                                        onClick={() => handleSaveItem(variant.id)}
                                                        disabled={isSavingThis}
                                                        className={hasOverride ? "bg-bronze hover:bg-bronze/90 text-white" : ""}
                                                    >
                                                        {isSavingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
