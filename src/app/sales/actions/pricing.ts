'use server'

import * as internal from './internal'
import {
  catalogProductsPageInputSchema,
  draftPricingInputSchema,
  parseWithSchema,
  paymentOptionsInputSchema,
  productConfiguratorInputSchema,
} from './contracts'

export async function getRepresentativeCatalogProductsPageAction(
  input: Parameters<typeof internal.getRepresentativeCatalogProductsPageAction>[0]
) {
  const parsed = parseWithSchema(catalogProductsPageInputSchema, input ?? {}, 'catalog_page_input')
  return internal.getRepresentativeCatalogProductsPageAction(parsed)
}

export async function getRepresentativeProductConfiguratorData(
  input: Parameters<typeof internal.getRepresentativeProductConfiguratorData>[0]
) {
  const parsed = parseWithSchema(productConfiguratorInputSchema, input, 'product_configurator_input')
  return internal.getRepresentativeProductConfiguratorData(parsed)
}

export async function getRepresentativePaymentOptions(
  input: Parameters<typeof internal.getRepresentativePaymentOptions>[0]
) {
  const parsed = parseWithSchema(paymentOptionsInputSchema, input, 'payment_options_input')
  return internal.getRepresentativePaymentOptions(parsed)
}

export async function validateRepresentativeDraftPricingAction(
  input: Parameters<typeof internal.validateRepresentativeDraftPricingAction>[0]
) {
  const parsed = parseWithSchema(draftPricingInputSchema, input, 'draft_pricing_input')
  return internal.validateRepresentativeDraftPricingAction(parsed)
}