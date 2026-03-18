'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginFormData } from './schema'
import { loginAction } from './actions'

export default function LoginPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)
    const [lastLogin] = useState<{ companyName: string; identifier: string } | null>(() => {
        if (typeof window === 'undefined') return null

        const savedLogin = window.localStorage.getItem('last_b2b_login')
        if (!savedLogin) return null

        try {
            const parsed = JSON.parse(savedLogin) as { companyName?: string; identifier?: string }
            if (!parsed.identifier) return null

            return {
                companyName: parsed.companyName || 'Cliente',
                identifier: parsed.identifier,
            }
        } catch {
            return null
        }
    })
    const [useDifferentAccount, setUseDifferentAccount] = useState(false)

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const supabase = createClient()
                const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
                if (data) setSettings(data)
            } catch {
                // silent
            }
        }

        loadSettings()
    }, [])

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            identifier: '',
            password: '',
        },
    })

    useEffect(() => {
        if (lastLogin && !useDifferentAccount) {
            form.setValue('identifier', lastLogin.identifier)
        }
    }, [lastLogin, useDifferentAccount, form])

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = form

    const handleLogin = async (data: LoginFormData) => {
        setLoading(true)

        try {
            const result = await loginAction(data)

            if (result.error) {
                toast.error(result.error)
                setLoading(false)
                return
            }

            if (result.success && result.redirectUrl) {
                if (result.companyName && result.identifier) {
                    localStorage.setItem(
                        'last_b2b_login',
                        JSON.stringify({
                            companyName: result.companyName,
                            identifier: result.identifier,
                        })
                    )
                }
                toast.success('Login realizado com sucesso!')
                router.push(result.redirectUrl)
            }
        } catch {
            toast.error('Erro inesperado na conexao com o servidor. Tente novamente.')
            setLoading(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
        >
            <Card className="glass-card border-0 shadow-xl">
                <CardHeader className="space-y-4 pb-2 text-center">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto flex w-full justify-center"
                    >
                        {settings?.logo_url ? (
                            <div className="relative h-16 w-48 shrink-0">
                                <Image
                                    priority
                                    src={settings.logo_url}
                                    alt={settings.system_name || 'Login'}
                                    fill
                                    className="object-contain object-center"
                                />
                            </div>
                        ) : (
                            <div className="gradient-bronze flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg">
                                <span className="font-heading text-2xl font-bold text-white">
                                    {settings?.system_name ? settings.system_name.substring(0, 2).toUpperCase() : 'CJ'}
                                </span>
                            </div>
                        )}
                    </motion.div>
                    <div>
                        <CardTitle className="font-heading text-2xl font-bold text-gradient-navy">
                            {settings?.system_name || 'CDJWE Estofados'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Portal B2B
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    <form onSubmit={handleSubmit(handleLogin)} className="space-y-4">
                        {lastLogin && !useDifferentAccount ? (
                            <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50 p-3 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="gradient-navy flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm">
                                        {lastLogin.companyName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="truncate text-sm font-semibold text-navy" title={lastLogin.companyName}>
                                            {lastLogin.companyName}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground" title={lastLogin.identifier}>
                                            Acesso principal: {lastLogin.identifier}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-navy"
                                    onClick={() => {
                                        setUseDifferentAccount(true)
                                        form.setValue('identifier', '')
                                    }}
                                >
                                    Trocar
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="identifier">CPF/CNPJ ou e-mail</Label>
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="Digite seu acesso"
                                    disabled={loading}
                                    className={`h-11 bg-white/60 ${errors.identifier ? 'border-red-500' : ''}`}
                                    {...register('identifier')}
                                />
                                {errors.identifier && <p className="mt-1 text-xs text-red-500">{errors.identifier.message}</p>}
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Senha</Label>
                                <Link href="/forgot-password" className="text-xs text-bronze transition-colors hover:text-bronze-dark">
                                    Esqueceu a senha?
                                </Link>
                            </div>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    disabled={loading}
                                    className={`h-11 bg-white/60 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                                    {...register('password')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
                        </div>

                        <Button type="submit" className="gradient-navy mt-2 h-11 w-full border-0 text-base text-white" disabled={loading}>
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="mr-2 h-5 w-5" />
                                    Entrar
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-muted-foreground">
                            Ainda nao tem conta?{' '}
                            <Link href="/register" className="font-medium text-primary hover:underline">
                                Cadastre-se
                            </Link>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
