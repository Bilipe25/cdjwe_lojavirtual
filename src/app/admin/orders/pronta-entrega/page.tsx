import { redirect } from 'next/navigation'

export default function ReadyDeliveryOrdersPage() {
  redirect('/admin/orders/pronta-entrega/estoque')
}
