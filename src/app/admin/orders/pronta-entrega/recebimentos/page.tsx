import { getReadyDeliveryReceipts } from '../actions'
import { ReadyDeliveryReceiptsClient } from './_client'

export default async function ReadyDeliveryReceiptsPage() {
  const rows = await getReadyDeliveryReceipts()
  return <ReadyDeliveryReceiptsClient rows={rows as any} />
}
