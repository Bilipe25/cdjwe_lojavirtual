'use server'

import * as internal from './internal'
import { idSchema, parseWithSchema, representativeDocumentPayloadSchema } from './contracts'

export async function getRepresentativeQuotesData() {
  return internal.getRepresentativeQuotesData()
}

export async function getRepresentativeQuoteDetail(quoteId: Parameters<typeof internal.getRepresentativeQuoteDetail>[0]) {
  const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
  return internal.getRepresentativeQuoteDetail(parsedQuoteId)
}

export async function saveRepresentativeQuoteAction(
  payload: Parameters<typeof internal.saveRepresentativeQuoteAction>[0]
) {
  const parsed = parseWithSchema(representativeDocumentPayloadSchema, payload, 'save_quote_payload')
  return internal.saveRepresentativeQuoteAction(parsed)
}

export async function convertRepresentativeQuoteToOrderAction(
  quoteId: Parameters<typeof internal.convertRepresentativeQuoteToOrderAction>[0]
) {
  const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
  return internal.convertRepresentativeQuoteToOrderAction(parsedQuoteId)
}