'use server'

import * as internal from './internal'
import {
  actionError,
  catalogProductsPageInputSchema,
  draftPricingInputSchema,
  normalizeActionResult,
  parseWithSchema,
  paymentOptionsInputSchema,
  productConfiguratorInputSchema,
} from './contracts'

export async function getRepresentativeCatalogProductsPageAction(
  input: Parameters<typeof internal.getRepresentativeCatalogProductsPageAction>[0]
) {
  try {
    const parsed = parseWithSchema(catalogProductsPageInputSchema, input ?? {}, 'catalog_page_input')
    return normalizeActionResult(await internal.getRepresentativeCatalogProductsPageAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar filtros do catalogo.', 'VALIDATION_ERROR')
  }
}

export async function getRepresentativeProductConfiguratorData(
  input: Parameters<typeof internal.getRepresentativeProductConfiguratorData>[0]
) {
  try {
    const parsed = parseWithSchema(productConfiguratorInputSchema, input, 'product_configurator_input')
    return normalizeActionResult(await internal.getRepresentativeProductConfiguratorData(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados do produto.', 'VALIDATION_ERROR')
  }
}

export async function getRepresentativePaymentOptions(
  input: Parameters<typeof internal.getRepresentativePaymentOptions>[0]
) {
  try {
    const parsed = parseWithSchema(paymentOptionsInputSchema, input, 'payment_options_input')
    return normalizeActionResult(await internal.getRepresentativePaymentOptions(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os dados de pagamento.', 'VALIDATION_ERROR')
  }
}

export async function validateRepresentativeDraftPricingAction(
  input: Parameters<typeof internal.validateRepresentativeDraftPricingAction>[0]
) {
  try {
    const parsed = parseWithSchema(draftPricingInputSchema, input, 'draft_pricing_input')
    return normalizeActionResult(await internal.validateRepresentativeDraftPricingAction(parsed))
  } catch (error) {
    return actionError(error, 'Nao foi possivel validar os itens para precificacao.', 'VALIDATION_ERROR')
  }
}
