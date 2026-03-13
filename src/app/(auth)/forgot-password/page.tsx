'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { requestPasswordReset } from './actions'

export default function ForgotPasswordPage() {
    const [identifier, setIdentifier] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [maskedEmail, setMaskedEmail] = useState('')
    const [settings, setSettings] = useState<{ logo_url?: string | null; system_name?: string } | null>(null)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('logo_url, system_name').limit(1).single()
            if (data) setSettings(data)
        }
        load()
    }, [])

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!identifier) {
            toast.error('Informe seu E-mail ou CNPJ')
            return
        }

        setLoading(true)
        try {
            const res = await requestPasswordReset(identifier, window.location.origin)

            if (res.error) {
                toast.error(res.error)
                return
            }

            if (res.maskedEmail) {
                setMaskedEmail(res.maskedEmail)
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
                        className="mx-auto flex justify-center w-full"
                    >
                        {sent ? (
                            <div className="h-16 w-16 rounded-2xl bg-green-500 flex items-center justify-center shadow-lg shrink-0">
                                <CheckCircle className="text-white h-8 w-8" />
                            </div>
                        ) : settings?.logo_url ? (
                            <div className="h-16 w-48 relative shrink-0">
                                <Image priority src={settings.logo_url} alt={settings.system_name || 'Auth'} fill className="object-contain object-center" />
                            </div>
                        ) : (
                            <div className="h-16 w-16 rounded-2xl gradient-bronze flex items-center justify-center shadow-lg shrink-0">
                                <Mail className="text-white h-8 w-8" />
                            </div>
                        )}
                    </motion.div>
                    <div>
                        <CardTitle className="text-2xl font-bold font-heading text-gradient-navy">
                            {sent ? 'Email Enviado!' : (settings?.system_name || 'Recuperar Senha')}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {sent
                                ? 'Verifique a caixa de entrada para seguir as instruções.'
                                : 'Informe seu E-mail ou CNPJ para receber o link de recuperação.'}
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    {sent ? (
                        <div className="space-y-4">
                            <div className="rounded-lg bg-primary/5 p-4 text-sm text-center">
                                <p className="text-muted-foreground">
                                    Enviamos um link de recuperação{maskedEmail ? ` para o e-mail associado:` : '.'}
                                    {maskedEmail && <span className="block font-medium text-foreground mt-1">{maskedEmail}</span>}
                                </p>
                                <p className="text-muted-foreground text-xs mt-2">
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
                                <Label htmlFor="identifier">E-mail ou CNPJ</Label>
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="seu@email.com ou 00.000.../0001-00"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
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
