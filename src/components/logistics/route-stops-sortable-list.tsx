'use client'

import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RouteStopCard, { type RouteStopCardItem } from './route-stop-card'

type StopStatusConfig = Record<string, { label: string; color: string; icon: React.ElementType }>

interface RouteStopsSortableListProps {
    stops: RouteStopCardItem[]
    routeStatus: string
    isSequenceEditable: boolean
    actionLoading: boolean
    highlightStopId: string | null
    stopStatusConfig: StopStatusConfig
    onToggleHighlight: (stopId: string) => void
    onMoveStop: (stopId: string, direction: 'top' | 'up' | 'down' | 'bottom') => void
    onOpenGeocode: (stop: RouteStopCardItem) => void
    onMarkDelivered: (stopId: string) => void
    onRequestFailure: (stopId: string, customerName: string) => void
    onReorder: (nextStops: RouteStopCardItem[]) => void
}

interface SortableStopRowProps {
    stop: RouteStopCardItem
    stopIndex: number
    totalStops: number
    routeStatus: string
    isSequenceEditable: boolean
    actionLoading: boolean
    highlightStopId: string | null
    stopStatusConfig: StopStatusConfig
    onToggleHighlight: (stopId: string) => void
    onMoveStop: (stopId: string, direction: 'top' | 'up' | 'down' | 'bottom') => void
    onOpenGeocode: (stop: RouteStopCardItem) => void
    onMarkDelivered: (stopId: string) => void
    onRequestFailure: (stopId: string, customerName: string) => void
}

function normalizePositions(stops: RouteStopCardItem[]) {
    return stops.map((stop, index) => ({
        ...stop,
        stop_position: index + 1,
    }))
}

function SortableStopRow({
    stop,
    stopIndex,
    totalStops,
    routeStatus,
    isSequenceEditable,
    actionLoading,
    highlightStopId,
    stopStatusConfig,
    onToggleHighlight,
    onMoveStop,
    onOpenGeocode,
    onMarkDelivered,
    onRequestFailure,
}: SortableStopRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: stop.id,
        disabled: !isSequenceEditable,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    return (
        <div ref={setNodeRef} style={style}>
            <RouteStopCard
                stop={stop}
                stopIndex={stopIndex}
                totalStops={totalStops}
                isSequenceEditable={isSequenceEditable}
                isHighlighted={highlightStopId === stop.id}
                isActiveForExecution={routeStatus === 'in_progress' && stop.status === 'pending'}
                actionLoading={actionLoading}
                isDragging={isDragging}
                dragHandleProps={{
                    attributes,
                    listeners,
                }}
                stopStatusConfig={stopStatusConfig}
                onToggleHighlight={onToggleHighlight}
                onMoveStop={onMoveStop}
                onOpenGeocode={onOpenGeocode}
                onMarkDelivered={onMarkDelivered}
                onRequestFailure={onRequestFailure}
            />
        </div>
    )
}

export default function RouteStopsSortableList({
    stops,
    routeStatus,
    isSequenceEditable,
    actionLoading,
    highlightStopId,
    stopStatusConfig,
    onToggleHighlight,
    onMoveStop,
    onOpenGeocode,
    onMarkDelivered,
    onRequestFailure,
    onReorder,
}: RouteStopsSortableListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    const stopIds = stops.map((stop) => stop.id)

    const handleDragEnd = (event: DragEndEvent) => {
        if (!isSequenceEditable) return

        const activeId = String(event.active.id)
        const overId = event.over ? String(event.over.id) : null

        if (!overId || activeId === overId) return

        const oldIndex = stops.findIndex((stop) => stop.id === activeId)
        const newIndex = stops.findIndex((stop) => stop.id === overId)

        if (oldIndex < 0 || newIndex < 0) return

        const reordered = arrayMove(stops, oldIndex, newIndex)
        onReorder(normalizePositions(reordered))
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={stopIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 p-3">
                    {stops.map((stop, index) => (
                        <SortableStopRow
                            key={stop.id}
                            stop={stop}
                            stopIndex={index}
                            totalStops={stops.length}
                            routeStatus={routeStatus}
                            isSequenceEditable={isSequenceEditable}
                            actionLoading={actionLoading}
                            highlightStopId={highlightStopId}
                            stopStatusConfig={stopStatusConfig}
                            onToggleHighlight={onToggleHighlight}
                            onMoveStop={onMoveStop}
                            onOpenGeocode={onOpenGeocode}
                            onMarkDelivered={onMarkDelivered}
                            onRequestFailure={onRequestFailure}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}
