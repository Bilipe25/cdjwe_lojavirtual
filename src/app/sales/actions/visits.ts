'use server'

import * as internal from './internal'
import { parseWithSchema, representativeVisitPayloadSchema } from './contracts'

export async function getRepresentativeVisitsData() {
  return internal.getRepresentativeVisitsData()
}

export async function createRepresentativeVisitAction(
  payload: Parameters<typeof internal.createRepresentativeVisitAction>[0]
) {
  const parsed = parseWithSchema(representativeVisitPayloadSchema, payload, 'create_visit_payload')
  return internal.createRepresentativeVisitAction(parsed)
}