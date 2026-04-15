import { getFiscalDocumentsIndexAction } from './actions'
import { FiscalNotesPageClient } from './components/fiscal-notes-page-client'

export default async function AdminFiscalDocumentsPage() {
  const result = await getFiscalDocumentsIndexAction({
    status: 'all',
    ambiente: 'all',
    model: 'all',
    period: 'all',
    page: 1,
    pageSize: 12,
    sortBy: 'emitted_at',
    sortDir: 'desc',
  })

  if (!result.success) {
    return (
      <div className="mx-auto max-w-7xl">
        <section className="glass-card rounded-[28px] border border-rose-300/30 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-500">Documentos fiscais</p>
          <h1 className="mt-3 text-3xl font-semibold text-gradient-navy">Notas fiscais</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Nao foi possivel carregar a central de notas fiscais agora.
          </p>
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{result.error.message}</p>
        </section>
      </div>
    )
  }

  return <FiscalNotesPageClient initialData={result.data} />
}
