'use server'

import * as internal from './internal'
import {
  actionError,
  customersPageInputSchema,
  normalizeActionResult,
  parseWithSchema,
  representativeCreateCustomerInputSchema,
  representativeUpdateCustomerInputSchema,
} from './contracts'

export async function getRepresentativeCustomersData() {
  return internal.getRepresentativeCustomersData()
}

export async function getRepresentativeCustomersPageData(
  input: Parameters<typeof internal.getRepresentativeCustomersPageData>[0]
) {
  const parsed = parseWithSchema(customersPageInputSchema, input ?? {}, 'customers_page_input')
  return internal.getRepresentativeCustomersPageData(parsed)
}

export async function createCustomerAsRepresentativeTx(
  data: Parameters<typeof internal.createCustomerAsRepresentativeTx>[0]
) {
  try {
    const parsed = parseWithSchema(representativeCreateCustomerInputSchema, data, 'create_customer_payload')
    return normalizeActionResult(await internal.createCustomerAsRepresentativeTx(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados do cliente.', 'VALIDATION_ERROR')
  }
}

export async function updateCustomerAsRepresentativeTx(
  data: Parameters<typeof internal.updateCustomerAsRepresentativeTx>[0]
) {
  try {
    const parsed = parseWithSchema(representativeUpdateCustomerInputSchema, data, 'update_customer_payload')
    return normalizeActionResult(await internal.updateCustomerAsRepresentativeTx(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados do cliente.', 'VALIDATION_ERROR')
  }
}
