import { notFound } from 'next/navigation'
import {
    listFiscalBaseEntriesAction,
    listFiscalReferenceVersionsAction,
} from '@/app/admin/actions/fiscal-bases'
import { FiscalBaseTablePage } from '../components/FiscalBaseTablePage'
import { isFiscalBaseType } from '@/lib/fiscal/constants'

interface FiscalBaseDetailPageProps {
    params: Promise<{ type: string }>
}

export default async function FiscalBaseDetailPage({ params }: FiscalBaseDetailPageProps) {
    const { type } = await params
    if (!isFiscalBaseType(type)) notFound()

    const [entriesResult, versionsResult] = await Promise.all([
        listFiscalBaseEntriesAction({
            tableType: type,
            limit: 150,
        }),
        listFiscalReferenceVersionsAction(type),
    ])

    if (!entriesResult.success || !entriesResult.data || !versionsResult.success || !versionsResult.data) {
        return (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
                {entriesResult.error || versionsResult.error || 'Não foi possível carregar a base fiscal.'}
            </div>
        )
    }

    return (
        <FiscalBaseTablePage
            tableType={type}
            initialEntries={entriesResult.data.entries}
            initialVersion={entriesResult.data.version}
            baseState={entriesResult.data.baseState}
            versions={versionsResult.data}
        />
    )
}
