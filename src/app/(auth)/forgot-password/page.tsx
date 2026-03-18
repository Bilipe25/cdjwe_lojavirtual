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
            toast.error('Informe seu CPF, CNPJ ou e-mail')
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
                <CardHeader className="space-y-4 pb-2 text-center">
                    <motion.div
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="mx-auto flex w-full justify-center"
                    >
                        {sent ? (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-green-500 shadow-lg">
                                <CheckCircle className="h-8 w-8 text-white" />
                            </div>
                        ) : settings?.logo_url ? (
                            <div className="relative h-16 w-48 shrink-0">
                                <Image
                                    priority
                                    src={settings.logo_url}
                                    alt={settings.system_name || 'Auth'}
                                    fill
                                    className="object-contain object-center"
                                />
                            </div>
                        ) : (
                            <div className="gradient-bronze flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl shadow-lg">
                                <Mail className="h-8 w-8 text-white" />
                            </div>
                        )}
                    </motion.div>
                    <div>
                        <CardTitle className="font-heading text-2xl font-bold text-gradient-navy">
                            {sent ? 'Email enviado!' : settings?.system_name || 'Recuperar senha'}
                        </CardTitle>
                        <CardDescription className="mt-1">
                            {sent
                                ? 'Verifique sua caixa de entrada para seguir as instrucoes.'
                                : 'Informe seu CPF, CNPJ ou e-mail para receber o link de recuperacao.'}
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="pt-4">
                    {sent ? (
                        <div className="space-y-4">
                            <div className="rounded-lg bg-primary/5 p-4 text-center text-sm">
                                <p className="text-muted-foreground">
                                    Enviamos um link de recuperacao{maskedEmail ? ' para o e-mail associado:' : '.'}
                                    {maskedEmail && <span className="mt-1 block font-medium text-foreground">{maskedEmail}</span>}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">Caso nao encontre, verifique a pasta de spam.</p>
                            </div>
                            <Link href="/login">
                                <Button variant="outline" className="h-11 w-full">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Voltar ao login
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleReset} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="identifier">CPF/CNPJ ou e-mail</Label>
                                <Input
                                    id="identifier"
                                    type="text"
                                    placeholder="000.000.000-00, 00.000.000/0001-00 ou seu@email.com"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    disabled={loading}
                                    className="h-11 bg-white/60"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Se a conta ainda estiver com e-mail provisório, o acesso continua sendo feito pelo CPF/CNPJ com a senha definida pelo admin.
                                </p>
                            </div>

                            <Button type="submit" className="gradient-navy h-11 w-full border-0 text-base text-white" disabled={loading}>
                                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enviar link'}
                            </Button>

                            <Link href="/login" className="block">
                                <Button variant="ghost" className="w-full" type="button">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Voltar ao login
                                </Button>
                            </Link>
                        </form>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    )
}
