'use server'

import * as internal from './internal'
import {
  actionError,
  idSchema,
  normalizeActionResult,
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
  try {
    const parsedOrderId = parseWithSchema(idSchema, orderId, 'order_id')
    return normalizeActionResult(await internal.getRepresentativeOrderCompletionData(parsedOrderId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador do pedido.', 'VALIDATION_ERROR')
  }
}

export async function getRepresentativeOrderBuilderData() {
  return internal.getRepresentativeOrderBuilderData()
}

export async function createRepresentativeOrderAction(
  payload: Parameters<typeof internal.createRepresentativeOrderAction>[0]
) {
  try {
    const parsed = parseWithSchema(representativeDocumentPayloadSchema, payload, 'create_order_payload')
    return normalizeActionResult(await internal.createRepresentativeOrderAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados do pedido.', 'VALIDATION_ERROR')
  }
}
