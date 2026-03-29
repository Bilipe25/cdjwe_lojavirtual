'use client'

import { useMemo, useState } from 'react'
import { Key, Copy, Loader2, MessageCircle, Mail, Eye, EyeOff, RefreshCw, Building2, AtSign, Truck } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { generateCustomerPassword, setCustomerPassword, sendAccessLink, promoteCustomerToDriver } from '../actions'
import { toast } from 'sonner'
import type { CustomerWithStore } from './CustomerList'
import { getPrimaryCustomerAccessIdentifier, hasRealCustomerEmail, normalizeEmail } from '@/lib/customers/access'

interface CustomerAccessModalProps {
    customer: CustomerWithStore | null
    isOpen: boolean
    onClose: () => void
}

export function CustomerAccessModal({ customer, isOpen, onClose }: CustomerAccessModalProps) {
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
        } finally {
            setPromotingToDriver(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading flex items-center gap-2 text-xl">
                        <Key className="h-5 w-5 text-bronze" />
                        Acesso do cliente
                    </DialogTitle>
                    <DialogDescription>
                        {customer?.full_name} - {store?.company_name}
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-2 space-y-5">
                    <div className="space-y-3 rounded-lg bg-slate-50 p-4">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Link de acesso</Label>
                            <p className="truncate rounded border bg-white px-2 py-1.5 font-mono text-sm">{loginUrl}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Acesso principal</Label>
                                <div className="rounded border bg-white px-2 py-2 text-sm">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Building2 className="h-3.5 w-3.5" />
                                        CNPJ
                                    </div>
                                    <p className="mt-1 font-mono">{primaryIdentifier || 'Nao informado'}</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Acesso alternativo</Label>
                                <div className="rounded border bg-white px-2 py-2 text-sm">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <AtSign className="h-3.5 w-3.5" />
                                        E-mail
                                    </div>
                                    {hasRealEmail ? (
                                        <p className="mt-1 break-all font-mono">{customerEmail}</p>
                                    ) : (
                                        <div className="mt-1 flex items-center gap-2">
                                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                                E-mail pendente
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">Cliente ainda sem e-mail real.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {password && (
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Senha atual</Label>
                                <div className="flex items-center gap-2">
                                    <p className="flex-1 rounded border bg-white px-2 py-1.5 font-mono text-sm">
                                        {showPassword ? password : '••••••••'}
                                    </p>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <p className="text-xs leading-5 text-muted-foreground">
                            O cliente pode acessar principalmente com o CNPJ. Se um e-mail real for cadastrado depois, ele passa a funcionar como acesso alternativo.
                        </p>

                        <Button variant="outline" size="sm" onClick={handleCopyCredentials} className="mt-2 w-full gap-2">
                            <Copy className="h-4 w-4" />
                            Copiar credenciais
                        </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Acesso ao painel de motorista</h4>
                        {isDriver ? (
                            <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-700 flex items-center gap-2">
                                <Truck className="h-3.5 w-3.5" />
                                Perfil ja configurado como motorista.
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={handlePromoteToDriver}
                                disabled={promotingToDriver}
                                className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                            >
                                {promotingToDriver ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                                Definir como motorista
                            </Button>
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Definir senha</h4>
                        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating} className="w-full gap-2">
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Gerar senha aleatoria
                        </Button>

                        <div className="flex gap-2">
                            <Input
                                placeholder="Ou defina uma senha..."
                                value={customPassword}
                                onChange={(e) => setCustomPassword(e.target.value)}
                                className="bg-white/60 text-sm"
                            />
                            <Button
                                size="sm"
                                onClick={handleSetCustomPassword}
                                disabled={settingPassword || !customPassword}
                                className="gradient-navy shrink-0 border-0 text-white"
                            >
                                {settingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Definir'}
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Enviar acesso</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                onClick={handleSendWhatsApp}
                                disabled={sendingLink}
                                className="gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                            >
                                {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                WhatsApp
                            </Button>
                            <Button variant="outline" onClick={handleSendEmail} disabled={sendingLink || !hasRealEmail} className="gap-2">
                                {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                E-mail
                            </Button>
                        </div>
                        {!hasRealEmail && (
                            <p className="text-xs text-muted-foreground">
                                O envio por e-mail fica disponivel assim que o cliente receber um e-mail real no cadastro.
                            </p>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
