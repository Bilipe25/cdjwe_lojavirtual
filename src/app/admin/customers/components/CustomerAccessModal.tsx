'use client'

import { useEffect, useMemo, useState } from 'react'
import { Key, Copy, Loader2, MessageCircle, Mail, Eye, EyeOff, RefreshCw, Building2, AtSign, ShieldCheck, ShieldX, UserCog } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generateCustomerPassword, setCustomerPassword, sendAccessLink, updateCustomerRoleAsAdmin, updateCustomerStatusAsAdmin } from '../actions'
import { toast } from 'sonner'
import type { CustomerWithStore } from './CustomerList'
import { getPrimaryCustomerAccessIdentifier, hasRealCustomerEmail, normalizeEmail } from '@/lib/customers/access'

type CustomerAccessRole = 'client' | 'representative' | 'driver'
type CustomerAccessStatus = 'pending' | 'approved' | 'blocked' | 'imported'

interface CustomerAccessModalProps {
    customer: CustomerWithStore | null
    isOpen: boolean
    onClose: () => void
    onAccessUpdated?: (updates: { role: CustomerAccessRole; status: CustomerAccessStatus }) => void
}

const ROLE_LABELS: Record<CustomerAccessRole, string> = {
    client: 'Cliente',
    representative: 'Representante',
    driver: 'Motorista',
}

const STATUS_LABELS: Record<CustomerAccessStatus, string> = {
    pending: 'Pendente',
    approved: 'Liberado',
    blocked: 'Bloqueado',
    imported: 'Importado',
}

export function CustomerAccessModal({ customer, isOpen, onClose, onAccessUpdated }: CustomerAccessModalProps) {
    const [password, setPassword] = useState('')
    const [customPassword, setCustomPassword] = useState('')
    const [showPassword, setShowPassword] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [settingPassword, setSettingPassword] = useState(false)
    const [sendingLink, setSendingLink] = useState(false)
    const [selectedRole, setSelectedRole] = useState<CustomerAccessRole>((customer?.role as CustomerAccessRole) || 'client')
    const [updatingRole, setUpdatingRole] = useState(false)
    const [updatingStatus, setUpdatingStatus] = useState(false)

    const store = customer?.stores?.[0]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app'
    const loginUrl = `${appUrl}/login`
    const hasRealEmail = hasRealCustomerEmail(customer?.email)
    const customerEmail = hasRealEmail ? normalizeEmail(customer?.email) : ''
    const primaryIdentifier = useMemo(
        () =>
            getPrimaryCustomerAccessIdentifier({
                document: store?.document_number,
                cnpj: store?.cnpj,
                email: hasRealEmail ? customer?.email : null,
            }),
        [customer?.email, hasRealEmail, store?.cnpj, store?.document_number]
    )

    useEffect(() => {
        setSelectedRole((customer?.role as CustomerAccessRole) || 'client')
    }, [customer?.role])

    const accessAction = useMemo(() => {
        if (!customer || customer.status === 'blocked') {
            return {
                nextStatus: 'approved' as const,
                label: customer?.status === 'blocked' ? 'Liberar acesso' : 'Aprovar acesso',
                icon: ShieldCheck,
                buttonClassName: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800',
            }
        }

        if (customer.status === 'approved') {
            return {
                nextStatus: 'blocked' as const,
                label: 'Bloquear acesso',
                icon: ShieldX,
                buttonClassName: 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800',
            }
        }

        return {
            nextStatus: 'approved' as const,
            label: 'Aprovar acesso',
            icon: ShieldCheck,
            buttonClassName: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800',
        }
    }, [customer])
    const AccessActionIcon = accessAction.icon

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
            `Acesso principal (documento): ${primaryIdentifier || 'Nao informado'}`,
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

    const handleRoleUpdate = async () => {
        if (!customer || selectedRole === customer.role) return
        setUpdatingRole(true)
        try {
            const result = await updateCustomerRoleAsAdmin(customer.id, selectedRole)
            if ('error' in result && result.error) {
                toast.error(result.error)
                return
            }

            toast.success(`Perfil alterado para ${ROLE_LABELS[selectedRole].toLowerCase()} com sucesso!`)
            onAccessUpdated?.({
                role: selectedRole,
                status: (result.status || customer.status) as CustomerAccessStatus,
            })
        } finally {
            setUpdatingRole(false)
        }
    }

    const handleToggleAccess = async () => {
        if (!customer) return
        setUpdatingStatus(true)
        try {
            const result = await updateCustomerStatusAsAdmin(customer.id, accessAction.nextStatus)
            if ('error' in result && result.error) {
                toast.error(result.error)
                return
            }

            toast.success(accessAction.nextStatus === 'blocked' ? 'Acesso bloqueado com sucesso!' : 'Acesso liberado com sucesso!')
            onAccessUpdated?.({
                role: (customer.role as CustomerAccessRole) || selectedRole,
                status: accessAction.nextStatus,
            })
        } finally {
            setUpdatingStatus(false)
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
                                        Documento
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
                                        {showPassword ? password : '********'}
                                    </p>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <p className="text-xs leading-5 text-muted-foreground">
                            O cliente pode acessar principalmente com o documento fiscal principal. Se um e-mail real for cadastrado, ele funciona como acesso alternativo.
                        </p>

                        <Button variant="outline" size="sm" onClick={handleCopyCredentials} className="mt-2 w-full gap-2">
                            <Copy className="h-4 w-4" />
                            Copiar credenciais
                        </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Perfil de acesso</h4>
                        <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as CustomerAccessRole)}>
                            <SelectTrigger className="h-10 w-full">
                                <SelectValue>{ROLE_LABELS[selectedRole]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="client">Cliente</SelectItem>
                                <SelectItem value="representative">Representante</SelectItem>
                                <SelectItem value="driver">Motorista</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            onClick={handleRoleUpdate}
                            disabled={updatingRole || !customer || selectedRole === customer.role}
                            className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        >
                            {updatingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                            Salvar perfil de acesso
                        </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Status do acesso</h4>
                        <div className="rounded border bg-slate-50 px-3 py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">Status atual</span>
                                <Badge variant="outline">
                                    {customer ? STATUS_LABELS[customer.status as CustomerAccessStatus] || customer.status : 'Nao informado'}
                                </Badge>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={handleToggleAccess}
                            disabled={updatingStatus || !customer}
                            className={`w-full gap-2 ${accessAction.buttonClassName}`}
                        >
                            {updatingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <AccessActionIcon className="h-4 w-4" />}
                            {accessAction.label}
                        </Button>
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
