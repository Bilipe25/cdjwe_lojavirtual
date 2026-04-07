'use client'

import { useState } from 'react'
import { ExternalLink, FileDown, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { downloadFiscalImportTemplateAction } from '@/app/admin/actions/fiscal-bases'
import { FISCAL_SOURCE_GUIDE, type FiscalBaseType } from '@/lib/fiscal/constants'

export function FiscalSourceGuide() {
    const [downloadingType, setDownloadingType] = useState<FiscalBaseType | null>(null)

    const handleTemplateDownload = async (tableType: FiscalBaseType) => {
        setDownloadingType(tableType)
        const result = await downloadFiscalImportTemplateAction(tableType)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel gerar o modelo de importacao.')
            setDownloadingType(null)
            return
        }

        const blob = new Blob([result.data.content], { type: 'text/csv;charset=UTF-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.data.fileName
        anchor.click()
        URL.revokeObjectURL(url)
        toast.success(`Modelo de importacao de ${tableType.toUpperCase()} baixado com sucesso.`)
        setDownloadingType(null)
    }

    return (
        <section className="space-y-4">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-navy">Guia de Fontes Oficiais</h2>
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                            Use este guia como referencia operacional para encontrar as bases tributarias na internet,
                            baixar os arquivos oficiais e preparar a conversao para o layout de importacao do sistema.
                        </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        Fontes externas oficiais
                    </Badge>
                </div>

                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                            Antes de importar, confirme vigencia, formato e data da publicacao oficial. O sistema aceita
                            CSV e XLSX, mas o modelo padrao baixado aqui continua sendo CSV estruturado para importacao.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                {FISCAL_SOURCE_GUIDE.map((item) => (
                    <div key={item.tableType} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-navy">{item.title}</h3>
                                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                            </div>
                            <Badge variant="outline" className="bg-white text-slate-700">
                                {item.tableType.toUpperCase()}
                            </Badge>
                        </div>

                        <div className="mt-4 space-y-3 text-sm">
                            <div className="rounded-xl border bg-slate-50/70 p-3">
                                <p className="font-medium text-navy">Acoes rapidas</p>
                                <p className="mt-1 text-muted-foreground">
                                    Baixe o modelo do sistema e abra a fonte oficial da base em paralelo.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleTemplateDownload(item.tableType)}
                                        disabled={downloadingType === item.tableType}
                                    >
                                        {downloadingType === item.tableType ? (
                                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        ) : (
                                            <FileDown className="mr-1.5 h-4 w-4" />
                                        )}
                                        Baixar modelo de importacao
                                    </Button>
                                    <Button asChild size="sm" className="gradient-navy border-0 text-white">
                                        <a href={item.officialUrl} target="_blank" rel="noreferrer">
                                            Abrir fonte oficial
                                            <ExternalLink className="ml-1.5 h-4 w-4" />
                                        </a>
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-xl border bg-slate-50/70 p-3">
                                <p className="font-medium text-navy">Fonte oficial principal</p>
                                <p className="mt-1 text-muted-foreground">{item.officialLabel}</p>
                            </div>

                            {item.secondaryUrl ? (
                                <div className="rounded-xl border bg-slate-50/70 p-3">
                                    <p className="font-medium text-navy">Referencia complementar</p>
                                    <p className="mt-1 text-muted-foreground">{item.secondaryLabel}</p>
                                    <Button asChild variant="outline" size="sm" className="mt-3">
                                        <a href={item.secondaryUrl} target="_blank" rel="noreferrer">
                                            Abrir referencia complementar
                                            <ExternalLink className="ml-1.5 h-4 w-4" />
                                        </a>
                                    </Button>
                                </div>
                            ) : null}

                            <div className="rounded-xl border p-3">
                                <div className="flex items-center gap-2 text-navy">
                                    <FileDown className="h-4 w-4" />
                                    <p className="font-medium">Como baixar e importar</p>
                                </div>
                                <p className="mt-2 text-muted-foreground">{item.formatHint}</p>
                                <p className="mt-2 text-muted-foreground">{item.importHint}</p>
                            </div>

                            <div className="rounded-xl border border-dashed bg-slate-50/60 p-3 text-muted-foreground">
                                {item.note}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
