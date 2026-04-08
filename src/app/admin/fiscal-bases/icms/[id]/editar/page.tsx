import { IcmsBaseEditor } from '../../../components/IcmsBaseEditor'

interface EditIcmsBasePageProps {
    params: Promise<{
        id: string
    }>
}

export default async function EditIcmsBasePage({ params }: EditIcmsBasePageProps) {
    const { id } = await params
    return <IcmsBaseEditor mode="edit" icmsBaseId={id} />
}
