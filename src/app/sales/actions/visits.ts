'use server'

import * as internal from './internal'
import {
  actionError,
  idSchema,
  normalizeActionResult,
  parseWithSchema,
  representativeVisitPayloadSchema,
  representativeVisitUpdatePayloadSchema,
  visitsPageInputSchema,
} from './contracts'

export async function getRepresentativeVisitsData() {
  return internal.getRepresentativeVisitsData()
}

export async function getRepresentativeVisitsPageData(
  input: Parameters<typeof internal.getRepresentativeVisitsPageData>[0]
) {
  const parsed = parseWithSchema(visitsPageInputSchema, input ?? {}, 'visits_page_input')
  return internal.getRepresentativeVisitsPageData(parsed)
}

export async function createRepresentativeVisitAction(
  payload: Parameters<typeof internal.createRepresentativeVisitAction>[0]
) {
  try {
    const parsed = parseWithSchema(representativeVisitPayloadSchema, payload, 'create_visit_payload')
    return normalizeActionResult(await internal.createRepresentativeVisitAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados da visita.', 'VALIDATION_ERROR')
  }
}

export async function updateRepresentativeVisitAction(
  payload: Parameters<typeof internal.updateRepresentativeVisitAction>[0]
) {
  try {
    const parsed = parseWithSchema(representativeVisitUpdatePayloadSchema, payload, 'update_visit_payload')
    return normalizeActionResult(await internal.updateRepresentativeVisitAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados da visita.', 'VALIDATION_ERROR')
  }
}

export async function deleteRepresentativeVisitAction(
  visitId: Parameters<typeof internal.deleteRepresentativeVisitAction>[0]
) {
  try {
    const parsedVisitId = parseWithSchema(idSchema, visitId, 'visit_id')
    return normalizeActionResult(await internal.deleteRepresentativeVisitAction(parsedVisitId))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar o identificador da visita.', 'VALIDATION_ERROR')
  }
}
