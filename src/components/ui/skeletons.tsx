'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

// ─── Product Card Skeleton ───────────────────────────────────
export function ProductCardSkeleton() {
    return (
        <Card className="glass-card border-0 overflow-hidden">
            <Skeleton className="h-56 rounded-none" />
            <CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-full mt-2" />
                <div className="flex justify-between mt-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-20" />
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Product Grid Skeleton ───────────────────────────────────
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    )
}

// ─── Order Card Skeleton ─────────────────────────────────────
export function OrderCardSkeleton() {
    return (
        <Card className="glass-card border-0">
            <CardContent className="p-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Order List Skeleton ─────────────────────────────────────
export function OrderListSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="space-y-4" role="status" aria-label="Carregando pedidos">
            {Array.from({ length: count }).map((_, i) => (
                <OrderCardSkeleton key={i} />
            ))}
            <span className="sr-only">Carregando...</span>
        </div>
    )
}

// ─── Detail Page Skeleton ────────────────────────────────────
export function ProductDetailSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12" role="status" aria-label="Carregando produto">
            {/* Image */}
            <div className="space-y-4">
                <Skeleton className="aspect-square rounded-2xl" />
                <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-16 rounded-lg" />
                    ))}
                </div>
            </div>
            {/* Details */}
            <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-32" />
                <div className="space-y-2 mt-4">
                    <Skeleton className="h-4 w-16" />
                    <div className="flex gap-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-8 w-20 rounded-full" />
                        ))}
                    </div>
                </div>
                <Skeleton className="h-12 w-full mt-6 rounded-lg" />
            </div>
            <span className="sr-only">Carregando...</span>
        </div>
    )
}

// ─── Profile Skeleton ────────────────────────────────────────
export function ProfileSkeleton() {
    return (
        <div className="space-y-6" role="status" aria-label="Carregando perfil">
            <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-32" />
                </div>
            </div>
            <Card className="glass-card border-0">
                <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
            <span className="sr-only">Carregando...</span>
        </div>
    )
}

// ─── Table / Admin Skeleton ──────────────────────────────────
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="space-y-2" role="status" aria-label="Carregando dados">
            {/* Header */}
            <div className="flex gap-4 p-3">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex gap-4 p-3 border-t">
                    {Array.from({ length: cols }).map((_, c) => (
                        <Skeleton key={c} className="h-4 flex-1" />
                    ))}
                </div>
            ))}
            <span className="sr-only">Carregando...</span>
        </div>
    )
}
