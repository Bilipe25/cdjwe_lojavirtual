'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Plus, Tag, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { CustomerType } from '@/lib/types'

import { PriceTableList, type PriceTable } from './components/PriceTableList'
import { PriceTableForm, type PriceTableData } from './components/PriceTableForm'
import { PriceTableItemsDrawer } from './components/PriceTableItemsDrawer'
import { PriceTableAssignDrawer } from './components/PriceTableAssignDrawer'
import { PriceTablePaymentRulesDrawer } from './components/PriceTablePaymentRulesDrawer'

const PAGE_SIZE = 15

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

export default function PriceTablesPage() {
    // Pagination & Data states
    const [priceTables, setPriceTables] = useState<PriceTable[]>([])
    const [loading, setLoading] = useState(true)
    const [totalCount, setTotalCount] = useState(0)
    const [currentPage, setCurrentPage] = useState(1)
    
    // Search constraints
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Form states
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingTable, setEditingTable] = useState<PriceTable | null>(null)
    
    // Drawer states
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [drawerTable, setDrawerTable] = useState<PriceTable | null>(null)
    
    // Assign Drawer states
    const [isAssignOpen, setIsAssignOpen] = useState(false)
    const [assignTable, setAssignTable] = useState<PriceTable | null>(null)

    // Rules Drawer states
    const [isRulesOpen, setIsRulesOpen] = useState(false)
    const [rulesTable, setRulesTable] = useState<PriceTable | null>(null)

    // Customer types
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])

    // Debounce listener
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
            setCurrentPage(1)
        }, 500)
        return () => clearTimeout(timer)
    }, [search])

    // Load customer types once
    useEffect(() => {
        const loadTypes = async () => {
            const supabase = createClient()
            const { data } = await supabase
                .from('customer_types')
                .select('*')
                .eq('is_active', true)
                .order('sort_order')
            if (data) setCustomerTypes(data)
        }
        loadTypes()
    }, [])

    const loadPriceTables = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        
        let query = supabase
            .from('price_tables')
            .select('*, customer_type:customer_types(*)', { count: 'exact' })
            .order('name')
            
        if (debouncedSearch) {
            query = query.ilike('name', `%${debouncedSearch}%`)
        }
        
        const from = (currentPage - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        query = query.range(from, to)

        const { data, count, error } = await query

        if (error) {
            toast.error('Erro ao buscar tabelas de preço')
            console.error(error)
        } else {
            setPriceTables(data || [])
            setTotalCount(count || 0)
        }
        setLoading(false)
    }, [currentPage, debouncedSearch])

    useEffect(() => {
        void loadPriceTables()
    }, [loadPriceTables])

    const handleSave = async (data: Omit<PriceTableData, 'id'>) => {
        const supabase = createClient()

        try {
            // Remove the default from others if checking it on
            if (data.is_default) {
                await supabase
                    .from('price_tables')
                    .update({ is_default: false })
                    .neq('id', editingTable?.id || '00000000-0000-0000-0000-000000000000')
            }

            if (editingTable) {
                const { error } = await supabase
                    .from('price_tables')
                    .update(data)
                    .eq('id', editingTable.id)

                if (error) throw error
                toast.success('Tabela atualizada com sucesso!')
            } else {
                const { error } = await supabase
                    .from('price_tables')
                    .insert(data)

                if (error) throw error
                toast.success('Nova tabela criada!')
            }

            void loadPriceTables()
        } catch (err: unknown) {
            console.error(err)
            toast.error(getErrorMessage(err, 'Houve um erro interno ao salvar a tabela de precos.'))
            throw err
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Tem certeza que deseja remover a tabela corporativa "${name}"? \nISTO ROMPERÁ O DESCONTO DOS CLIENTES ASSOCIADOS A ELA!`)) {
            return
        }

        const supabase = createClient()
        const { error } = await supabase
            .from('price_tables')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('A tabela está em uso ativo e não pôde ser removida.')
        } else {
            toast.success('Tabela dizimada com sucesso!')
            if (priceTables.length === 1 && currentPage > 1) {
                setCurrentPage(p => p - 1)
            } else {
                void loadPriceTables()
            }
        }
    }

    const openCreateDialog = () => {
        setEditingTable(null)
        setIsFormOpen(true)
    }

    const openEditDialog = (table: PriceTable) => {
        setEditingTable(table)
        setIsFormOpen(true)
    }

    const handleClone = async (table: PriceTable) => {
        if (!confirm(`Deseja criar uma cópia exata de "${table.name}", incluindo todos os seus preços excecionais?`)) return
        
        setLoading(true)
        const supabase = createClient()
        
        try {
            // 1. Create the new root Price Table
            const { data: newTable, error: tableError } = await supabase
                .from('price_tables')
                .insert({
                    name: `${table.name} (Cópia)`,
                    description: table.description,
                    discount_percentage: table.discount_percentage,
                    is_default: false,
                    is_active: false, // Start paused to allow adjustments
                    valid_from: table.valid_from,
                    valid_until: table.valid_until,
                    customer_type_id: table.customer_type_id || null,
                })
                .select('id')
                .single()
                
            if (tableError || !newTable) throw tableError || new Error('Ocorreu um erro gerando a Tabela raíz')
            
            // 2. Fetch all existing exceptional items (Custom Prices) nested below it
            const { data: sourceItems, error: itemsError } = await supabase
                .from('price_table_items')
                .select('product_variant_id, custom_price')
                .eq('price_table_id', table.id)
                
            if (itemsError) throw itemsError
            
            // 3. Duplicate items attaching to the New Table ID
            if (sourceItems && sourceItems.length > 0) {
                const insertPayload = sourceItems.map(item => ({
                    price_table_id: newTable.id,
                    product_variant_id: item.product_variant_id,
                    custom_price: item.custom_price
                }))
                
                const { error: cloneError } = await supabase
                    .from('price_table_items')
                    .insert(insertPayload)
                    
                if (cloneError) throw cloneError
            }
            
            toast.success('Clonagem concluída! Todos os preços isolados foram preservados em rascunho.')
            void loadPriceTables()
        } catch (err: unknown) {
            console.error(err)
            toast.error('Ocorreu uma falha no procedimento de clone massivo.')
        } finally {
            setLoading(false)
        }
    }

    const openManageItems = (table: PriceTable) => {
        setDrawerTable(table)
        setIsDrawerOpen(true)
    }

    const openAssignDrawer = (table: PriceTable) => {
        setAssignTable(table)
        setIsAssignOpen(true)
    }

    const openManageRules = (table: PriceTable) => {
        setRulesTable(table)
        setIsRulesOpen(true)
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    return (
        <div className="space-y-6 flex flex-col min-h-[85vh]">
            <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy flex items-center gap-2">
                        <Tag className="h-8 w-8 text-bronze" />
                        Tabelas de Preços
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerencie as tabelas que você pode atribuir aos clientes
                    </p>
                </div>
                <Button onClick={openCreateDialog} className="gradient-navy border-0 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Tabela
                </Button>
            </motion.div>

            {/* Smart Server-Side Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar tabela pelo nome..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-11 bg-white/60"
                />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-600">
                Arquitetura de preco ativa: Cor - Tamanho - Tabela - Base.
                Use o menu Gerenciar Produtos para configurar excecoes por variacao e revisar produtos com tamanhos ativos.
            </div>

            <div className="flex-1 flex flex-col">
                <PriceTableList 
                    tables={priceTables} 
                    loading={loading} 
                    onEdit={openEditDialog} 
                    onDelete={handleDelete} 
                    onManageItems={openManageItems}
                    onClone={handleClone}
                    onAssign={openAssignDrawer}
                    onManageRules={openManageRules}
                />

                {/* Secure Pagination Boundaries */}
                {!loading && totalPages > 1 && (
                    <div className="mt-auto pt-6 flex items-center justify-center gap-4">
                        <Button
                            variant="outline"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="bg-white/60"
                        >
                            <ChevronLeft className="h-4 w-4 mr-2" /> Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground font-medium">
                            Página {currentPage} de {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="bg-white/60"
                        >
                            Próxima <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Form Entity */}
            <PriceTableForm 
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                initialData={editingTable}
                onSave={handleSave}
                customerTypes={customerTypes}
            />

            {/* Custom Prices Drawer Component */}
            <PriceTableItemsDrawer
                isOpen={isDrawerOpen}
                table={drawerTable}
                onClose={() => setIsDrawerOpen(false)}
            />
            
            {/* Batch Assign Drawer Component */}
            <PriceTableAssignDrawer
                isOpen={isAssignOpen}
                table={assignTable}
                onClose={() => setIsAssignOpen(false)}
            />

            <PriceTablePaymentRulesDrawer 
                isOpen={isRulesOpen}
                table={rulesTable}
                onClose={() => setIsRulesOpen(false)}
            />
        </div>
    )
}
