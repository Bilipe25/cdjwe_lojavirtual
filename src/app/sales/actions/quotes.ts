'use server'

import * as internal from './internal'
import { getActionErrorMessage, idSchema, parseWithSchema, representativeDocumentPayloadSchema } from './contracts'

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
  try {
    const parsed = parseWithSchema(representativeDocumentPayloadSchema, payload, 'save_quote_payload')
    return internal.saveRepresentativeQuoteAction(parsed)
  } catch (error) {
    return { error: getActionErrorMessage(error, 'Nao foi possivel validar os dados do orcamento.') }
  }
}

export async function convertRepresentativeQuoteToOrderAction(
  quoteId: Parameters<typeof internal.convertRepresentativeQuoteToOrderAction>[0]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    return internal.convertRepresentativeQuoteToOrderAction(parsedQuoteId)
  } catch (error) {
    return { error: getActionErrorMessage(error, 'Nao foi possivel validar o identificador do orcamento.') }
  }
}