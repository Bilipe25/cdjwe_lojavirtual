'use server'

import {
  getRepresentativeDashboardData as getRepresentativeDashboardDataByDomain,
  getRepresentativeShellData as getRepresentativeShellDataByDomain,
} from './actions/dashboard'
import {
  createCustomerAsRepresentativeTx as createCustomerAsRepresentativeTxByDomain,
  getRepresentativeCustomersData as getRepresentativeCustomersDataByDomain,
  getRepresentativeCustomersPageData as getRepresentativeCustomersPageDataByDomain,
  updateCustomerAsRepresentativeTx as updateCustomerAsRepresentativeTxByDomain,
} from './actions/customers'
import {
  createRepresentativeOrderAction as createRepresentativeOrderActionByDomain,
  getRepresentativeOrderBuilderData as getRepresentativeOrderBuilderDataByDomain,
  getRepresentativeOrderCompletionData as getRepresentativeOrderCompletionDataByDomain,
  getRepresentativeOrderDetail as getRepresentativeOrderDetailByDomain,
  getRepresentativeOrdersData as getRepresentativeOrdersDataByDomain,
  getRepresentativeOrdersPageData as getRepresentativeOrdersPageDataByDomain,
} from './actions/orders'
import {
  convertRepresentativeQuoteToOrderAction as convertRepresentativeQuoteToOrderActionByDomain,
  getRepresentativeQuoteDetail as getRepresentativeQuoteDetailByDomain,
  getRepresentativeQuotesData as getRepresentativeQuotesDataByDomain,
  saveRepresentativeQuoteAction as saveRepresentativeQuoteActionByDomain,
} from './actions/quotes'
import {
  getRepresentativeCatalogProductsPageAction as getRepresentativeCatalogProductsPageActionByDomain,
  getRepresentativePaymentOptions as getRepresentativePaymentOptionsByDomain,
  getRepresentativeProductConfiguratorData as getRepresentativeProductConfiguratorDataByDomain,
  validateRepresentativeDraftPricingAction as validateRepresentativeDraftPricingActionByDomain,
} from './actions/pricing'
import {
  createRepresentativeVisitAction as createRepresentativeVisitActionByDomain,
  getRepresentativeVisitsData as getRepresentativeVisitsDataByDomain,
} from './actions/visits'

export async function getRepresentativeShellData() {
  return getRepresentativeShellDataByDomain()
}

export async function getRepresentativeDashboardData() {
  return getRepresentativeDashboardDataByDomain()
}

export async function getRepresentativeCustomersData() {
  return getRepresentativeCustomersDataByDomain()
}

export async function getRepresentativeCustomersPageData(
  ...args: Parameters<typeof getRepresentativeCustomersPageDataByDomain>
) {
  return getRepresentativeCustomersPageDataByDomain(...args)
}

export async function getRepresentativeOrdersData() {
  return getRepresentativeOrdersDataByDomain()
}

export async function getRepresentativeOrdersPageData(
  ...args: Parameters<typeof getRepresentativeOrdersPageDataByDomain>
) {
  return getRepresentativeOrdersPageDataByDomain(...args)
}

export async function getRepresentativeOrderDetail(
  ...args: Parameters<typeof getRepresentativeOrderDetailByDomain>
) {
  return getRepresentativeOrderDetailByDomain(...args)
}

export async function getRepresentativeOrderCompletionData(
  ...args: Parameters<typeof getRepresentativeOrderCompletionDataByDomain>
) {
  return getRepresentativeOrderCompletionDataByDomain(...args)
}

export async function getRepresentativeQuotesData() {
  return getRepresentativeQuotesDataByDomain()
}

export async function getRepresentativeQuoteDetail(
  ...args: Parameters<typeof getRepresentativeQuoteDetailByDomain>
) {
  return getRepresentativeQuoteDetailByDomain(...args)
}

export async function getRepresentativeVisitsData() {
  return getRepresentativeVisitsDataByDomain()
}

export async function getRepresentativeOrderBuilderData() {
  return getRepresentativeOrderBuilderDataByDomain()
}

export async function getRepresentativeCatalogProductsPageAction(
  ...args: Parameters<typeof getRepresentativeCatalogProductsPageActionByDomain>
) {
  return getRepresentativeCatalogProductsPageActionByDomain(...args)
}

export async function getRepresentativeProductConfiguratorData(
  ...args: Parameters<typeof getRepresentativeProductConfiguratorDataByDomain>
) {
  return getRepresentativeProductConfiguratorDataByDomain(...args)
}

export async function getRepresentativePaymentOptions(
  ...args: Parameters<typeof getRepresentativePaymentOptionsByDomain>
) {
  return getRepresentativePaymentOptionsByDomain(...args)
}

export async function validateRepresentativeDraftPricingAction(
  ...args: Parameters<typeof validateRepresentativeDraftPricingActionByDomain>
) {
  return validateRepresentativeDraftPricingActionByDomain(...args)
}

export async function createRepresentativeVisitAction(
  ...args: Parameters<typeof createRepresentativeVisitActionByDomain>
) {
  return createRepresentativeVisitActionByDomain(...args)
}

export async function createRepresentativeOrderAction(
  ...args: Parameters<typeof createRepresentativeOrderActionByDomain>
) {
  return createRepresentativeOrderActionByDomain(...args)
}

export async function saveRepresentativeQuoteAction(
  ...args: Parameters<typeof saveRepresentativeQuoteActionByDomain>
) {
  return saveRepresentativeQuoteActionByDomain(...args)
}

export async function convertRepresentativeQuoteToOrderAction(
  ...args: Parameters<typeof convertRepresentativeQuoteToOrderActionByDomain>
) {
  return convertRepresentativeQuoteToOrderActionByDomain(...args)
}

export async function createCustomerAsRepresentativeTx(
  ...args: Parameters<typeof createCustomerAsRepresentativeTxByDomain>
) {
  return createCustomerAsRepresentativeTxByDomain(...args)
}

export async function updateCustomerAsRepresentativeTx(
  ...args: Parameters<typeof updateCustomerAsRepresentativeTxByDomain>
) {
  return updateCustomerAsRepresentativeTxByDomain(...args)
}