import { getReadyDeliveryMovements } from '../actions'
import { ReadyDeliveryMovementsClient } from './_client'

export default async function ReadyDeliveryMovementsPage() {
  const rows = await getReadyDeliveryMovements()
  return <ReadyDeliveryMovementsClient rows={rows as any} />
}
