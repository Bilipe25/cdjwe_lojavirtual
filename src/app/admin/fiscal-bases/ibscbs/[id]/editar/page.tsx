import { IbscbsBaseEditor } from '../../../components/IbscbsBaseEditor'

interface EditIbscbsBasePageProps {
    params: Promise<{ id: string }>
}

export default async function EditIbscbsBasePage({ params }: EditIbscbsBasePageProps) {
    const resolvedParams = await params
    return <IbscbsBaseEditor mode="edit" ibscbsBaseId={resolvedParams.id} />
}
