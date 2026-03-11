import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Loader2, Save, Users } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { PriceTable, Store } from '@/lib/types'

interface PriceTableAssignDrawerProps {
    table: PriceTable | null
    isOpen: boolean
    onClose: () => void
}

type StoreWithProfile = Store & {
    profile: { full_name: string }
}

export function PriceTableAssignDrawer({ table, isOpen, onClose }: PriceTableAssignDrawerProps) {
    const [stores, setStores] = useState<StoreWithProfile[]>([])
    // Set of store IDs that currently possess THIS table
    const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set())
    
    // UI State
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (isOpen && table) {
            loadData()
        } else {
            setSearch('')
            setStores([])
            setSelectedStoreIds(new Set())
        }
    }, [isOpen, table])

    const loadData = async () => {
        if (!table) return
        setLoading(true)
        const supabase = createClient()

        try {
            // 1. Load ALL active stores 
            // In a million-clients DB we'd paginate, but for a B2B factory, fetching 200~1000 active stores is instantaneous
            const { data: sData, error: sError } = await supabase
                .from('stores')
                .select(`
                    id, company_name, trade_name, city, state,
                    profile:profiles(full_name)
                `)
                .eq('is_active', true)
                .order('company_name')

            if (sError) throw sError

            // 2. See who ALREADY HAS this table
            const { data: pivotData, error: pivotError } = await supabase
                .from('store_price_tables')
                .select('store_id')
                .eq('price_table_id', table.id)

            if (pivotError) throw pivotError

            const linkedSet = new Set<string>()
            pivotData?.forEach(p => linkedSet.add(p.store_id))

            setStores((sData || []) as unknown as StoreWithProfile[])
            setSelectedStoreIds(linkedSet)
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao carregar a lista de lojistas.')
        } finally {
            setLoading(false)
        }
    }

    const handleToggleStore = (storeId: string) => {
        setSelectedStoreIds(prev => {
            const copy = new Set(prev)
            if (copy.has(storeId)) copy.delete(storeId)
            else copy.add(storeId)
            return copy
        })
    }

    const handleSaveBatch = async () => {
        if (!table) return
        setSaving(true)
        const supabase = createClient()

        try {
            // Strategy: 
            // We want stores the user checkmarked to HAVE exactly this table.
            // Stores are 1:1 with tables usually, so assigning a table SHOULD override their past table.
            
            const selectedArray = Array.from(selectedStoreIds)
            
            // Step 1: Delete past associations logic for THESE selected stores
            // The architecture uses `store_price_tables` table. We clear their old table first to avoid dupes.
            if (selectedArray.length > 0) {
                const { error: cleanupError } = await supabase
                    .from('store_price_tables')
                    .delete()
                    .in('store_id', selectedArray)
                    
                if (cleanupError) throw cleanupError
            }
            
            // Step 2: Delete THIS table connection from folks who got un-checked
            // We do a hard wipe of any link to `table.id` that is NOT in the selected array
            // This is safer:
            await supabase
                .from('store_price_tables')
                .delete()
                .eq('price_table_id', table.id)

            // Step 3: Insert the fresh batch
            if (selectedArray.length > 0) {
                const payload = selectedArray.map(storeId => ({
                    store_id: storeId,
                    price_table_id: table.id
                }))
                
                const { error: insertError } = await supabase
                    .from('store_price_tables')
                    .insert(payload)
                    
                if (insertError) throw insertError
            }

            toast.success(`Tabela atribuída a ${selectedArray.length} cliente(s)!`)
            onClose()
        } catch (err: any) {
            console.error(err)
            toast.error('Falha ao reescrever atribuições da mesa.')
        } finally {
            setSaving(false)
        }
    }

    const filteredStores = stores.filter(s => 
        s.company_name.toLowerCase().includes(search.toLowerCase()) ||
        s.trade_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.profile.full_name?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 border-l border-black/10 bg-white">
                <div className="absolute inset-0 flex flex-col bg-white">
                    {/* Header */}
                    <div className="p-6 border-b bg-muted/30 shrink-0">
                        <SheetHeader>
                            <SheetTitle className="text-xl font-heading text-navy flex items-center gap-2">
                            <Users className="h-5 w-5 text-bronze" />
                            Atribuir Lojistas
                        </SheetTitle>
                        <SheetDescription>
                            {table?.name} (Desconto de {table?.discount_percentage}%)
                            <br/>
                            Selecione as lojas que utilizarão esta tabela preferencialmente.
                        </SheetDescription>
                    </SheetHeader>
                    
                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar loja ou responsável..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-white"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mb-4" />
                            <p>Mapeando clientes da indústria...</p>
                        </div>
                    ) : filteredStores.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground">Nenhuma loja encontrada na busca.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 pb-10">
                            {filteredStores.map(store => {
                                const isSelected = selectedStoreIds.has(store.id)
                                
                                return (
                                    <div 
                                        key={store.id} 
                                        className={`p-3 rounded-lg border bg-white cursor-pointer transition-colors flex items-center gap-3 ${isSelected ? 'border-bronze shadow-sm' : 'hover:border-slate-300'}`}
                                        onClick={() => handleToggleStore(store.id)}
                                    >
                                        <div className="relative flex items-center justify-center w-5 h-5 border rounded bg-white shrink-0">
                                            {isSelected && <div className="absolute inset-0 bg-bronze rounded flex items-center justify-center">
                                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            </div>}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h4 className={`font-semibold text-sm truncate ${isSelected ? 'text-navy' : 'text-slate-700'}`}>
                                                {store.trade_name || store.company_name}
                                            </h4>
                                            <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 truncate">
                                                <span className="truncate">{store.profile.full_name}</span>
                                                {store.city && <span className="shrink-0">• {store.city}/{store.state}</span>}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                
                {/* Sticky Footer */}
                <div className="p-4 border-t bg-white shrink-0">
                    <Button 
                        onClick={handleSaveBatch} 
                        disabled={saving || loading}
                        className="w-full bg-navy text-white hover:bg-navy/90 h-11"
                    >
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Disparar Tabela para {selectedStoreIds.size} Loja(s)
                    </Button>
                </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
