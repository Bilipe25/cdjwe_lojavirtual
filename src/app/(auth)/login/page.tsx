'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            toast.error('Preencha todos os campos')
            return
        }

        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.signInWithPassword({ email, password })

            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    toast.error('Email ou senha incorretos')
                } else {
                    toast.error(error.message)
                }
                return
            }

            // Check user role to redirect properly
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, status')
                .single()

            if (profile?.role === 'admin') {
                router.push('/admin/dashboard')
            } else if (profile?.status === 'pending') {
                router.push('/pending-approval')
            } else if (profile?.status === 'blocked') {
                router.push('/blocked')
            } else {
                router.push('/catalog')
            }

            toast.success('Login realizado com sucesso!')
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
            className="w-full max-w-md"
        >
            <Card className="glass-card border-0 shadow-xl">
                <CardHeader className="text-center space-y-4 pb-2">
                    {/* Logo */}
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto h-16 w-16 rounded-2xl gradient-bronze flex items-center justify-center shadow-lg"
                    >
                        <span className="text-white font-bold text-2xl font-[family-name:var(--font-heading)]">CJ</span>
                    </motion.div>
                    <div>
                        <CardTitle className="text-2xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                            CDJWE Estofados
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Portal B2B — Acesse sua conta
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="seu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                className="h-11 bg-white/60"
                            />
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
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
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

                        <Button
                            type="submit"
                            className="w-full h-11 gradient-navy border-0 text-white text-base"
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
