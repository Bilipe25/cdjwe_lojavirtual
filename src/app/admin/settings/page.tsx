'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Settings,
    Save,
    Loader2,
    Building2,
    Phone,
    Mail,
    MapPin,
    ImageIcon,
    Package,
    Truck,
    Eye,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { SystemSettings } from '@/lib/types'

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Form state
    const [systemName, setSystemName] = useState('')
    const [cnpj, setCnpj] = useState('')
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')
    const [state, setState] = useState('')
    const [zipCode, setZipCode] = useState('')
    const [phone, setPhone] = useState('')
    const [phoneSecondary, setPhoneSecondary] = useState('')
    const [email, setEmail] = useState('')
    const [minOrderAmount, setMinOrderAmount] = useState('0')
    const [defaultDeliveryDays, setDefaultDeliveryDays] = useState('30')
    const [showPricesToUnapproved, setShowPricesToUnapproved] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data } = await supabase.from('system_settings').select('*').limit(1).single()
        if (data) {
            setSettings(data)
            setSystemName(data.system_name || '')
            setCnpj(data.cnpj || '')
            setAddress(data.address || '')
            setCity(data.city || '')
            setState(data.state || '')
            setZipCode(data.zip_code || '')
            setPhone(data.phone || '')
            setPhoneSecondary(data.phone_secondary || '')
            setEmail(data.email || '')
            setMinOrderAmount(data.min_order_amount?.toString() || '0')
            setDefaultDeliveryDays(data.default_delivery_days?.toString() || '30')
            setShowPricesToUnapproved(data.show_prices_to_unapproved || false)
        }
        setLoading(false)
    }

    const handleSave = async () => {
        setSaving(true)
        const supabase = createClient()
        const data = {
            system_name: systemName,
            cnpj: cnpj || null,
            address: address || null,
            city: city || null,
            state: state || null,
            zip_code: zipCode || null,
            phone: phone || null,
            phone_secondary: phoneSecondary || null,
            email: email || null,
            min_order_amount: parseFloat(minOrderAmount) || 0,
            default_delivery_days: parseInt(defaultDeliveryDays) || 30,
            show_prices_to_unapproved: showPricesToUnapproved,
        }

        if (settings) {
            const { error } = await supabase.from('system_settings').update(data).eq('id', settings.id)
            if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
        } else {
            const { error } = await supabase.from('system_settings').insert(data)
            if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
        }

        toast.success('Configurações salvas com sucesso!')
        setSaving(false)
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-6"><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                        Configurações
                    </h1>
                    <p className="text-muted-foreground mt-1">Configurações gerais do sistema</p>
                </div>
                <Button className="gradient-navy border-0 text-white gap-2" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                </Button>
            </div>

            {/* Company Info */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-bronze" />
                            Dados da Empresa
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Nome do Sistema</Label>
                                <Input value={systemName} onChange={(e: any) => setSystemName(e.target.value)} placeholder="CDJWE Estofados" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>CNPJ</Label>
                                <Input value={cnpj} onChange={(e: any) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="contato@empresa.com" className="bg-white/60" />
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-4 w-4" />
                            <span className="text-sm font-medium">Telefones</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Telefone Principal</Label>
                                <Input value={phone} onChange={(e: any) => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Telefone Secundário</Label>
                                <Input value={phoneSecondary} onChange={(e: any) => setPhoneSecondary(e.target.value)} placeholder="(00) 00000-0000" className="bg-white/60" />
                            </div>
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span className="text-sm font-medium">Endereço</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Endereço</Label>
                                <Input value={address} onChange={(e: any) => setAddress(e.target.value)} placeholder="Rua, número, bairro" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Cidade</Label>
                                <Input value={city} onChange={(e: any) => setCity(e.target.value)} placeholder="Cidade" className="bg-white/60" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Estado</Label>
                                    <Input value={state} onChange={(e: any) => setState(e.target.value)} placeholder="UF" className="bg-white/60" />
                                </div>
                                <div className="space-y-2">
                                    <Label>CEP</Label>
                                    <Input value={zipCode} onChange={(e: any) => setZipCode(e.target.value)} placeholder="00000-000" className="bg-white/60" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Order Settings */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                            <Package className="h-5 w-5 text-bronze" />
                            Pedidos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Pedido Mínimo (R$)</Label>
                                <Input type="number" step="0.01" value={minOrderAmount} onChange={(e: any) => setMinOrderAmount(e.target.value)} placeholder="0,00" className="bg-white/60" />
                                <p className="text-xs text-muted-foreground">Valor mínimo para finalizar um pedido</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Prazo de Entrega (dias)</Label>
                                <Input type="number" value={defaultDeliveryDays} onChange={(e: any) => setDefaultDeliveryDays(e.target.value)} placeholder="30" className="bg-white/60" />
                                <p className="text-xs text-muted-foreground">Prazo padrão de entrega em dias úteis</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Visibility */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-heading)] flex items-center gap-2">
                            <Eye className="h-5 w-5 text-bronze" />
                            Visibilidade
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Mostrar preços para clientes não aprovados</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Se ativado, clientes pendentes poderão ver os preços dos produtos
                                </p>
                            </div>
                            <Switch checked={showPricesToUnapproved} onCheckedChange={setShowPricesToUnapproved} />
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Save Button (mobile) */}
            <div className="sm:hidden">
                <Button className="w-full h-12 gradient-navy border-0 text-white text-base gap-2" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                    Salvar Configurações
                </Button>
            </div>
        </div>
    )
}
