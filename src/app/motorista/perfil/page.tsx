'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    User,
    Mail,
    Phone,
    Truck,
    Shield,
    LogOut,
    Fuel,
    Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { getDriverProfile } from '../actions'
import { logoutAction } from '@/app/(auth)/login/actions'

const driverStatusConfig: Record<string, { label: string; color: string }> = {
    active: { label: 'Ativo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    inactive: { label: 'Inativo', color: 'bg-slate-100 text-slate-500 border-slate-200' },
    on_leave: { label: 'Afastado', color: 'bg-amber-100 text-amber-700 border-amber-200' },
}

const vehicleTypeLabels: Record<string, string> = {
    van: 'Van',
    truck: 'Caminhão',
    motorcycle: 'Moto',
    car: 'Carro',
    other: 'Outro',
}

export default function PerfilPage() {
    const router = useRouter()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [logoutDialog, setLogoutDialog] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getDriverProfile()
        if (res.error) setError(res.error)
        if (res.data) setData(res.data)
        setLoading(false)
    }, [])

    useEffect(() => { void loadData() }, [loadData])

    const handleLogout = async () => {
        setLoggingOut(true)
        await logoutAction()
        router.push('/login')
    }

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
                {error || 'Erro ao carregar perfil.'}
            </div>
        )
    }

    const { profile, driver } = data
    const initials = (profile?.full_name || 'M')
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()

    const driverStatus = driver?.status ? (driverStatusConfig[driver.status] || driverStatusConfig.active) : null
    const vehicle = driver?.vehicles

    return (
        <div className="space-y-4 max-w-lg mx-auto">
            {/* Profile Card */}
            <div className="rounded-2xl bg-white border shadow-sm overflow-hidden">
                {/* Header gradient */}
                <div className="h-20 bg-linear-to-r from-blue-600 via-indigo-600 to-violet-600 relative">
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
                        <div className="h-16 w-16 rounded-full bg-white p-0.5 shadow-lg">
                            <div className="h-full w-full rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                                {initials}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-10 pb-5 px-5 text-center">
                    <h1 className="text-lg font-bold text-slate-900">{profile?.full_name || 'Motorista'}</h1>
                    {driverStatus && (
                        <Badge variant="outline" className={cn('mt-1.5 text-[10px] rounded-full font-semibold', driverStatus.color)}>
                            {driverStatus.label}
                        </Badge>
                    )}
                </div>
            </div>

            {/* Contact Info */}
            <div className="rounded-2xl bg-white border shadow-sm">
                <div className="px-5 py-3 border-b">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Informações</p>
                </div>
                <div className="divide-y">
                    <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                            <Mail className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground">E-mail</p>
                            <p className="text-sm font-medium text-slate-900 truncate">{profile?.email || '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                            <Phone className="h-3.5 w-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground">Telefone</p>
                            <p className="text-sm font-medium text-slate-900">{profile?.phone || driver?.phone || '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                            <Shield className="h-3.5 w-3.5 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground">Função</p>
                            <p className="text-sm font-medium text-slate-900">Motorista</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Vehicle Info */}
            {vehicle && (
                <div className="rounded-2xl bg-white border shadow-sm">
                    <div className="px-5 py-3 border-b">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Veículo Atribuído</p>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                                <Truck className="h-6 w-6 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900">{vehicle.plate}</p>
                                <p className="text-sm text-muted-foreground">{vehicle.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[9px] rounded-full">
                                        {vehicleTypeLabels[vehicle.type] || vehicle.type}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Logout */}
            <div className="rounded-2xl bg-white border shadow-sm">
                <button
                    onClick={() => setLogoutDialog(true)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-red-600 hover:bg-red-50 transition rounded-2xl"
                >
                    <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                        <LogOut className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <span className="text-sm font-semibold">Sair da conta</span>
                </button>
            </div>

            {/* Version */}
            <p className="text-center text-[10px] text-muted-foreground/50 pb-4">
                v1.0 — Painel do Motorista
            </p>

            {/* Logout Dialog */}
            <AlertDialog open={logoutDialog} onOpenChange={setLogoutDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você será desconectado e redirecionado para a tela de login.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loggingOut}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); void handleLogout() }}
                            disabled={loggingOut}
                            className="bg-red-600 hover:bg-red-700 text-white gap-1"
                        >
                            {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                            {loggingOut ? 'Saindo...' : 'Sair'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
