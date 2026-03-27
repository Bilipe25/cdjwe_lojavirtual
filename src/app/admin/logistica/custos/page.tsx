'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    DollarSign,
    Fuel,
    Save,
    RefreshCw,
    Percent,
    Banknote,
    CalendarClock,
    FileText,
    Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getCostSettings, saveCostSettings } from '../services'

export default function CustosPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [form, setForm] = useState({
        fuel_price_per_liter: '',
        fuel_tax_pct: '',
        additional_tax: '',
        daily_rate: '',
        notes: '',
    })
    const [lastUpdated, setLastUpdated] = useState<string | null>(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getCostSettings()
        if ('error' in res && res.error) setError(res.error)
        else if (res.data) {
            setForm({
                fuel_price_per_liter: String(res.data.fuel_price_per_liter || ''),
                fuel_tax_pct: String(res.data.fuel_tax_pct || ''),
                additional_tax: String(res.data.additional_tax || ''),
                daily_rate: String(res.data.daily_rate || ''),
                notes: res.data.notes || '',
            })
            setLastUpdated(res.data.updated_at)
        }
        setLoading(false)
    }, [])

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void loadData() }, [loadData])

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        setSuccess(false)
        const res = await saveCostSettings({
            fuel_price_per_liter: Number(form.fuel_price_per_liter) || 0,
            fuel_tax_pct: Number(form.fuel_tax_pct) || 0,
            additional_tax: Number(form.additional_tax) || 0,
            daily_rate: Number(form.daily_rate) || 0,
            notes: form.notes || null,
        })
        setSaving(false)
        if (res.error) setError(res.error)
        else {
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            void loadData()
        }
    }

    const formatCurrency = (v: string) => {
        const num = Number(v)
        if (!num) return 'R$ 0,00'
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-navy flex items-center gap-2">
                        <Settings2 className="h-6 w-6" /> Configurações de Custos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Defina os custos operacionais para cálculo automático nas rotas
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void loadData()} disabled={loading}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
                        <Save className="h-4 w-4" />
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    ✓ Configurações salvas com sucesso!
                </div>
            )}

            {loading ? (
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
            ) : (
                <div className="grid gap-5 md:grid-cols-2">
                    {/* Combustível */}
                    <div className="rounded-xl border bg-white p-5 space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                <Fuel className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-navy">Combustível</h3>
                                <p className="text-[10px] text-muted-foreground">Preço base do combustível</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <DollarSign className="h-3 w-3" /> Preço por Litro (R$)
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                value={form.fuel_price_per_liter}
                                onChange={(e) => setForm({ ...form, fuel_price_per_liter: e.target.value })}
                                placeholder="5.89"
                                className="text-lg font-bold"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Preço médio atual do litro de combustível
                            </p>
                        </div>
                        <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-3 text-xs text-amber-700">
                            <strong>Exemplo:</strong> Uma rota de 100 km com veículo de 10 km/l → {formatCurrency(String((100 / 10) * (Number(form.fuel_price_per_liter) || 0)))} de combustível
                        </div>
                    </div>

                    {/* Taxas */}
                    <div className="rounded-xl border bg-white p-5 space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Percent className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-navy">Taxas e Encargos</h3>
                                <p className="text-[10px] text-muted-foreground">Taxas adicionais por rota</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                    <Percent className="h-3 w-3" /> Taxa Combustível (%)
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.fuel_tax_pct}
                                    onChange={(e) => setForm({ ...form, fuel_tax_pct: e.target.value })}
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                    <Banknote className="h-3 w-3" /> Taxa Adicional (R$)
                                </label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.additional_tax}
                                    onChange={(e) => setForm({ ...form, additional_tax: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Taxa combustível: % sobre o custo do combustível. Taxa adicional: valor fixo por rota.
                        </p>
                    </div>

                    {/* Diária */}
                    <div className="rounded-xl border bg-white p-5 space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <CalendarClock className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-navy">Diária do Motorista</h3>
                                <p className="text-[10px] text-muted-foreground">Custo fixo por dia de rota</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                                <DollarSign className="h-3 w-3" /> Valor da Diária (R$)
                            </label>
                            <Input
                                type="number"
                                step="0.01"
                                value={form.daily_rate}
                                onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
                                placeholder="150.00"
                                className="text-lg font-bold"
                            />
                        </div>
                    </div>

                    {/* Observações */}
                    <div className="rounded-xl border bg-white p-5 space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                                <FileText className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-navy">Observações</h3>
                                <p className="text-[10px] text-muted-foreground">Anotações e referências de custo</p>
                            </div>
                        </div>
                        <div>
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                placeholder="Ex: Preço referência posto Shell - Março/2026"
                                className="w-full rounded-lg border bg-white px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                        </div>
                        {lastUpdated && (
                            <p className="text-[10px] text-muted-foreground">
                                Última atualização: {new Date(lastUpdated).toLocaleString('pt-BR')}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

