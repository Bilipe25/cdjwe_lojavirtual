'use server'

import * as internal from './internal'
import {
  idSchema,
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
  const parsed = parseWithSchema(representativeVisitPayloadSchema, payload, 'create_visit_payload')
  return internal.createRepresentativeVisitAction(parsed)
}

export async function updateRepresentativeVisitAction(
  payload: Parameters<typeof internal.updateRepresentativeVisitAction>[0]
) {
  const parsed = parseWithSchema(representativeVisitUpdatePayloadSchema, payload, 'update_visit_payload')
  return internal.updateRepresentativeVisitAction(parsed)
}

export async function deleteRepresentativeVisitAction(
  visitId: Parameters<typeof internal.deleteRepresentativeVisitAction>[0]
) {
  const parsedVisitId = parseWithSchema(idSchema, visitId, 'visit_id')
  return internal.deleteRepresentativeVisitAction(parsedVisitId)
}
