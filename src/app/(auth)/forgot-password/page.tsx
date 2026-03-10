'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email) {
            toast.error('Informe seu email')
            return
        }

        setLoading(true)
        try {
            const supabase = createClient()
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            })

            if (error) {
                toast.error(error.message)
                return
            }

            setSent(true)
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
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto h-16 w-16 rounded-2xl gradient-bronze flex items-center justify-center shadow-lg"
                    >
                        {sent ? (
                            <CheckCircle className="text-white h-8 w-8" />
                        ) : (
                            <Mail className="text-white h-8 w-8" />
                        )}
                    </motion.div>
                    <div>
                        <CardTitle className="text-2xl font-bold font-[family-name:var(--font-heading)] text-gradient-navy">
                            {sent ? 'Email Enviado!' : 'Recuperar Senha'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {sent
                                ? 'Verifique sua caixa de entrada e siga as instruções.'
                                : 'Informe seu email para receber o link de recuperação.'}
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    {sent ? (
                        <div className="space-y-4">
                            <div className="rounded-lg bg-primary/5 p-4 text-sm text-center">
                                <p className="text-muted-foreground">
                                    Enviamos um link de recuperação para{' '}
                                    <span className="font-medium text-foreground">{email}</span>.
                                    Caso não encontre, verifique a pasta de spam.
                                </p>
                            </div>
                            <Link href="/login">
                                <Button variant="outline" className="w-full h-11">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Voltar ao Login
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
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

                            <Button
                                type="submit"
                                className="w-full h-11 gradient-navy border-0 text-white text-base"
                                disabled={loading}
                            >
                                {loading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    'Enviar Link'
                                )}
                            </Button>

                            <Link href="/login" className="block">
                                <Button variant="ghost" className="w-full" type="button">
                                    <ArrowLeft className="h-4 w-4 mr-2" />
                                    Voltar ao Login
                                </Button>
                            </Link>
                        </form>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    )
}
