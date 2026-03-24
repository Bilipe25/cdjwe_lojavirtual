'use server'

import * as internal from './internal'
import {
  idSchema,
  ordersPageInputSchema,
  parseWithSchema,
  representativeDocumentPayloadSchema,
} from './contracts'

export async function getRepresentativeOrdersData() {
  return internal.getRepresentativeOrdersData()
}

export async function getRepresentativeOrdersPageData(
  input: Parameters<typeof internal.getRepresentativeOrdersPageData>[0]
) {
  const parsed = parseWithSchema(ordersPageInputSchema, input ?? {}, 'orders_page_input')
  return internal.getRepresentativeOrdersPageData(parsed)
}

export async function getRepresentativeOrderDetail(orderId: Parameters<typeof internal.getRepresentativeOrderDetail>[0]) {
  const parsedOrderId = parseWithSchema(idSchema, orderId, 'order_id')
  return internal.getRepresentativeOrderDetail(parsedOrderId)
}

export async function getRepresentativeOrderCompletionData(
  orderId: Parameters<typeof internal.getRepresentativeOrderCompletionData>[0]
) {
  const parsedOrderId = parseWithSchema(idSchema, orderId, 'order_id')
  return internal.getRepresentativeOrderCompletionData(parsedOrderId)
}

export async function getRepresentativeOrderBuilderData() {
  return internal.getRepresentativeOrderBuilderData()
}

export async function createRepresentativeOrderAction(
  payload: Parameters<typeof internal.createRepresentativeOrderAction>[0]
) {
  const parsed = parseWithSchema(representativeDocumentPayloadSchema, payload, 'create_order_payload')
  return internal.createRepresentativeOrderAction(parsed)
}