import { getFiscalDocumentDetailAction } from '../../actions'
import { FiscalDocumentDetailPageClient } from '../../components/fiscal-document-detail-page-client'

export default async function FiscalDocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const { documentId } = await params
  const result = await getFiscalDocumentDetailAction(documentId)

  if (!result.success) {
    return (
      <div className="mx-auto max-w-7xl">
        <section className="glass-card rounded-[28px] border border-rose-300/30 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-500">Documento fiscal</p>
          <h1 className="mt-3 text-3xl font-semibold text-gradient-navy">Nota fiscal nao encontrada</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            O documento solicitado nao foi localizado ou nao esta mais disponivel.
          </p>
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{result.error.message}</p>
        </section>
      </div>
    )
  }

  return <FiscalDocumentDetailPageClient initialData={result.data} />
}
