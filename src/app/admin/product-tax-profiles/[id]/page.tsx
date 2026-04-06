import { redirect } from 'next/navigation'

export default async function ProductTaxProfileLegacyEditRedirect({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    redirect(`/admin/product-tax-profiles/${id}/editar`)
}
