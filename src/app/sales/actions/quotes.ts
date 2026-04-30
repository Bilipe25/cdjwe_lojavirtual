'use server'

import * as internal from './internal'
import {
  actionError,
  idSchema,
  normalizeActionResult,
  parseWithSchema,
  quoteStatusSchema,
  quotesPageInputSchema,
  representativeDocumentPayloadSchema,
} from './contracts'

export async function getRepresentativeQuotesData() {
  return internal.getRepresentativeQuotesData()
}

export async function getRepresentativeQuotesPageData(
  input: Parameters<typeof internal.getRepresentativeQuotesPageData>[0]
) {
  const parsed = parseWithSchema(quotesPageInputSchema, input ?? {}, 'quotes_page_input')
  return internal.getRepresentativeQuotesPageData(parsed)
}

export async function getRepresentativeQuoteDetail(quoteId: Parameters<typeof internal.getRepresentativeQuoteDetail>[0]) {
  const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
  return internal.getRepresentativeQuoteDetail(parsedQuoteId)
}

export async function getRepresentativeQuoteTimeline(
  quoteId: Parameters<typeof internal.getRepresentativeQuoteTimeline>[0]
) {
  const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
  return internal.getRepresentativeQuoteTimeline(parsedQuoteId)
}

export async function saveRepresentativeQuoteAction(
  payload: Parameters<typeof internal.saveRepresentativeQuoteAction>[0]
) {
  try {
    const parsed = parseWithSchema(representativeDocumentPayloadSchema, payload, 'save_quote_payload')
    return normalizeActionResult(await internal.saveRepresentativeQuoteAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados do orcamento.', 'VALIDATION_ERROR')
  }
}

export async function convertRepresentativeQuoteToOrderAction(
  quoteId: Parameters<typeof internal.convertRepresentativeQuoteToOrderAction>[0]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    return normalizeActionResult(await internal.convertRepresentativeQuoteToOrderAction(parsedQuoteId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador do orcamento.', 'VALIDATION_ERROR')
  }
}

export async function cancelRepresentativeQuoteAction(
  quoteId: Parameters<typeof internal.cancelRepresentativeQuoteAction>[0]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    return normalizeActionResult(await internal.cancelRepresentativeQuoteAction(parsedQuoteId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador do orcamento.', 'VALIDATION_ERROR')
  }
}

export async function duplicateRepresentativeQuoteAction(
  quoteId: Parameters<typeof internal.duplicateRepresentativeQuoteAction>[0]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    return normalizeActionResult(await internal.duplicateRepresentativeQuoteAction(parsedQuoteId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador do orcamento.', 'VALIDATION_ERROR')
  }
}

export async function deleteRepresentativeQuoteAction(
  quoteId: Parameters<typeof internal.deleteRepresentativeQuoteAction>[0]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    return normalizeActionResult(await internal.deleteRepresentativeQuoteAction(parsedQuoteId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador do orcamento.', 'VALIDATION_ERROR')
  }
}

export async function updateRepresentativeQuoteStatusAction(
  quoteId: Parameters<typeof internal.updateRepresentativeQuoteStatusAction>[0],
  targetStatus: Parameters<typeof internal.updateRepresentativeQuoteStatusAction>[1]
) {
  try {
    const parsedQuoteId = parseWithSchema(idSchema, quoteId, 'quote_id')
    const parsedStatus = parseWithSchema(quoteStatusSchema, targetStatus, 'quote_status')
    if (parsedStatus === 'converted') {
      return actionError('Status convertido nao pode ser aplicado manualmente.', 'Status convertido nao pode ser aplicado manualmente.', 'BUSINESS_RULE_ERROR')
    }
    return normalizeActionResult(await internal.updateRepresentativeQuoteStatusAction(parsedQuoteId, parsedStatus))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar status ou identificador do orcamento.', 'VALIDATION_ERROR')
  }
}
