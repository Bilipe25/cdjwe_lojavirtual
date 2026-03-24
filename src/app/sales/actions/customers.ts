'use server'

import * as internal from './internal'
import {
  customersPageInputSchema,
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
  const parsed = parseWithSchema(representativeCreateCustomerInputSchema, data, 'create_customer_payload')
  return internal.createCustomerAsRepresentativeTx(parsed)
}

export async function updateCustomerAsRepresentativeTx(
  data: Parameters<typeof internal.updateCustomerAsRepresentativeTx>[0]
) {
  const parsed = parseWithSchema(representativeUpdateCustomerInputSchema, data, 'update_customer_payload')
  return internal.updateCustomerAsRepresentativeTx(parsed)
}