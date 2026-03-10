'use client'

import { motion } from 'framer-motion'
import { ShieldX, LogOut, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function BlockedPage() {
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
                            className="mx-auto h-20 w-20 rounded-2xl bg-red-100 flex items-center justify-center"
                        >
                            <ShieldX className="h-10 w-10 text-red-600" />
                        </motion.div>
                        <div>
                            <CardTitle className="text-2xl font-bold font-[family-name:var(--font-heading)]">
                                Conta Bloqueada
                            </CardTitle>
                            <CardDescription className="mt-2 text-base">
                                Sua conta foi temporariamente bloqueada.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                            <p>
                                Entre em contato com nossa equipe para mais informações sobre o
                                status da sua conta.
                            </p>
                        </div>
                        <Button variant="outline" className="w-full">
                            <Phone className="h-4 w-4 mr-2" />
                            Entrar em Contato
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full text-muted-foreground"
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
