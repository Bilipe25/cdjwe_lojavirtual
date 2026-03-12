'use client'

import { Drawer } from 'vaul'
import { X, Bell, Package, Trash2, CheckCircle2, Clock, Truck, Factory, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const statusLabels: Record<string, string> = {
    pending: 'Em Análise',
    approved: 'Aprovado',
    in_production: 'Em Produção',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
}

const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    in_production: 'bg-blue-100 text-blue-700 border-blue-200',
    shipped: 'bg-purple-100 text-purple-700 border-purple-200',
    delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-100 text-red-700 border-red-200',
}

const statusIcons: Record<string, any> = {
    pending: Clock,
    approved: CheckCircle2,
    in_production: Factory,
    shipped: Truck,
    delivered: CheckCircle2,
    cancelled: AlertCircle,
}

interface Notification {
    id: string
    order_id: string
    order_number: string
    status: string
    created_at: string
}

interface NotificationsBottomSheetProps {
    open: boolean
    onClose: () => void
    notifications: Notification[]
    unreadCount: number
    onMarkRead: () => void
    onRemove: (id: string) => void
    onClearAll: () => void
    lastChecked: string | null
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}min atrás`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h atrás`
    const days = Math.floor(hours / 24)
    return `${days}d atrás`
}

export function NotificationsBottomSheet({
    open,
    onClose,
    notifications,
    unreadCount,
    onMarkRead,
    onRemove,
    onClearAll,
    lastChecked,
}: NotificationsBottomSheetProps) {
    const sortedNotifications = [...notifications].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return (
        <Drawer.Root
            open={open}
            onOpenChange={(val) => !val && onClose()}
            shouldScaleBackground
        >
            <Drawer.Portal>
                <Drawer.Overlay
                    className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <Drawer.Content
                    className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white rounded-t-3xl focus:outline-none"
                    style={{ maxHeight: '80dvh' }}
                >
                    <Drawer.Title className="sr-only">Notificações</Drawer.Title>
                    {/* Drag handle */}
                    <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted shrink-0" />

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full gradient-bronze flex items-center justify-center">
                                <Bell className="h-4 w-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold font-heading">Notificações</h2>
                                {unreadCount > 0 && (
                                    <p className="text-xs text-muted-foreground">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {notifications.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger 
                                        render={
                                            <button className="h-8 w-8 rounded-full bg-muted/40 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        }
                                    />
                                    <AlertDialogContent className="w-[90vw] rounded-2xl">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Limpar todas as notificações?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Esta ação irá remover permanentemente todas as notificações da sua lista.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                                            <AlertDialogAction 
                                                onClick={onClearAll}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                                            >
                                                Limpar Tudo
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                            <button
                                onClick={onClose}
                                className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                    <Bell className="h-7 w-7 text-muted-foreground/50" />
                                </div>
                                <p className="text-sm font-medium text-foreground">Nenhuma notificação</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Você será notificado aqui quando houver atualizações nos seus pedidos.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/40">
                                <AnimatePresence initial={false}>
                                    {sortedNotifications.map((n, i) => {
                                        const Icon = statusIcons[n.status] || Package
                                        const isNew = lastChecked ? n.created_at > lastChecked : false
                                        
                                        return (
                                            <motion.div
                                                key={n.id}
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, x: 20, height: 0 }}
                                                className="relative group overflow-hidden"
                                            >
                                                <div className="flex items-stretch">
                                                    <Link
                                                        href={`/orders/${n.order_id}`}
                                                        onClick={onClose}
                                                        className="flex-1 flex items-start gap-3 px-5 py-4 hover:bg-muted/30 transition-colors active:bg-muted/50"
                                                    >
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${statusColors[n.status] ? (statusColors[n.status] + ' border-current opacity-80') : 'bg-muted border-transparent'}`}>
                                                            <Icon className="h-5 w-5" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <p className="text-[13px] font-bold text-foreground truncate">
                                                                        Pedido {n.order_number}
                                                                    </p>
                                                                    {isNew && (
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                                                                    {timeAgo(n.created_at)}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                                    Status atualizado para <span className="font-semibold text-foreground/80">{statusLabels[n.status] || n.status}</span>
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </Link>
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            onRemove(n.id)
                                                        }}
                                                        className="px-4 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors border-l border-border/20"
                                                        aria-label="Remover"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </AnimatePresence>
                            </div>
                        )}

                        {notifications.length > 0 && (
                            <div className="px-5 py-4 text-center">
                                <Link
                                    href="/orders"
                                    onClick={onClose}
                                    className="text-xs text-primary font-medium hover:underline"
                                >
                                    Ver todos os pedidos →
                                </Link>
                            </div>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
