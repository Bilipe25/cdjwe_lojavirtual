import { getReadyDeliveryTransferOptions } from '../actions'
import { ReadyDeliveryTransferClient } from './_client'

export default async function ReadyDeliveryTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const params = await searchParams
  const data = await getReadyDeliveryTransferOptions()

  return (
    <ReadyDeliveryTransferClient
      representatives={data.representatives}
      variants={data.variants}
      initialSuccess={params.success === '1'}
      initialError={params.error}
    />
  )
}
