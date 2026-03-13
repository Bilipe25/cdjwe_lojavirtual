'use client'

import { Drawer } from 'vaul'
import { X, Bell, Package, Trash2, CheckCircle2, Clock, Truck, Factory, AlertCircle, Megaphone, Gift, Info, ExternalLink, CheckCheck } from 'lucide-react'
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
import type { ClientNotification } from '@/lib/hooks/use-notifications'

const typeConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    order_status: { icon: Package, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Pedido' },
    campaign: { icon: Megaphone, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', label: 'Campanha' },
    promo: { icon: Gift, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Promoção' },
    system: { icon: Info, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200', label: 'Sistema' },
}

const statusIcons: Record<string, any> = {
    pending: Clock,
    approved: CheckCircle2,
    in_production: Factory,
    shipped: Truck,
    delivered: CheckCircle2,
    cancelled: AlertCircle,
}

interface NotificationsBottomSheetProps {
    open: boolean
    onClose: () => void
    notifications: ClientNotification[]
    unreadCount: number
    onMarkAllRead: () => void
    onRemove: (id: string) => void
    onClearAll: () => void
    onMarkRead: (id: string) => void
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function NotificationsBottomSheet({
    open,
    onClose,
    notifications,
    unreadCount,
    onMarkAllRead,
    onRemove,
    onClearAll,
    onMarkRead,
}: NotificationsBottomSheetProps) {
    const sortedNotifications = [...notifications].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const handleNotificationClick = (n: ClientNotification) => {
        if (!n.is_read) {
            onMarkRead(n.id)
        }
        onClose()
    }

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
                    style={{ maxHeight: '85dvh' }}
                >
                    <Drawer.Title className="sr-only">Notificações</Drawer.Title>
                    {/* Drag handle */}
                    <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted shrink-0" />

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl gradient-bronze flex items-center justify-center shadow-sm">
                                <Bell className="h-4.5 w-4.5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold font-heading">Notificações</h2>
                                {unreadCount > 0 && (
                                    <p className="text-[11px] text-primary font-medium">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {unreadCount > 0 && (
                                <button
                                    onClick={onMarkAllRead}
                                    className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors"
                                >
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    Ler tudo
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <AlertDialog>
                                    <AlertDialogTrigger 
                                        render={
                                            <button className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground">
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
                                className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
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
                                <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                                    <Bell className="h-7 w-7 text-muted-foreground/40" />
                                </div>
                                <p className="text-sm font-semibold text-foreground">Nenhuma notificação</p>
                                <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px]">
                                    Você receberá atualizações sobre pedidos, promoções e novidades aqui.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/30">
                                <AnimatePresence initial={false}>
                                    {sortedNotifications.map((n) => {
                                        const config = typeConfig[n.type] || typeConfig.system
                                        // For order_status, use specific status icon
                                        const Icon = n.type === 'order_status' && n.metadata?.status
                                            ? (statusIcons[n.metadata.status] || config.icon)
                                            : config.icon

                                        const notificationContent = (
                                            <motion.div
                                                key={n.id}
                                                layout
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                                                className="relative group"
                                            >
                                                <div className="flex items-stretch">
                                                    <div
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={`flex-1 flex items-start gap-3 px-5 py-3.5 transition-colors active:bg-muted/50 cursor-pointer ${
                                                            !n.is_read ? 'bg-primary/3' : 'hover:bg-muted/20'
                                                        }`}
                                                    >
                                                        {/* Icon */}
                                                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${config.bg}`}>
                                                            <Icon className={`h-5 w-5 ${config.color}`} />
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <p className={`text-[13px] truncate ${!n.is_read ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                                                                        {n.title}
                                                                    </p>
                                                                    {!n.is_read && (
                                                                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground font-medium shrink-0">
                                                                    {timeAgo(n.created_at)}
                                                                </span>
                                                            </div>
                                                            {n.message && (
                                                                <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                                                                    {n.message}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                                                                    {config.label}
                                                                </span>
                                                                {n.link && (
                                                                    <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            onRemove(n.id)
                                                        }}
                                                        className="px-3 flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors border-l border-border/10"
                                                        aria-label="Remover"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )

                                        // Wrap in Link if notification has a link
                                        if (n.link) {
                                            return (
                                                <Link key={n.id} href={n.link} onClick={() => handleNotificationClick(n)}>
                                                    {notificationContent}
                                                </Link>
                                            )
                                        }

                                        return notificationContent
                                    })}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
