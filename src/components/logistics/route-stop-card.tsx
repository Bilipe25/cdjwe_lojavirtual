'use client'

import {
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ChevronsDown,
    ChevronsUp,
    Crosshair,
    GripVertical,
    Navigation,
    Package,
    Timer,
    XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface RouteStopCardItem {
    id: string
    stop_position: number
    customer_name: string
    address_snapshot: string | null
    status: string
    priority?: string | null
    latitude: number | null
    longitude: number | null
    estimated_arrival_min?: number | null
    estimated_distance_km?: number | null
    delivered_at?: string | null
    failure_reason?: string | null
    address_id?: string | null
    orders?: {
        order_number?: string | null
        total?: number | null
    } | null
}

interface RouteStopCardProps {
    stop: RouteStopCardItem
    stopIndex: number
    totalStops: number
    isSequenceEditable: boolean
    isHighlighted: boolean
    isActiveForExecution: boolean
    actionLoading: boolean
    dragHandleProps?: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attributes?: Record<string, any>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        listeners?: Record<string, any>
    }
    isDragging?: boolean
    stopStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }>
    onToggleHighlight: (stopId: string) => void
    onMoveStop: (stopId: string, direction: 'top' | 'up' | 'down' | 'bottom') => void
    onOpenGeocode: (stop: RouteStopCardItem) => void
    onMarkDelivered: (stopId: string) => void
    onRequestFailure: (stopId: string, customerName: string) => void
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return ''
    try {
        return new Date(value).toLocaleString('pt-BR')
    } catch {
        return value
    }
}

