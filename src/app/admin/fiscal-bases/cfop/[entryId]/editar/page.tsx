import { notFound } from 'next/navigation'
import { getCfopConfigDetailAction } from '@/app/admin/actions/cfop-configs'
import { CfopConfigEditor } from '@/app/admin/fiscal-bases/components/CfopConfigEditor'

interface CfopConfigEditPageProps {
    params: Promise<{ entryId: string }>
}

export default async function CfopConfigEditPage({ params }: CfopConfigEditPageProps) {
    const { entryId } = await params
    const result = await getCfopConfigDetailAction(entryId)

    if (!result.success || !result.data) {
        notFound()
    }

    return <CfopConfigEditor entryId={entryId} initialDetail={result.data} />
}
