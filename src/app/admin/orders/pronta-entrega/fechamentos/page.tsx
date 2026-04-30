import { getReadyDeliveryClosings } from '../actions'
import { ReadyDeliveryClosingsClient } from './_client'

export default async function ReadyDeliveryClosingsPage() {
  const rows = await getReadyDeliveryClosings()
  return <ReadyDeliveryClosingsClient initialRows={rows as any} />
}
