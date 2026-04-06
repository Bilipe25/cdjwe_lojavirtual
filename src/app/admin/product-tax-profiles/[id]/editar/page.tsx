import { ProductTaxProfileEditor } from '../../components/ProductTaxProfileEditor'

export default async function EditProductTaxProfilePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    return <ProductTaxProfileEditor mode="edit" taxProfileId={id} />
}

