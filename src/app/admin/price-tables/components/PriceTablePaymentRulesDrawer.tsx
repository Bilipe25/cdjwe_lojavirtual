'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Loader2, Save, Trash2, CreditCard, X } from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { PriceTable, PriceTablePaymentRule } from '@/lib/types'
import { getPaymentRulesAction, savePaymentRuleAction, deletePaymentRuleAction } from '../actions'

interface PriceTablePaymentRulesDrawerProps {
    table: PriceTable | null
    isOpen: boolean
    onClose: () => void
}

export function PriceTablePaymentRulesDrawer({ table, isOpen, onClose }: PriceTablePaymentRulesDrawerProps) {
    const [rules, setRules] = useState<PriceTablePaymentRule[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [editingRule, setEditingRule] = useState<Partial<PriceTablePaymentRule> | null>(null)

    useEffect(() => {
        if (isOpen && table) {
            loadRules()
        } else {
            setRules([])
            setEditingRule(null)
        }
    }, [isOpen, table])

    const loadRules = async () => {
        if (!table) return
        setLoading(true)
        const result = await getPaymentRulesAction(table.id)
        if (result.error) {
            toast.error(result.error)
        } else {
            setRules(result.data || [])
        }
        setLoading(false)
    }

    const handleNewRule = () => {
        setEditingRule({
            price_table_id: table?.id,
            min_order_value: 0,
            number_of_installments: 1,
            discount_percentage: 0,
            installment_days: ''
        })
    }

    const handleEditRule = (rule: PriceTablePaymentRule) => {
        setEditingRule(rule)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingRule || !table) return

        setSaving(true)
        const result = await savePaymentRuleAction(editingRule as any)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Regra salva com sucesso!')
            setEditingRule(null)
            loadRules()
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta regra?')) return
        const result = await deletePaymentRuleAction(id)
        if (result.error) {
            toast.error(result.error)
        } else {
            toast.success('Regra excluída!')
            loadRules()
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-6 overflow-hidden">
                <SheetHeader>
                    <SheetTitle className="text-lg font-heading text-navy flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-bronze" />
                        Regras de Pagamento: {table?.name}
                    </SheetTitle>
                    <SheetDescription>
                        Configure condições diferenciadas de acordo com o valor total do pedido.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto mt-6 pr-1">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : rules.length === 0 && !editingRule ? (
                        <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed">
                            <p className="text-sm text-muted-foreground">Nenhuma regra configurada.</p>
                            <Button variant="link" size="sm" onClick={handleNewRule} className="mt-2">
                                Criar primeira regra
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {!editingRule && (
                                <Button onClick={handleNewRule} className="w-full h-10 border-dashed" variant="outline">
                                    <Plus className="h-4 w-4 mr-2" /> Nova Regra
                                </Button>
                            )}

                            {editingRule && (
                                <form onSubmit={handleSave} className="bg-slate-50 p-4 rounded-lg border border-navy/10 space-y-4 shadow-inner">
                                    <h3 className="text-sm font-bold text-navy flex items-center justify-between">
                                        {editingRule.id ? 'Editar Regra' : 'Nova Regra'}
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingRule(null)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs">Valor Mínimo (R$)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={editingRule.min_order_value}
                                                onChange={e => setEditingRule({ ...editingRule, min_order_value: parseFloat(e.target.value) })}
                                                required
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Valor Máximo (R$)</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={editingRule.max_order_value || ''}
                                                onChange={e => setEditingRule({ ...editingRule, max_order_value: e.target.value ? parseFloat(e.target.value) : null })}
                                                placeholder="Sem limite"
                                                className="bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs">Qtd. Parcelas</Label>
                                            <Input
                                                type="number"
                                                value={editingRule.number_of_installments}
                                                onChange={e => setEditingRule({ ...editingRule, number_of_installments: parseInt(e.target.value) })}
                                                required
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Desconto (%)</Label>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                value={editingRule.discount_percentage}
                                                onChange={e => setEditingRule({ ...editingRule, discount_percentage: parseFloat(e.target.value) })}
                                                required
                                                className="bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs">Dias das Parcelas (ex: 30, 60, 90)</Label>
                                        <Input
                                            value={editingRule.installment_days || ''}
                                            onChange={e => setEditingRule({ ...editingRule, installment_days: e.target.value })}
                                            placeholder="30, 60, 90"
                                            className="bg-white"
                                        />
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Button type="submit" disabled={saving} className="flex-1 gradient-navy border-0 text-white h-9">
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                            Salvar Regra
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {rules.map(rule => (
                                <div key={rule.id} className="p-4 rounded-xl border bg-white shadow-sm flex items-center justify-between group hover:border-bronze/30 transition-colors">
                                    <div className="space-y-1">
                                        <div className="text-sm font-bold text-navy flex items-center gap-1.5">
                                            {rule.number_of_installments}x {rule.installment_days && <span className="text-[10px] font-normal text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">{rule.installment_days}</span>}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            R$ {rule.min_order_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                                            {rule.max_order_value ? ` até R$ ${rule.max_order_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ' em diante'}
                                        </div>
                                        {rule.discount_percentage > 0 && (
                                            <div className="text-[11px] font-bold text-emerald-600">
                                                Desconto: {rule.discount_percentage}%
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-navy hover:bg-navy/5" onClick={() => handleEditRule(rule)}>
                                            <Plus className="h-4 w-4 rotate-45" /> {/* Use edit icon instead? Lucide 'Pencil' is better */}
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/5" onClick={() => handleDelete(rule.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
