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

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const supabase = createClient()
                const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
                if (data) setSettings(data)
            } catch { /* silent */ }
        }
        loadSettings()
    }, [])

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema) as any,
        defaultValues: {
            email: '',
            password: ''
        }
    })

    const { register, handleSubmit, formState: { errors } } = form

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
                toast.success('Login realizado com sucesso!')
                router.push(result.redirectUrl)
                // Do not turn off loading here to prevent flickering while redirecting
            }
        } catch {
            toast.error('Erro inesperado na conexão com o servidor. Tente novamente.')
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
                <CardHeader className="text-center space-y-4 pb-2">
                    {/* Logo */}
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto flex justify-center w-full"
                    >
                        {settings?.logo_url ? (
                            <div className="h-16 w-48 relative shrink-0">
                                <Image priority src={settings.logo_url} alt={settings.system_name || 'Login'} fill className="object-contain object-center" />
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
                            {settings?.system_name || 'CDJWE Estofados'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Portal B2B — Acesse sua conta
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    <form onSubmit={handleSubmit(handleLogin)} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="seu@email.com"
                                disabled={loading}
                                className={`h-11 bg-white/60 ${errors.email ? 'border-red-500' : ''}`}
                                {...register('email')}
                            />
                            {errors.email && (
                                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Senha</Label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs text-bronze hover:text-bronze-dark transition-colors"
                                >
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
                            {errors.password && (
                                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 gradient-navy border-0 text-white text-base mt-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    <LogIn className="h-5 w-5 mr-2" />
                                    Entrar
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-muted-foreground">
                            Ainda não tem conta?{' '}
                            <Link
                                href="/register"
                                className="font-medium text-primary hover:underline"
                            >
                                Cadastre-se
                            </Link>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
