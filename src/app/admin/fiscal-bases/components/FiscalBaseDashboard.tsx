import Link from 'next/link'
import { ArrowRight, AlertTriangle, Database, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FiscalVersionBadge } from './FiscalVersionBadge'
import type { FiscalBaseDashboardCard } from '@/app/admin/actions/fiscal-bases'
import { FISCAL_BASE_LABELS, isFiscalBaseType } from '@/lib/fiscal/constants'

interface FiscalBaseDashboardProps {
    cards: FiscalBaseDashboardCard[]
}

export function FiscalBaseDashboard({ cards }: FiscalBaseDashboardProps) {
    const staleCount = cards.filter((card) => card.isStale).length

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Bases monitoradas</p>
                    <p className="mt-1 text-2xl font-semibold text-navy">{cards.length}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Com alerta</p>
                    <p className="mt-1 text-2xl font-semibold text-amber-700">{staleCount}</p>
                </div>
                <div className="rounded-xl border bg-white px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{'Vers\u00F5es ativas'}</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700">
                        {cards.filter((card) => card.activeVersion).length}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                {cards.map((card) => (
                    <div key={card.tableType} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg bg-navy/5 p-2 text-navy">
                                        <Database className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-navy">
                                            {card.label || (isFiscalBaseType(card.tableType) ? FISCAL_BASE_LABELS[card.tableType] : 'Base fiscal')}
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            {card.description || 'Base fiscal versionada.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {card.kind === 'config' ? (
                                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                                            Configuracao interna
                                        </span>
                                    ) : (
                                        <FiscalVersionBadge version={card.activeVersion} stale={card.isStale} />
                                    )}
                                    {card.isStale && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {card.staleByDays} {'dia(s) al\u00E9m da janela recomendada'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={card.openHref || `/admin/fiscal-bases/${card.tableType}`}>
                                        {card.openLabel || 'Abrir base'}
                                        <ArrowRight className="ml-1.5 h-4 w-4" />
                                    </Link>
                                </Button>
                                <Button asChild size="sm" className="gradient-navy border-0 text-white">
                                    <Link href={card.primaryActionHref || `/admin/fiscal-bases/imports/new?type=${card.tableType}`}>
                                        {card.kind === 'config' ? (
                                            <Plus className="mr-1.5 h-4 w-4" />
                                        ) : (
                                            <Upload className="mr-1.5 h-4 w-4" />
                                        )}
                                        {card.primaryActionLabel || 'Importar'}
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {(card.metricPanels || [
                                {
                                    label: card.kind === 'config' ? 'Ultima atualizacao' : '\u00DAltima importa\u00E7\u00E3o',
                                    value: card.lastImportAt
                                        ? new Date(card.lastImportAt).toLocaleDateString('pt-BR')
                                        : card.kind === 'config'
                                          ? 'Nao configurada'
                                          : 'N\u00E3o importada',
                                },
                                {
                                    label: card.kind === 'config' ? 'Bases / registros' : 'Linhas na vers\u00E3o ativa',
                                    value: card.rowCount.toLocaleString('pt-BR'),
                                },
                                {
                                    label: card.kind === 'config' ? 'Governanca' : 'Janela sugerida',
                                    value: card.kind === 'config' ? 'Nao importavel' : `${card.recommendedRefreshDays} dias`,
                                },
                            ]).map((panel) => (
                                <div key={`${card.tableType}-${panel.label}`} className="rounded-xl border bg-slate-50/70 px-3 py-2">
                                    <p className="text-xs text-muted-foreground">{panel.label}</p>
                                    <p className="mt-1 text-sm font-medium text-navy">{panel.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
