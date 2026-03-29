'use client'

import { useMemo, useState } from 'react'
import { Key, Copy, Loader2, MessageCircle, Mail, Eye, EyeOff, RefreshCw, Building2, AtSign, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { generateCustomerPassword, setCustomerPassword, sendAccessLink, promoteCustomerToDriver } from '../actions'
import { toast } from 'sonner'
import type { CustomerWithStore } from './CustomerList'
import { getPrimaryCustomerAccessIdentifier, hasRealCustomerEmail, normalizeEmail } from '@/lib/customers/access'

interface CustomerAccessTabProps {
    customer: CustomerWithStore
    onRoleUpdated?: (role: 'driver') => void
}

export function CustomerAccessTab({ customer, onRoleUpdated }: CustomerAccessTabProps) {
    const [password, setPassword] = useState('')
    const [customPassword, setCustomPassword] = useState('')
    const [showPassword, setShowPassword] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [settingPassword, setSettingPassword] = useState(false)
    const [sendingLink, setSendingLink] = useState(false)
    const [promotingToDriver, setPromotingToDriver] = useState(false)

    const store = customer?.stores?.[0]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'
    const loginUrl = `${appUrl}/login`
    const hasRealEmail = hasRealCustomerEmail(customer?.email)
    const customerEmail = hasRealEmail ? normalizeEmail(customer?.email) : ''
    
    const primaryIdentifier = useMemo(
        () =>
            getPrimaryCustomerAccessIdentifier({
                cnpj: store?.cnpj,
                email: hasRealEmail ? customer?.email : null,
            }),
        [customer?.email, hasRealEmail, store?.cnpj]
    )
    const isDriver = customer?.role === 'driver'

    const handleGenerate = async () => {
        if (!customer) return
        setGenerating(true)
        try {
            const result = await generateCustomerPassword(customer.id)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else if ('password' in result && result.password) {
                setPassword(result.password)
                toast.success('Senha gerada com sucesso!')
            }
        } finally {
            setGenerating(false)
        }
    }

    const handleSetCustomPassword = async () => {
        if (!customer || !customPassword) return
        if (customPassword.length < 6) {
            toast.error('A senha deve ter no minimo 6 caracteres')
            return
        }
        setSettingPassword(true)
        try {
            const result = await setCustomerPassword(customer.id, customPassword)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                setPassword(customPassword)
                toast.success('Senha definida com sucesso!')
                setCustomPassword('')
            }
        } finally {
            setSettingPassword(false)
        }
    }

    const handleCopyCredentials = () => {
        const text = [
            `Link de acesso: ${loginUrl}`,
            `Acesso principal (CNPJ): ${primaryIdentifier || 'Nao informado'}`,
            hasRealEmail ? `Acesso alternativo (e-mail): ${customerEmail}` : 'E-mail do cliente ainda pendente de cadastro',
            password ? `Senha: ${password}` : null,
        ]
            .filter(Boolean)
            .join('\n')

        navigator.clipboard.writeText(text)
        toast.success('Credenciais copiadas!')
    }

    const handleSendWhatsApp = async () => {
        if (!customer) return
        setSendingLink(true)
        try {
            const result = await sendAccessLink(customer.id, 'whatsapp', password || undefined)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else if ('whatsappUrl' in result && result.whatsappUrl) {
                window.open(result.whatsappUrl, '_blank')
                toast.success('WhatsApp aberto com a mensagem!')
            }
        } finally {
            setSendingLink(false)
        }
    }

    const handleSendEmail = async () => {
        if (!customer) return
        setSendingLink(true)
        try {
            const result = await sendAccessLink(customer.id, 'email', password || undefined)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success('Email de acesso enviado com sucesso!')
            }
        } finally {
            setSendingLink(false)
        }
    }

    const handlePromoteToDriver = async () => {
        if (!customer || isDriver) return
        setPromotingToDriver(true)
        try {
            const result = await promoteCustomerToDriver(customer.id)
            if ('error' in result && result.error) {
                toast.error(result.error)
                return
            }

            toast.success('Cliente definido como motorista com sucesso!')
            onRoleUpdated?.('driver')
        } finally {
            setPromotingToDriver(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-4 rounded-xl bg-slate-50/80 p-5 border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-navy">
                    <Key className="h-5 w-5" />
                    <h3 className="font-heading font-semibold text-lg">Acesso ao Catálogo e Pedidos</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Link de acesso (App)</Label>
                        <p className="truncate rounded-md border bg-white px-3 py-2 font-mono text-sm shadow-sm">{loginUrl}</p>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 mt-2">
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Acesso Principal</Label>
                        <div className="rounded-md border bg-white px-3 py-2.5 shadow-sm">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <Building2 className="h-3.5 w-3.5" />
                                CNPJ
                            </div>
                            <p className="font-mono text-sm font-medium text-navy">{primaryIdentifier || 'Nao informado'}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground font-medium">Acesso Alternativo</Label>
                        <div className="rounded-md border bg-white px-3 py-2.5 shadow-sm">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <AtSign className="h-3.5 w-3.5" />
                                E-mail
                            </div>
                            {hasRealEmail ? (
                                <p className="break-all font-mono text-sm font-medium text-navy">{customerEmail}</p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                        E-mail pendente
                                    </Badge>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {password && (
                    <div className="space-y-1 mt-2">
                        <Label className="text-xs text-muted-foreground font-medium">Senha em Tela</Label>
                        <div className="flex items-center gap-2">
                            <p className="flex-1 rounded-md border border-green-200 bg-green-50 px-3 py-2 font-mono text-sm font-medium text-green-800 shadow-sm">
                                {showPassword ? password : '••••••••'}
                            </p>
                            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                )}

                <div className="pt-2">
                    <Button variant="outline" onClick={handleCopyCredentials} className="w-full sm:w-auto gap-2 bg-white">
                        <Copy className="h-4 w-4" />
                        Copiar credenciais de acesso
                    </Button>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-4 rounded-xl border p-5 bg-white shadow-sm">
                    <div>
                        <h4 className="font-semibold text-navy text-base">Definir Senha</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Sobrescreve a senha atual do cliente instantaneamente.</p>
                    </div>
                    
                    <Button variant="outline" onClick={handleGenerate} disabled={generating} className="w-full gap-2 justify-start">
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Gerar senha aleatoria
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-muted-foreground">Ou informe uma manual</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Input
                            placeholder="Nova senha (min. 6 char)"
                            value={customPassword}
                            onChange={(e) => setCustomPassword(e.target.value)}
                            className="bg-slate-50 text-sm"
                        />
                        <Button
                            onClick={handleSetCustomPassword}
                            disabled={settingPassword || !customPassword}
                            className="gradient-navy shrink-0 border-0 text-white"
                        >
                            {settingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Definir'}
                        </Button>
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border p-5 bg-white shadow-sm">
                    <div>
                        <h4 className="font-semibold text-navy text-base">Acesso ao Painel de Motorista</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Permite que este usuario entre em <span className="font-mono">/motorista</span>.
                        </p>
                    </div>

                    {isDriver ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5" />
                            Perfil ja configurado como motorista.
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={handlePromoteToDriver}
                            disabled={promotingToDriver}
                            className="gap-2 justify-start border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        >
                            {promotingToDriver ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                            Definir como motorista
                        </Button>
                    )}
                </div>

                <div className="space-y-4 rounded-xl border p-5 bg-white shadow-sm">
                    <div>
                        <h4 className="font-semibold text-navy text-base">Enviar Acesso</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Envia link, login e senha (se gerada agora) ao cliente.</p>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <Button
                            variant="outline"
                            onClick={handleSendWhatsApp}
                            disabled={sendingLink}
                            className="gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 justify-start"
                        >
                            {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                            Enviar por WhatsApp
                        </Button>
                        <Button 
                            variant="outline" 
                            onClick={handleSendEmail} 
                            disabled={sendingLink || !hasRealEmail} 
                            className="gap-2 justify-start"
                        >
                            {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                            Enviar por E-mail
                        </Button>
                    </div>
                    
                    {!hasRealEmail && (
                        <p className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                            E-mail indisponivel pois o cliente possui um endereco gerado automaticamente.
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