export default function RouteStopCard({
    stop,
    stopIndex,
    totalStops,
    isSequenceEditable,
    isHighlighted,
    isActiveForExecution,
    actionLoading,
    dragHandleProps,
    isDragging = false,
    stopStatusConfig,
    onToggleHighlight,
    onMoveStop,
    onOpenGeocode,
    onMarkDelivered,
    onRequestFailure,
}: RouteStopCardProps) {
    const stopStatus = stopStatusConfig[stop.status] || stopStatusConfig.pending
    const StopStatusIcon = stopStatus.icon

    const canMoveUp = stopIndex > 0
    const canMoveDown = stopIndex < totalStops - 1
    const hasCoordinates = Boolean(stop.latitude && stop.longitude)

    return (
        <div
            className={cn(
                'rounded-xl border bg-white p-3 transition cursor-pointer',
                'hover:bg-indigo-50/30',
                isActiveForExecution && 'bg-blue-50/30',
                isHighlighted && 'bg-indigo-50/50 ring-1 ring-indigo-200',
                isDragging && 'opacity-70 shadow-md',
            )}
            onClick={() => onToggleHighlight(stop.id)}
        >
            <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-0.5">
                    <div
                        className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border-2',
                            stop.status === 'delivered'
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : stop.status === 'failed'
                                    ? 'bg-red-500 text-white border-red-500'
                                    : isActiveForExecution
                                        ? 'bg-blue-500 text-white border-blue-500 animate-pulse'
                                        : 'bg-white text-slate-500 border-slate-200',
                        )}
                    >
                        {stop.status === 'delivered' ? (
                            <CheckCircle2 className="h-4 w-4" />
                        ) : stop.status === 'failed' ? (
                            <XCircle className="h-4 w-4" />
                        ) : (
                            stop.stop_position || stopIndex + 1
                        )}
                    </div>
                    {stopIndex < totalStops - 1 ? (
                        <div
                            className={cn(
                                'w-0.5 h-5',
                                stop.status === 'delivered'
                                    ? 'bg-emerald-200'
                                    : stop.status === 'failed'
                                        ? 'bg-red-200'
                                        : 'bg-slate-200',
                            )}
                        />
                    ) : null}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-navy truncate">{stop.customer_name}</p>
                        <Badge
                            variant="outline"
                            className={cn('text-[9px] font-bold rounded-full gap-0.5 border', stopStatus.color)}
                        >
                            <StopStatusIcon className="h-2.5 w-2.5" />
                            {stopStatus.label}
                        </Badge>
                        {stop.priority && stop.priority !== 'normal' ? (
                            <Badge variant="secondary" className="text-[9px] rounded-full">
                                {stop.priority === 'urgent'
                                    ? 'Prioridade urgente'
                                    : stop.priority === 'high'
                                        ? 'Prioridade alta'
                                        : 'Prioridade baixa'}
                            </Badge>
                        ) : null}
                    </div>

                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1 flex items-center gap-1.5">
                        {stop.address_snapshot?.replace(/\[.*?\]\s*/g, '') || '-'}
                        <Badge
                            variant="outline"
                            className={cn(
                                'text-[8px] rounded-full shrink-0',
                                hasCoordinates
                                    ? 'text-emerald-600 border-emerald-200'
                                    : 'text-amber-600 border-amber-200',
                            )}
                        >
                            {hasCoordinates ? 'Geo OK' : 'Sem geo'}
                        </Badge>
                    </p>

                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-0.5">
                            <Package className="h-2.5 w-2.5" />
                            {stop.orders?.order_number || '-'}
                        </span>
                        {stop.orders?.total ? (
                            <span className="font-semibold text-navy">
                                R$ {Number(stop.orders.total).toFixed(2)}
                            </span>
                        ) : null}
                        {stop.estimated_arrival_min && stop.estimated_arrival_min > 0 ? (
                            <span className="flex items-center gap-0.5 text-indigo-600">
                                <Timer className="h-2.5 w-2.5" />
                                ETA {stop.estimated_arrival_min} min
                            </span>
                        ) : null}
                        {stop.estimated_distance_km && stop.estimated_distance_km > 0 ? (
                            <span className="flex items-center gap-0.5">
                                <Navigation className="h-2.5 w-2.5" />
                                {stop.estimated_distance_km} km
                            </span>
                        ) : null}
                        {stop.delivered_at ? (
                            <span className="flex items-center gap-0.5 text-emerald-600">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                {formatDateTime(stop.delivered_at)}
                            </span>
                        ) : null}
                        {stop.failure_reason ? (
                            <span className="text-red-500">{stop.failure_reason}</span>
                        ) : null}
                    </div>
                </div>

                <div className="flex shrink-0 items-start gap-1.5">
                    {isSequenceEditable ? (
                        <div className="flex flex-col gap-1">
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-6 w-6"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onMoveStop(stop.id, 'top')
                                }}
                                disabled={!canMoveUp}
                                title="Mover para o topo"
                            >
                                <ChevronsUp className="h-3 w-3" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-6 w-6"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onMoveStop(stop.id, 'up')
                                }}
                                disabled={!canMoveUp}
                                title="Mover para cima"
                            >
                                <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-6 w-6"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onMoveStop(stop.id, 'down')
                                }}
                                disabled={!canMoveDown}
                                title="Mover para baixo"
                            >
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-6 w-6"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onMoveStop(stop.id, 'bottom')
                                }}
                                disabled={!canMoveDown}
                                title="Mover para o fim"
                            >
                                <ChevronsDown className="h-3 w-3" />
                            </Button>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-1.5">
                        {isSequenceEditable ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(
                                    'h-7 text-[10px] gap-1',
                                    hasCoordinates
                                        ? 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                                        : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50',
                                )}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpenGeocode(stop)
                                }}
                            >
                                <Crosshair className="h-2.5 w-2.5" />
                                Geocodificar
                            </Button>
                        ) : null}

                        {isActiveForExecution ? (
                            <>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onMarkDelivered(stop.id)
                                    }}
                                    disabled={actionLoading}
                                >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Entregue
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onRequestFailure(stop.id, stop.customer_name)
                                    }}
                                    disabled={actionLoading}
                                >
                                    <XCircle className="h-2.5 w-2.5" />
                                    Insucesso
                                </Button>
                            </>
                        ) : null}

                        {isSequenceEditable ? (
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 cursor-grab active:cursor-grabbing text-slate-500"
                                onClick={(event) => event.stopPropagation()}
                                title="Arrastar parada"
                                {...dragHandleProps?.attributes}
                                {...dragHandleProps?.listeners}
                            >
                                <GripVertical className="h-4 w-4" />
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}
