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
        <div className="min-h-screen flex items-center justify-center gradient-hero p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                <Card className="glass-card border-0 shadow-xl">
                    <CardHeader className="text-center space-y-4">
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                            className="mx-auto h-20 w-20 rounded-2xl bg-amber-100 flex items-center justify-center"
                        >
                            <Clock className="h-10 w-10 text-amber-600" />
                        </motion.div>
                        <div>
                            <CardTitle className="text-2xl font-bold font-[family-name:var(--font-heading)]">
                                Cadastro em Análise
                            </CardTitle>
                            <CardDescription className="mt-2 text-base">
                                Seu cadastro foi recebido e está aguardando aprovação da nossa equipe.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                            <p>
                                Você receberá um email de confirmação assim que seu cadastro for aprovado.
                                Esse processo pode levar até <strong>24 horas úteis</strong>.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleLogout}
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            Sair
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    )
}
