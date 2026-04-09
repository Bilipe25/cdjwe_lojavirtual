import { notFound } from 'next/navigation'
import { getCfopManualDraftAction } from '@/app/admin/actions/cfop-configs'
import { CfopConfigEditor } from '@/app/admin/fiscal-bases/components/CfopConfigEditor'

export default async function NewManualCfopPage() {
    const result = await getCfopManualDraftAction()

    if (!result.success || !result.data) {
        notFound()
    }

    return <CfopConfigEditor entryId="" initialDetail={result.data} />
}
