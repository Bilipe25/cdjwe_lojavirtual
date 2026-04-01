'use client'

import { AlertTriangle, Loader2, RefreshCw, Save, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FeedbackState = {
    type: 'success' | 'error' | 'warning'
    message: string
}

interface RoutePendingChangesBarProps {
    hasPendingChanges: boolean
    canEditSequence: boolean
    isSavingSequence: boolean
    isReoptimizing: boolean
    lastEditSource: 'drag' | 'quick' | null
    feedback: FeedbackState | null
    onSave: () => void
    onDiscard: () => void
    onReoptimize: () => void
}

function getLastEditLabel(source: 'drag' | 'quick' | null) {
    if (source === 'drag') return 'ajuste por arrastar'
    if (source === 'quick') return 'ajuste por acao rapida'
    return null
}

export default function RoutePendingChangesBar({
    hasPendingChanges,
    canEditSequence,
    isSavingSequence,
    isReoptimizing,
    lastEditSource,
    feedback,
    onSave,
    onDiscard,
    onReoptimize,
}: RoutePendingChangesBarProps) {
    if (!canEditSequence) {
        return (
            <div className="border-b bg-slate-50 px-4 py-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    Sequencia em modo somente leitura para este status de rota.
                </div>
                {feedback ? (
                    <div
                        className={cn(
                            'mt-2 rounded-lg border px-3 py-2 text-xs',
                            feedback.type === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                            feedback.type === 'error' && 'border-red-200 bg-red-50 text-red-700',
                            feedback.type === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
                        )}
                    >
                        {feedback.message}
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <div className="border-b bg-slate-50/70 px-4 py-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Badge
                            variant="outline"
                            className={cn(
                                'text-[10px] font-semibold',
                                hasPendingChanges
                                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                            )}
                        >
                            {hasPendingChanges ? 'Alteracoes pendentes' : 'Sequencia sincronizada'}
                        </Badge>
                        {hasPendingChanges ? (
                            <span className="truncate text-[11px] text-slate-600">
                                Revise e salve antes de finalizar o planejamento.
                            </span>
                        ) : (
                            <span className="truncate text-[11px] text-slate-500">
                                Sem pendencias na ordem das paradas.
                            </span>
                        )}
                        {getLastEditLabel(lastEditSource) ? (
                            <span className="text-[10px] text-slate-400">({getLastEditLabel(lastEditSource)})</span>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-[11px]"
                            onClick={onDiscard}
                            disabled={!hasPendingChanges || isSavingSequence || isReoptimizing}
                        >
                            <Undo2 className="h-3.5 w-3.5" />
                            Descartar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1 bg-indigo-600 text-[11px] hover:bg-indigo-700"
                            onClick={onSave}
                            disabled={!hasPendingChanges || isSavingSequence || isReoptimizing}
                        >
                            {isSavingSequence ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            Salvar nova ordem
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 border-indigo-200 text-[11px] text-indigo-700 hover:bg-indigo-50"
                            onClick={onReoptimize}
                            disabled={isSavingSequence || isReoptimizing}
                        >
                            {isReoptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Reotimizar rota
                        </Button>
                    </div>
                </div>
            </div>

            {feedback ? (
                <div
                    className={cn(
                        'mt-2 rounded-lg border px-3 py-2 text-xs',
                        feedback.type === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        feedback.type === 'error' && 'border-red-200 bg-red-50 text-red-700',
                        feedback.type === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
                    )}
                >
                    <span className="inline-flex items-center gap-1.5">
                        {feedback.type === 'warning' || feedback.type === 'error' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
                        {feedback.message}
                    </span>
                </div>
            ) : null}
        </div>
    )
}
