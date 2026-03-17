'use client'

import { motion } from 'framer-motion'
import { Clock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PendingApprovalPage() {
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="gradient-hero flex min-h-screen items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="glass-card border-0 shadow-xl">
                    <CardHeader className="space-y-4 text-center">
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                            className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-100"
                        >
                            <Clock className="h-10 w-10 text-amber-600" />
                        </motion.div>
                        <div>
                            <CardTitle className="font-[family-name:var(--font-heading)] text-2xl font-bold">
                                Cadastro em analise
                            </CardTitle>
                            <CardDescription className="mt-2 text-base">
                                Seu cadastro foi recebido e esta aguardando aprovacao da nossa equipe.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                            <p>
                                Voce recebera um email de confirmacao assim que seu cadastro for aprovado. Depois da liberacao,
                                o acesso principal ao portal sera pelo <strong>CNPJ</strong> informado no cadastro. Esse processo
                                pode levar ate <strong>24 horas uteis</strong>.
                            </p>
                        </div>
                        <Button variant="outline" className="w-full" onClick={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Sair
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
