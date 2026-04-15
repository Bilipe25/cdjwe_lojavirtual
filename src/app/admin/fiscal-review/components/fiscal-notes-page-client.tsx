'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FileBadge2, ReceiptText, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  consultFiscalDocumentAction,
  getFiscalDocumentAssetUrlAction,
  getFiscalDocumentsIndexAction,
} from '../actions'
import type { FiscalDocumentsIndexQuery, FiscalDocumentsIndexResult } from '../types'
import { FiscalDocumentsTable } from './fiscal-documents-table'
import { FiscalDocumentsToolbar } from './fiscal-documents-toolbar'
import { KpiCard, SectionShell } from './fiscal-document-ui'

const DEFAULT_QUERY: FiscalDocumentsIndexQuery = {
  search: '',
  status: 'all',
  ambiente: 'all',
  model: 'all',
  period: 'all',
  page: 1,
  pageSize: 12,
  sortBy: 'emitted_at',
  sortDir: 'desc',
}

export function FiscalNotesPageClient({
  initialData,
}: {
  initialData: FiscalDocumentsIndexResult
}) {
  const router = useRouter()
  const [query, setQuery] = useState<FiscalDocumentsIndexQuery>(DEFAULT_QUERY)
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState<FiscalDocumentsIndexResult>(initialData)
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasMountedRef = useRef(false)

  const refreshData = useCallback(async (nextQuery: FiscalDocumentsIndexQuery) => {
    const result = await getFiscalDocumentsIndexAction(nextQuery)
    if (result.success) {
      setData(result.data)
      return
    }

    toast.error(result.error.message || 'Nao foi possivel carregar as notas fiscais.')
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery((current) => ({ ...current, search: searchInput, page: 1 }))
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    startTransition(() => {
      void refreshData(query)
    })
  }, [query, refreshData])

  async function handleConsult(documentId: string) {
    setBusyDocumentId(documentId)
    const result = await consultFiscalDocumentAction(documentId)
    if (result.success) {
      toast.success('Consulta fiscal concluida com sucesso.')
      await refreshData(query)
    } else {
      toast.error(result.error?.message || 'Falha ao consultar a nota fiscal.')
    }
    setBusyDocumentId(null)
  }

  async function handleDownloadXml(documentId: string, assetType: 'xml_envio' | 'xml_retorno' | 'xml_processado') {
    setBusyDocumentId(documentId)
    const result = await getFiscalDocumentAssetUrlAction(documentId, assetType)
    if (!result.success || !result.data) {
      toast.error(result.error?.message || 'Falha ao abrir o arquivo XML.')
      setBusyDocumentId(null)
      return
    }

    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
    setBusyDocumentId(null)
  }

  function handleQueryPatch(patch: Partial<FiscalDocumentsIndexQuery>) {
    setQuery((current) => ({
      ...current,
      ...patch,
      page: patch.page ?? 1,
    }))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="glass-card rounded-[32px] border border-white/30 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-bronze">Documentos fiscais</p>
            <div>
              <h1 className="text-4xl font-semibold text-gradient-navy">Notas fiscais</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Central operacional para acompanhar apenas notas fiscais emitidas, com busca, filtros,
                downloads e acesso rapido ao detalhe completo de cada documento.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-2xl border-white/30 bg-background/70 shadow-sm"
            >
              <Link href="/admin/orders">Ver pedidos</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Notas emitidas"
          value={data.summary.totalDocuments}
          helper="Documentos autorizados ou cancelados registrados na central."
        />
        <KpiCard
          label="Autorizadas"
          value={data.summary.authorizedCount}
          helper="Notas com autorizacao concluida e protocolo disponivel."
        />
        <KpiCard
          label="Canceladas"
          value={data.summary.cancelledCount}
          helper="Documentos que ja passaram por cancelamento fiscal."
        />
        <KpiCard
          label="Em producao"
          value={data.summary.productionCount}
          helper="Volume emitido em ambiente oficial de producao."
        />
      </section>

      <SectionShell
        eyebrow="Controle operacional"
        title="Data table de notas emitidas"
        description="Use busca, filtros e ordenacao para localizar rapidamente qualquer documento fiscal ja emitido."
        actions={
          <div className="hidden items-center gap-2 rounded-2xl border border-white/25 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-sm md:inline-flex">
            <ReceiptText className="h-3.5 w-3.5 text-bronze" />
            {data.total} registro(s)
          </div>
        }
      >
        <div className="space-y-5">
          <FiscalDocumentsToolbar
            query={query}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onStatusChange={(value) => handleQueryPatch({ status: value })}
            onEnvironmentChange={(value) => handleQueryPatch({ ambiente: value })}
            onModelChange={(value) => handleQueryPatch({ model: value })}
            onPeriodChange={(value) => handleQueryPatch({ period: value })}
            onReset={() => {
              setSearchInput('')
              setQuery(DEFAULT_QUERY)
            }}
          />

          <FiscalDocumentsTable
            items={data.items}
            total={data.total}
            page={data.page}
            pageSize={data.pageSize}
            loading={isPending}
            busyDocumentId={busyDocumentId}
            sortBy={query.sortBy || 'emitted_at'}
            sortDir={query.sortDir || 'desc'}
            onSortChange={(field, direction) => handleQueryPatch({ sortBy: field, sortDir: direction })}
            onPageChange={(nextPage) => handleQueryPatch({ page: nextPage })}
            onOpenDetail={(documentId) => router.push(`/admin/fiscal-review/documentos/${documentId}`)}
            onConsult={handleConsult}
            onOpenDanfe={(documentId) => window.open(`/api/fiscal/danfe/${documentId}`, '_blank', 'noopener,noreferrer')}
            onDownloadXml={handleDownloadXml}
          />
        </div>
      </SectionShell>

      <section className="grid gap-4 xl:grid-cols-3">
        <InfoMiniCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Status oficiais"
          description="A central mostra apenas documentos que efetivamente passaram a existir como nota fiscal."
        />
        <InfoMiniCard
          icon={<FileBadge2 className="h-4 w-4" />}
          title="Rastreabilidade"
          description="Cada linha concentra chave, protocolo, ambiente, pedido e arquivos tecnicos do documento."
        />
        <InfoMiniCard
          icon={<XCircle className="h-4 w-4" />}
          title="Acoes criticas no detalhe"
          description="Cancelamento e carta de correcao ficam no detalhe da nota para manter a grade limpa."
        />
      </section>
    </div>
  )
}

function InfoMiniCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <article className="glass-card rounded-[24px] border border-white/25 p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-navy text-white">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </article>
  )
}
