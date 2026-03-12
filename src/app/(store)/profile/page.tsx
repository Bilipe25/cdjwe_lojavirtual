'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
    User, Building2, Mail, Phone, MapPin, FileText,
    Loader2, Save, ArrowLeft, LogOut
} from 'lucide-react'
import { logoutAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { ProfileSkeleton } from '@/components/ui/skeletons'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Profile, Store } from '@/lib/types'

export default function ProfilePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [store, setStore] = useState<Store | null>(null)

    // Editable fields
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')

    // Password change
    const [passwordOpen, setPasswordOpen] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordLoading, setPasswordLoading] = useState(false)

    const formatPhone = (val: string) => {
        let r = val.replace(/\D/g, '')
        if (r.length > 11) r = r.substring(0, 11)
        if (r.length > 2) r = r.replace(/^(\d{2})/, '($1) ')
        if (r.length > 9) r = r.replace(/(\d{4,5})(\d{4})/, '$1-$2')
        else if (r.length > 6) r = r.replace(/(\d{4})(\d)/, '$1-$2')
        return r
    }

    useEffect(() => {
        loadProfile()
    }, [])

    const loadProfile = async () => {
        setLoading(true)
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()

        if (profileData) {
            setProfile(profileData)
            setFullName(profileData.full_name || '')
            setPhone(profileData.phone || '')
        }

        const { data: storeData } = await supabase
            .from('stores')
            .select('*')
            .eq('profile_id', user.id)
            .single()

        if (storeData) setStore(storeData)

        setLoading(false)
    }

    const handleSave = async () => {
        if (!profile) return
        if (!fullName.trim()) {
            return toast.error('O nome completo não pode ficar vazio')
        }
        if (phone && phone.replace(/\D/g, '').length < 10) {
            return toast.error('Informe um telefone válido com DDD')
        }

        setSaving(true)
        const supabase = createClient()

        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: fullName,
                phone: phone || null,
            })
            .eq('id', profile.id)

        if (error) {
            toast.error('Erro ao salvar perfil.')
        } else {
            toast.success('Perfil atualizado com sucesso!')
            setProfile(prev => prev ? { ...prev, full_name: fullName, phone } : prev)
        }
        setSaving(false)
    }

    const handleUpdatePassword = async () => {
        if (newPassword.length < 6) return toast.error('A senha deve ter pelo menos 6 caracteres')
        if (newPassword !== confirmPassword) return toast.error('As senhas não coincidem')

        setPasswordLoading(true)
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        setPasswordLoading(false)

        if (error) {
            toast.error('Erro ao atualizar senha.')
        } else {
            toast.success('Senha atualizada com sucesso.')
            setPasswordOpen(false)
            setNewPassword('')
            setConfirmPassword('')
        }
    }

    const handleLogout = async () => {
        await logoutAction()
        router.push('/login')
    }

    if (loading) {
        return <ProfileSkeleton />
    }

    if (!profile) return null

    return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            <Button variant="ghost" className="mb-4 gap-2 hidden md:flex" onClick={() => router.push('/catalog')}>
                <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
 
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="text-2xl font-bold font-heading text-gradient-navy hidden md:block">Meu Perfil</h1>
                <p className="text-muted-foreground text-sm mt-1 md:mt-1">Gerencie seus dados pessoais e veja informações da sua loja</p>
            </motion.div>
 
            <div className="space-y-5 md:space-y-6">
                {/* Personal Info */}
                <Card className="glass-card border-0">
                    <CardHeader className="pb-4 md:pb-6">
                        <CardTitle className="text-base flex items-center gap-2">
                            <User className="h-4 w-4 text-bronze" />
                            Dados Pessoais
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0 md:pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Nome Completo</Label>
                                <Input
                                    id="fullName"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail</Label>
                                <Input
                                    id="email"
                                    value={profile.email}
                                    disabled
                                    className="bg-muted/50"
                                />
                                <p className="text-[10px] text-muted-foreground">O e-mail não pode ser alterado</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input
                                    id="phone"
                                    value={phone}
                                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="bg-white/60"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Status da Conta</Label>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className={`h-2.5 w-2.5 rounded-full ${
                                        profile.status === 'approved' ? 'bg-green-500'
                                        : profile.status === 'pending' ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`} />
                                    <span className="text-sm font-medium capitalize">
                                        {profile.status === 'approved' ? 'Aprovada'
                                        : profile.status === 'pending' ? 'Pendente'
                                        : 'Bloqueada'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4">
                            <Button 
                                variant="outline" 
                                className="text-muted-foreground h-11 sm:h-auto rounded-xl border-border/40"
                                onClick={() => setPasswordOpen(true)}
                            >
                                Alterar Senha
                            </Button>
                            
                            <Button
                                className="gradient-navy border-0 text-white gap-2 h-11 sm:h-auto rounded-xl shadow-lg shadow-navy/10"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Salvar Alterações
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Store Info */}
                {store && (
                    <Card className="glass-card border-0">
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-bronze" />
                                Dados da Loja
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InfoRow icon={Building2} label="Razão Social" value={store.company_name} />
                                {store.trade_name && <InfoRow icon={Building2} label="Nome Fantasia" value={store.trade_name} />}
                                <InfoRow icon={FileText} label="CNPJ" value={store.cnpj} />
                                {store.state_registration && <InfoRow icon={FileText} label="Inscrição Estadual" value={store.state_registration} />}
                                {store.email && <InfoRow icon={Mail} label="E-mail Comercial" value={store.email} />}
                                {store.phone && <InfoRow icon={Phone} label="Telefone Comercial" value={store.phone} />}
                            </div>

                            {(store.address || store.city) && (
                                <>
                                    <Separator className="my-4" />
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-bronze mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium">Endereço</p>
                                            <p className="text-sm text-muted-foreground">
                                                {[store.address, store.city, store.state, store.zip_code].filter(Boolean).join(', ')}
                                            </p>
                                            {store.region && (
                                                <p className="text-xs text-muted-foreground mt-0.5">Região: {store.region}</p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            <p className="text-xs text-muted-foreground mt-4 italic">
                                Para alterar dados da loja, entre em contato com o administrador.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Account Actions */}
                <Card className="glass-card border-0 border-t-4 border-t-red-500/10">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2 text-navy">
                            Ações da Conta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-red-50/50 border border-red-100/50">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-navy">Sair da Conta</p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">Encerre sua sessão atual com segurança</p>
                            </div>
                            <Button
                                variant="outline"
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 h-10 px-6 rounded-xl shrink-0 transition-colors"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Sair
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Change Password Dialog */}
            <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Alterar Senha</DialogTitle>
                        <DialogDescription>
                            Digite sua nova senha abaixo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nova Senha</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirme a nova senha"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancelar</Button>
                        <Button onClick={handleUpdatePassword} disabled={passwordLoading} className="gradient-navy border-0 text-white">
                            {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar Senha'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
            </div>
        </div>
    )
}
