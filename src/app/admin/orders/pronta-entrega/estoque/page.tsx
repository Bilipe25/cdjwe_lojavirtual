import { getReadyDeliveryStockOverview } from '../actions'
import { ReadyDeliveryStockClient } from './_client'

export default async function ReadyDeliveryStockPage() {
  const rows = await getReadyDeliveryStockOverview()
  return <ReadyDeliveryStockClient rows={rows} />
}
