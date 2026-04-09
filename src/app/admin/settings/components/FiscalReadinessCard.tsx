'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ArrowRight,
    ShieldCheck,
    Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

interface ReadinessItem {
    key: string
    label: string
    status: 'ok' | 'missing' | 'warning'
    href: string
}

export function FiscalReadinessCard() {
    const [items, setItems] = useState<ReadinessItem[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()

            const [settingsRes, profileRes, envRes, certRes] = await Promise.all([
                supabase.from('system_settings').select('cnpj, razao_social').limit(1).maybeSingle(),
                supabase.from('company_fiscal_profile').select('*').limit(1).maybeSingle(),
                supabase.from('company_fiscal_environment').select('*').limit(1).maybeSingle(),
                supabase.from('company_certificate_config').select('*').limit(1).maybeSingle(),
            ])

            const profile = profileRes.data
            const env = envRes.data
            const cert = certRes.data
            const settings = settingsRes.data

            const checks: ReadinessItem[] = [
                {
                    key: 'razao_social',
                    label: 'Razão Social preenchida',
                    status: profile?.razao_social?.trim() ? 'ok' : 'missing',
                    href: '/admin/settings/fiscal-emitente',
                },
                {
                    key: 'cnpj',
                    label: 'CNPJ válido (14 dígitos)',
                    status: (profile?.cnpj || '').replace(/\D/g, '').length === 14
                        ? 'ok'
                        : (settings?.cnpj || '').replace(/\D/g, '').length === 14
                            ? 'warning'
                            : 'missing',
                    href: '/admin/settings/fiscal-emitente',
                },
                {
                    key: 'ie',
                    label: 'Inscrição Estadual',
                    status: profile?.inscricao_estadual?.trim() ? 'ok'
                        : profile?.indicador_contribuinte === 'exempt' ? 'ok'
                        : 'missing',
                    href: '/admin/settings/fiscal-emitente',
                },
                {
                    key: 'regime',
                    label: 'Regime Tributário definido',
                    status: profile?.regime_tributario ? 'ok' : 'missing',
                    href: '/admin/settings/fiscal-emitente',
                },
                {
                    key: 'endereco',
                    label: 'Endereço fiscal completo',
                    status: profile?.fiscal_city && profile?.fiscal_state ? 'ok' : 'missing',
                    href: '/admin/settings/fiscal-emitente',
                },
                {
                    key: 'ambiente',
                    label: 'Ambiente fiscal configurado',
                    status: env?.ambiente ? 'ok' : 'missing',
                    href: '/admin/settings/fiscal-ambiente',
                },
                {
                    key: 'certificado',
                    label: 'Certificado digital válido',
                    status: cert?.is_active && cert?.certificate_status === 'active' ? 'ok'
                        : cert?.certificate_status === 'expired' ? 'warning'
                        : 'missing',
                    href: '/admin/settings/fiscal-certificado',
                },
            ]

            setItems(checks)
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <Card className="glass-card border-0">
                <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Verificando prontidão fiscal...</span>
                </CardContent>
            </Card>
        )
    }

    const completedCount = items.filter(i => i.status === 'ok').length
    const totalCount = items.length
    const percentage = Math.round((completedCount / totalCount) * 100)
    const isComplete = completedCount === totalCount

    return (
        <Card className="glass-card border-0 overflow-hidden">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-heading flex items-center gap-2">
                    <ShieldCheck className={`h-5 w-5 ${isComplete ? 'text-emerald-500' : 'text-amber-500'}`} />
                    Prontidão Fiscal
                    <span className={`ml-auto text-sm font-normal px-2.5 py-0.5 rounded-full ${
                        isComplete
                            ? 'bg-emerald-50 text-emerald-700'
                            : percentage >= 50
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700'
                    }`}>
                        {completedCount}/{totalCount}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`absolute inset-y-0 left-0 rounded-full ${
                            isComplete
                                ? 'bg-linear-to-r from-emerald-400 to-emerald-500'
                                : percentage >= 50
                                    ? 'bg-linear-to-r from-amber-400 to-amber-500'
                                    : 'bg-linear-to-r from-red-400 to-red-500'
                        }`}
                    />
                    {!isComplete && (
                        <motion.div
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className={`absolute inset-y-0 left-0 rounded-full opacity-30 ${
                                percentage >= 50
                                    ? 'bg-linear-to-r from-amber-300 to-amber-400'
                                    : 'bg-linear-to-r from-red-300 to-red-400'
                            }`}
                            style={{ width: `${percentage}%` }}
                        />
                    )}
                </div>

                {/* Items List */}
                <div className="space-y-1.5">
                    {items.map((item) => (
                        <div
                            key={item.key}
                            className="flex items-center gap-2.5 py-1.5 group"
                        >
                            {item.status === 'ok' ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            ) : item.status === 'warning' ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            ) : (
                                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                            )}
                            <span className={`text-sm flex-1 ${
                                item.status === 'ok' ? 'text-muted-foreground' : 'text-foreground font-medium'
                            }`}>
                                {item.label}
                            </span>
                            {item.status !== 'ok' && (
                                <Link
                                    href={item.href}
                                    className="text-xs text-bronze hover:text-bronze/80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Configurar
                                    <ArrowRight className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                    ))}
                </div>

                {isComplete && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Empresa apta para emissão fiscal!
                    </motion.div>
                )}
            </CardContent>
        </Card>
    )
}
