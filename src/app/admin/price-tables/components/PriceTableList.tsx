import React from 'react'
import { motion } from 'framer-motion'
import { Edit2, Trash2, Check, Tag, Settings2, Users, CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { CustomerType } from '@/lib/types'

export interface PriceTable {
    id: string
    name: string
    description: string | null
    discount_percentage: number
    is_default: boolean
    is_active: boolean
    valid_from: string | null
    valid_until: string | null
    customer_type_id: string | null
    created_at: string
    // Relations
    customer_type?: CustomerType | null
}

interface PriceTableListProps {
    tables: PriceTable[]
    loading: boolean
    onEdit: (table: PriceTable) => void
    onDelete: (id: string, name: string) => void
    onManageItems: (table: PriceTable) => void
    onClone: (table: PriceTable) => void
    onAssign: (table: PriceTable) => void
    onManageRules: (table: PriceTable) => void
}

export function PriceTableList({ tables, loading, onEdit, onDelete, onManageItems, onClone, onAssign, onManageRules }: PriceTableListProps) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                    <Card key={i} className="glass-card border-0">
                        <CardContent className="p-5">
                            <Skeleton className="h-6 w-3/4 mb-4" />
                            <Skeleton className="h-4 w-full mb-2" />
                            <Skeleton className="h-4 w-1/2" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (tables.length === 0) {
        return (
            <div className="text-center py-16 bg-white/40 rounded-xl border border-white/20">
                <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Tag className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Nenhuma tabela encontrada</h3>
                <p className="text-muted-foreground mt-1 text-sm max-w-sm mx-auto">
                    Crie tabelas de preços com diferentes percentuais de desconto ou adicione exceções comerciais específicas.
                </p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {tables.map((table) => (
                <motion.div
                    key={table.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    layout
                >
                    <Card className={`glass-card border-0 relative overflow-hidden transition-all hover:shadow-md ${!table.is_active ? 'opacity-70 grayscale-30' : ''}`}>
                        {table.is_default && (
                            <div className="absolute top-0 right-0 bg-bronze text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                                <Check className="h-3 w-3" /> PADRÃO
                            </div>
                        )}
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-3">
                                <div className="pr-4">
                                    <h3 className="font-semibold text-lg text-navy line-clamp-1" title={table.name}>{table.name}</h3>
                                    {!table.is_active && (
                                        <Badge variant="secondary" className="mt-1 text-[10px]">Inativa</Badge>
                                    )}
                                    {table.customer_type?.name && (
                                        <Badge variant="outline" className="mt-1 text-[10px] border-bronze/30 text-bronze bg-bronze/5">
                                            {table.customer_type.name}
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={`text-xl font-bold ${table.discount_percentage > 0 ? 'text-green-600' : table.discount_percentage < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                        {table.discount_percentage > 0 ? '-' : table.discount_percentage < 0 ? '+' : ''}
                                        {Math.abs(table.discount_percentage)}%
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">Desc. Global</span>
                                </div>
                            </div>

                            <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4">
                                {table.description || 'Sem descrição'}
                            </p>

                            <div className="flex flex-col gap-2 pt-3 border-t border-black/5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-gradient-bronze border-bronze/20 hover:bg-bronze hover:text-white transition-colors"
                                    onClick={() => onManageItems(table)}
                                >
                                    <Settings2 className="h-4 w-4 mr-2" />
                                    Gerenciar Produtos
                                </Button>
                                
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-gradient-navy border-navy/20 hover:bg-navy hover:text-white transition-colors"
                                    onClick={() => onAssign(table)}
                                >
                                    <Users className="h-4 w-4 mr-2" />
                                    Atribuir Lojistas
                                </Button>
                                
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-slate-600 border-slate-200 hover:bg-slate-100 transition-colors"
                                    onClick={() => onManageRules(table)}
                                >
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    Regras de Pagamento
                                </Button>
                                
                                <div className="flex items-center justify-between w-full mt-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-navy justify-start h-8 px-2"
                                        onClick={() => onEdit(table)}
                                    >
                                        <Edit2 className="h-4 w-4 mr-1.5" /> Editar
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-bronze h-8 px-2"
                                        onClick={() => onClone(table)}
                                        title="Clonar Tabela"
                                    >
                                        <svg xmlns="http://www.w3.org/0000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-copy h-4 w-4 mr-1.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Clonar
                                    </Button>
                                    {!table.is_default && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-muted-foreground hover:text-destructive h-8 px-2"
                                            onClick={() => onDelete(table.id, table.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    )
}
