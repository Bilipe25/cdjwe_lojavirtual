import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listFiscalImportBatchesAction } from '@/app/admin/actions/fiscal-bases'
import { FiscalImportHistoryTable } from '../components/FiscalImportHistoryTable'

export default async function FiscalImportsPage() {
    const result = await listFiscalImportBatchesAction({ includeDrafts: true })

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold font-heading text-gradient-navy">
                        Histórico de Importações Fiscais
                    </h1>
                    <p className="mt-1 text-muted-foreground">
                        Acompanhe quem importou, qual versão foi criada, quais lotes ficaram em rascunho e o status
                        operacional de cada importação.
                    </p>
                </div>
                <Button asChild className="gradient-navy border-0 text-white">
                    <Link href="/admin/fiscal-bases/imports/new">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Nova importação
                    </Link>
                </Button>
            </div>

            {!result.success || !result.data ? (
                <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
                    {result.error || 'Não foi possível carregar o histórico de importações fiscais.'}
                </div>
            ) : (
                <FiscalImportHistoryTable batches={result.data} />
            )}
        </div>
    )
}
