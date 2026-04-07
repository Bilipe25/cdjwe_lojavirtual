'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    cancelFiscalImportBatchAction,
    confirmFiscalImportAction,
    createFiscalImportPreviewAction,
    downloadFiscalImportTemplateAction,
} from '@/app/admin/actions/fiscal-bases'
import {
    FISCAL_BASE_LABELS,
    FISCAL_BASE_TYPES,
    type FiscalBaseType,
    type FiscalImportSourceType,
} from '@/lib/fiscal/constants'
import { FiscalImportPreview } from './FiscalImportPreview'
import type { FiscalImportPreviewSummary } from '@/lib/fiscal/import-utils'

interface FiscalImportWizardProps {
    initialType?: FiscalBaseType | null
}

type PreviewState = FiscalImportPreviewSummary & {
    batchId: string
    suggestedVersionLabel: string
}

function detectImportSourceType(fileName: string): FiscalImportSourceType | null {
    const normalized = fileName.trim().toLowerCase()
    if (normalized.endsWith('.xlsx')) return 'xlsx'
    if (normalized.endsWith('.csv') || normalized.endsWith('.txt')) return 'csv'
    return null
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    let binary = ''

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize)
        binary += String.fromCharCode(...chunk)
    }

    return btoa(binary)
}

export function FiscalImportWizard({ initialType = 'ncm' }: FiscalImportWizardProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [tableType, setTableType] = useState<FiscalBaseType>(initialType || 'ncm')
    const [fileName, setFileName] = useState('')
    const [detectedSourceType, setDetectedSourceType] = useState<FiscalImportSourceType | null>(null)
    const [preview, setPreview] = useState<PreviewState | null>(null)
    const [versionLabel, setVersionLabel] = useState('')
    const [validFrom, setValidFrom] = useState('')
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [saving, setSaving] = useState(false)
    const [cancellingDraft, setCancellingDraft] = useState(false)

    const canConfirm = useMemo(
        () => Boolean(preview && preview.validRows > 0 && versionLabel.trim().length > 0),
        [preview, versionLabel]
    )

    const resetPreviewState = () => {
        setPreview(null)
        setVersionLabel('')
        setValidFrom('')
        setFileName('')
        setDetectedSourceType(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleTemplateDownload = async () => {
        const result = await downloadFiscalImportTemplateAction(tableType)
        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel gerar o modelo.')
            return
        }

        const blob = new Blob([result.data.content], { type: 'text/csv;charset=UTF-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.data.fileName
        anchor.click()
        URL.revokeObjectURL(url)
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        const sourceType = detectImportSourceType(file.name)
        if (!sourceType) {
            toast.error('Formato nao suportado. Use CSV, TXT ou XLSX.')
            resetPreviewState()
            return
        }

        setLoadingPreview(true)
        setFileName(file.name)
        setDetectedSourceType(sourceType)

        try {
            const previewPayload =
                sourceType === 'xlsx'
                    ? {
                          tableType,
                          fileName: file.name,
                          sourceType,
                          fileBase64: arrayBufferToBase64(await file.arrayBuffer()),
                      }
                    : {
                          tableType,
                          fileName: file.name,
                          sourceType,
                          textContent: await file.text(),
                      }

            const result = await createFiscalImportPreviewAction(previewPayload)

            if (!result.success || !result.data) {
                toast.error(result.error || 'Nao foi possivel gerar o preview da importacao.')
                resetPreviewState()
                return
            }

            setPreview(result.data)
            setVersionLabel(result.data.suggestedVersionLabel)
            toast.success('Preview gerado com sucesso.')
        } catch {
            toast.error('Falha ao ler o arquivo selecionado.')
            resetPreviewState()
        } finally {
            setLoadingPreview(false)
        }
    }

    const handleDiscardPreview = async () => {
        if (!preview) return
        const confirmed = window.confirm(
            'Descartar este preview? O lote em rascunho sera cancelado e voce precisara gerar um novo preview.'
        )
        if (!confirmed) return

        setCancellingDraft(true)
        const result = await cancelFiscalImportBatchAction(preview.batchId)
        if (!result.success) {
            toast.error(result.error || 'Nao foi possivel cancelar o lote em rascunho.')
            setCancellingDraft(false)
            return
        }

        toast.success('Preview descartado. O lote em rascunho foi cancelado.')
        resetPreviewState()
        setCancellingDraft(false)
    }

    const handleConfirm = async () => {
        if (!preview) return
        setSaving(true)
        const result = await confirmFiscalImportAction({
            batchId: preview.batchId,
            versionLabel,
            validFrom: validFrom || null,
        })

        if (!result.success || !result.data) {
            toast.error(result.error || 'Nao foi possivel confirmar a importacao.')
            setSaving(false)
            return
        }

        toast.success(
            `Versao ${result.data.versionLabel} criada com ${result.data.rowCount} registro(s). Ela foi criada como inativa para revisao final.`
        )
        window.location.href = `/admin/fiscal-bases/${result.data.tableType}`
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                    <Button
                        asChild
                        variant="ghost"
                        className="mb-2 h-9 gap-2 px-0 text-slate-600 hover:bg-transparent hover:text-slate-900"
                    >
                        <Link href="/admin/fiscal-bases/imports">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para o historico de importacoes
                        </Link>
                    </Button>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">Nova Importacao Fiscal</h1>
                    <p className="mt-1 text-muted-foreground">
                        Importe uma base fiscal em CSV ou XLSX, valide a estrutura e gere uma nova versao auditavel com
                        ativacao explicita.
                    </p>
                </div>

                <Button variant="outline" onClick={() => void handleTemplateDownload()}>
                    <Download className="mr-1.5 h-4 w-4" />
                    Baixar modelo CSV
                </Button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr]">
                <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="rounded-2xl border bg-slate-50/70 p-4 text-sm text-slate-700">
                        <p className="font-medium text-navy">Como este fluxo funciona</p>
                        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>1. Voce gera um preview e valida linhas, erros e avisos.</li>
                            <li>2. Ao confirmar, o sistema cria uma nova versao inativa.</li>
                            <li>3. A ativacao da versao e feita depois, na pagina da base fiscal.</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo da base fiscal</Label>
                        <div className="grid gap-2">
                            {FISCAL_BASE_TYPES.map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => {
                                        setTableType(type)
                                        resetPreviewState()
                                    }}
                                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                                        tableType === type
                                            ? 'border-navy bg-navy/5 text-navy'
                                            : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <p className="font-medium">{FISCAL_BASE_LABELS[type]}</p>
                                    <p className="text-xs text-muted-foreground">
                                        Importacao versionada com preview, historico e ativacao controlada.
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Arquivo de importacao</Label>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full rounded-2xl border-2 border-dashed border-slate-300 px-4 py-10 text-center transition-colors hover:border-navy/40 hover:bg-navy/5"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.txt,.xlsx"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                            <p className="text-sm font-medium text-navy">
                                {fileName ? fileName : 'Clique para selecionar o arquivo de importacao'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Formatos aceitos: CSV, TXT e XLSX. Para XLSX, o sistema usa a primeira aba util.
                            </p>
                        </button>
                    </div>

                    {detectedSourceType ? (
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-white text-slate-700">
                                Formato detectado: {detectedSourceType.toUpperCase()}
                            </Badge>
                            {preview?.sheetName ? (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                    <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
                                    Aba lida: {preview.sheetName}
                                </Badge>
                            ) : null}
                        </div>
                    ) : null}

                    {preview ? (
                        <div className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                    <Label>Rotulo da versao</Label>
                                    <Input
                                        value={versionLabel}
                                        onChange={(event) => setVersionLabel(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Vigencia inicial</Label>
                                    <Input
                                        type="date"
                                        value={validFrom}
                                        onChange={(event) => setValidFrom(event.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Ao confirmar, a versao sera criada como <strong>inativa</strong>. Isso evita publicar
                                dados sem revisao operacional.
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    className="gradient-navy border-0 text-white"
                                    onClick={() => void handleConfirm()}
                                    disabled={!canConfirm || saving}
                                >
                                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Confirmar importacao e criar versao inativa
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void handleDiscardPreview()}
                                    disabled={saving || cancellingDraft}
                                >
                                    {cancellingDraft ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                    )}
                                    Descartar preview
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div>
                    {loadingPreview ? (
                        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border bg-white p-6 shadow-sm">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Validando arquivo e preparando preview...
                            </div>
                        </div>
                    ) : preview ? (
                        <FiscalImportPreview preview={preview} />
                    ) : (
                        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border bg-white p-6 text-center shadow-sm">
                            <div>
                                <p className="text-sm font-medium text-navy">Nenhum preview gerado ainda.</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Selecione o tipo da base fiscal, envie o arquivo e revise os dados antes de confirmar
                                    a criacao da nova versao.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
