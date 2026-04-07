import { notFound } from 'next/navigation'
import {
    listFiscalBaseEntriesAction,
    listFiscalReferenceVersionsAction,
} from '@/app/admin/actions/fiscal-bases'
import { FiscalBaseTablePage } from '../components/FiscalBaseTablePage'
import { FiscalCestTablePage } from '../components/FiscalCestTablePage'
import { FiscalNcmTablePage } from '../components/FiscalNcmTablePage'
import { FiscalTipiTablePage } from '../components/FiscalTipiTablePage'
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
            page: 1,
            pageSize: type === 'ncm' || type === 'tipi' || type === 'cest' ? 50 : 150,
            sortBy: type === 'ncm' ? 'code' : type === 'tipi' ? 'ncm_code' : type === 'cest' ? 'code' : undefined,
            sortOrder: type === 'ncm' || type === 'tipi' || type === 'cest' ? 'asc' : undefined,
            includeStructuralRows: false,
            filterRateMode: type === 'tipi' ? 'all' : undefined,
            filterExTipi: type === 'tipi' ? 'all' : undefined,
            filterLinkMode: type === 'cest' ? 'all' : undefined,
            filterSegmentMode: type === 'cest' ? 'all' : undefined,
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

    if (type === 'ncm') {
        return (
            <FiscalNcmTablePage
                initialResult={entriesResult.data}
                initialVersions={versionsResult.data}
            />
        )
    }

    if (type === 'tipi') {
        return (
            <FiscalTipiTablePage
                initialResult={entriesResult.data}
                initialVersions={versionsResult.data}
            />
        )
    }

    if (type === 'cest') {
        return (
            <FiscalCestTablePage
                initialResult={entriesResult.data}
                initialVersions={versionsResult.data}
            />
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

