'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Eye, EyeOff, UserPlus, Loader2, Building2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function RegisterPage() {
    const router = useRouter()
    const [step, setStep] = useState(1) // 1 = personal, 2 = company
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
            if (data) setSettings(data)
        }
        load()
    }, [])

    // Step 1 — Personal
    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [phone, setPhone] = useState('')

    // Step 2 — Company
    const [companyName, setCompanyName] = useState('')
    const [tradeName, setTradeName] = useState('')
    const [cnpj, setCnpj] = useState('')
    const [stateRegistration, setStateRegistration] = useState('')
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')
    const [state, setState] = useState('')
    const [zipCode, setZipCode] = useState('')

    const handleNextStep = () => {
        if (!fullName || !email || !password) {
            toast.error('Preencha todos os campos obrigatórios')
            return
        }
        if (password.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres')
            return
        }
        setStep(2)
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        const normalizedDocument = cnpj.replace(/\D/g, '')
        if (!companyName || !normalizedDocument) {
            toast.error('Preencha o nome da empresa e o documento fiscal')
            return
        }
        const inferredDocumentType = normalizedDocument.length === 11 ? 'CPF' : 'CNPJ'
        const inferredPersonType = inferredDocumentType === 'CPF' ? 'individual' : 'legal_entity'

        setLoading(true)
        try {
            const supabase = createClient()

            // Create auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        role: 'client',
                    },
                },
            })

            if (authError) {
                if (authError.message.includes('already registered')) {
                    toast.error('Este email já está cadastrado')
                } else {
                    toast.error(authError.message)
                }
                return
            }

            if (!authData.user) {
                toast.error('Erro ao criar conta')
                return
            }

            // Update profile with phone
            await supabase
                .from('profiles')
                .update({ phone, full_name: fullName })
                .eq('id', authData.user.id)

            // Create store
            await supabase.from('stores').insert({
                profile_id: authData.user.id,
                company_name: companyName,
                trade_name: tradeName || null,
                cnpj: normalizedDocument,
                person_type: inferredPersonType,
                document_type: inferredDocumentType,
                document_number: normalizedDocument,
                state_registration: stateRegistration || null,
                address: address || null,
                city: city || null,
                state: state || null,
                zip_code: zipCode || null,
                email,
                phone: phone || null,
            })

            // Notify admin via email (fire-and-forget)
            fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'new_registration',
                    payload: {
                        clientName: fullName,
                        clientEmail: email,
                        companyName,
                        cnpj: normalizedDocument,
                    },
                }),
            }).catch(() => {}) // Silent fail - registration should not be blocked by email

            toast.success('Cadastro realizado com sucesso!')
            router.push('/pending-approval')
        } catch {
            toast.error('Erro inesperado. Tente novamente.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-lg"
        >
            <Card className="glass-card border-0 shadow-xl">
                <CardHeader className="text-center space-y-4 pb-2">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto flex justify-center w-full"
                    >
                        {settings?.logo_url ? (
                            <div className="h-16 w-48 relative shrink-0">
                                <Image priority src={settings.logo_url} alt={settings.system_name || 'Register'} fill className="object-contain object-center" />
                            </div>
                        ) : (
                            <div className="h-16 w-16 rounded-2xl gradient-bronze flex items-center justify-center shadow-lg shrink-0">
                                <span className="text-white font-bold text-2xl font-heading">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                        )}
                    </motion.div>
                    <div>
                        <CardTitle className="text-2xl font-bold font-heading text-gradient-navy">
                            {settings?.system_name || 'Criar Conta'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {step === 1 ? 'Dados pessoais e de acesso' : 'Dados da empresa'}
                        </CardDescription>
                    </div>

                    {/* Step Indicator */}
                    <div className="flex items-center justify-center gap-2 pt-2">
                        <div className={`h-2 w-12 rounded-full transition-colors ${step >= 1 ? 'gradient-bronze' : 'bg-muted'}`} />
                        <div className={`h-2 w-12 rounded-full transition-colors ${step >= 2 ? 'gradient-bronze' : 'bg-muted'}`} />
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    <form onSubmit={step === 2 ? handleRegister : (e) => { e.preventDefault(); handleNextStep(); }}>
                        {step === 1 ? (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-4"
                            >
                                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs leading-5 text-muted-foreground">
                                    O acesso principal da sua conta sera pelo <strong>documento fiscal (CPF/CNPJ)</strong> apos a aprovacao. O e-mail informado abaixo continuara como acesso alternativo e canal de comunicacao.
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Nome Completo *</Label>
                                    <Input
                                        id="fullName"
                                        placeholder="Seu nome completo"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="h-11 bg-white/60"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email de contato *</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-11 bg-white/60"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="password">Senha *</Label>
                                    <div className="relative">
                                        <Input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Mínimo 6 caracteres"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="h-11 bg-white/60 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Telefone</Label>
                                    <Input
                                        id="phone"
                                        placeholder="(00) 00000-0000"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="h-11 bg-white/60"
                                    />
                                </div>

                                <Button type="submit" className="w-full h-11 gradient-navy border-0 text-white text-base">
                                    Continuar
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="space-y-4"
                            >
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Building2 className="h-4 w-4" />
                                    <span className="text-sm font-medium">Dados da Empresa</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="companyName">Razão Social *</Label>
                                        <Input
                                            id="companyName"
                                            placeholder="Razão social da empresa"
                                            value={companyName}
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="tradeName">Nome Fantasia</Label>
                                        <Input
                                            id="tradeName"
                                            placeholder="Nome fantasia"
                                            value={tradeName}
                                            onChange={(e) => setTradeName(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>

                                <div className="space-y-2">
                                    <Label htmlFor="cnpj">Documento Fiscal (CPF/CNPJ) *</Label>
                                    <Input
                                        id="cnpj"
                                        placeholder="Somente numeros ou formatado"
                                            value={cnpj}
                                        onChange={(e) => setCnpj(e.target.value)}
                                        className="h-11 bg-white/60"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Este sera o identificador principal para entrar no portal apos a aprovacao do cadastro.
                                    </p>
                                </div>

                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="stateReg">Inscrição Estadual</Label>
                                        <Input
                                            id="stateReg"
                                            placeholder="Inscrição estadual"
                                            value={stateRegistration}
                                            onChange={(e) => setStateRegistration(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    <span className="text-sm font-medium">Endereço</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2 sm:col-span-2">
                                        <Label htmlFor="address">Endereço</Label>
                                        <Input
                                            id="address"
                                            placeholder="Rua, número"
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="city">Cidade</Label>
                                        <Input
                                            id="city"
                                            placeholder="Cidade"
                                            value={city}
                                            onChange={(e) => setCity(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="state">Estado</Label>
                                        <Input
                                            id="state"
                                            placeholder="UF"
                                            value={state}
                                            onChange={(e) => setState(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="zipCode">CEP</Label>
                                        <Input
                                            id="zipCode"
                                            placeholder="00000-000"
                                            value={zipCode}
                                            onChange={(e) => setZipCode(e.target.value)}
                                            className="h-11 bg-white/60"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1 h-11"
                                        onClick={() => setStep(1)}
                                        disabled={loading}
                                    >
                                        Voltar
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="flex-1 h-11 gradient-navy border-0 text-white text-base"
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <>
                                                <UserPlus className="h-5 w-5 mr-2" />
                                                Cadastrar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-muted-foreground">
                            Já tem conta?{' '}
                            <Link href="/login" className="font-medium text-primary hover:underline">
                                Entrar
                            </Link>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
