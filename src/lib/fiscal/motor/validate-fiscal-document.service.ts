// ============================================================
// Motor Fiscal — Validate Fiscal Document Service
// Pre-emission validation (SEFAZ rules)
// ============================================================

import type {
  FiscalContext,
  ItemTaxBreakdown,
  DocumentTotals,
  ValidationResult,
  ValidationError,
} from './types'

/**
 * Validates a fiscal document before emission.
 * Returns all errors and warnings found.
 */
export function validateFiscalDocument(
  ctx: FiscalContext,
  items: ItemTaxBreakdown[],
  totals: DocumentTotals
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  // ─── Emitter validations ─────────────────────────

  if (!ctx.emitter.cnpj || ctx.emitter.cnpj.length !== 14) {
    errors.push({
      field: 'emitter.cnpj',
      code: 'EMITTER_INVALID_CNPJ',
      message: 'CNPJ do emitente invalido (deve conter 14 digitos).',
      severity: 'error',
    })
  }

  if (!ctx.emitter.uf || ctx.emitter.uf.length !== 2) {
    errors.push({
      field: 'emitter.uf',
      code: 'EMITTER_MISSING_UF',
      message: 'UF do emitente nao informada.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.ibge || ctx.emitter.ibge.length < 7) {
    errors.push({
      field: 'emitter.ibge',
      code: 'EMITTER_MISSING_IBGE',
      message: 'Codigo IBGE do municipio do emitente nao informado.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.crt || !['1', '2', '3'].includes(ctx.emitter.crt)) {
    errors.push({
      field: 'emitter.crt',
      code: 'EMITTER_INVALID_CRT',
      message: 'CRT do emitente invalido.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.ie) {
    warnings.push({
      field: 'emitter.ie',
      code: 'EMITTER_MISSING_IE',
      message: 'IE do emitente nao informada. Pode ser bloqueante para NF-e.',
      severity: 'warning',
    })
  }

  // ─── Store (Destinatário) validations ─────────────

  if (!ctx.store.document_number || ctx.store.document_number.length < 11) {
    errors.push({
      field: 'store.document_number',
      code: 'STORE_INVALID_DOCUMENT',
      message: 'Documento do destinatario invalido.',
      severity: 'error',
    })
  }

  if (!ctx.store.uf || ctx.store.uf.length !== 2) {
    errors.push({
      field: 'store.uf',
      code: 'STORE_MISSING_UF',
      message: 'UF do destinatario nao informada.',
      severity: 'error',
    })
  }

  if (!ctx.store.ibge || ctx.store.ibge === '0000000') {
    warnings.push({
      field: 'store.ibge',
      code: 'STORE_MISSING_IBGE',
      message: 'Codigo IBGE do municipio do destinatario nao informado. Obrigatorio para NF-e.',
      severity: 'warning',
    })
  }

  if (ctx.store.taxpayer_indicator === 'contributor' && !ctx.store.ie) {
    warnings.push({
      field: 'store.ie',
      code: 'STORE_CONTRIBUTOR_NO_IE',
      message: 'Destinatario marcado como contribuinte mas sem IE informada.',
      severity: 'warning',
    })
  }

  // ─── Environment validations ────────────────────

  if (!ctx.environment.serie_nfe) {
    errors.push({
      field: 'environment.serie_nfe',
      code: 'ENV_MISSING_SERIE',
      message: 'Serie de NF-e nao configurada.',
      severity: 'error',
    })
  }

  if (ctx.environment.proximo_numero_nfe <= 0) {
    errors.push({
      field: 'environment.proximo_numero_nfe',
      code: 'ENV_INVALID_NUMERO',
      message: 'Proximo numero de NF-e invalido.',
      severity: 'error',
    })
  }

  // ─── Item validations ──────────────────────────

  if (items.length === 0) {
    errors.push({
      field: 'items',
      code: 'NO_ITEMS',
      message: 'Documento fiscal sem itens.',
      severity: 'error',
    })
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // NCM validation
    if (!item.ncm || !/^\d{8}$/.test(item.ncm)) {
      errors.push({
        field: `items[${i}].ncm`,
        code: 'ITEM_INVALID_NCM',
        message: `Item "${item.product_name}": NCM invalido (${item.ncm || 'vazio'}). Deve conter 8 digitos.`,
        severity: 'error',
        item_index: i,
      })
    }

    // CFOP validation
    if (!item.cfop || !/^\d{4}$/.test(item.cfop)) {
      errors.push({
        field: `items[${i}].cfop`,
        code: 'ITEM_INVALID_CFOP',
        message: `Item "${item.product_name}": CFOP invalido (${item.cfop || 'vazio'}).`,
        severity: 'error',
        item_index: i,
      })
    }

    // ICMS CST validation
    if (!item.icms.cst) {
      errors.push({
        field: `items[${i}].icms.cst`,
        code: 'ITEM_MISSING_ICMS_CST',
        message: `Item "${item.product_name}": CST ICMS nao informado.`,
        severity: 'error',
        item_index: i,
      })
    }

    // Value validation
    if (item.fiscal_total_value <= 0) {
      errors.push({
        field: `items[${i}].fiscal_total_value`,
        code: 'ITEM_ZERO_VALUE',
        message: `Item "${item.product_name}": valor fiscal zerado.`,
        severity: 'error',
        item_index: i,
      })
    }

    // CEST required when ST is active
    if (item.st.enabled && !item.cest) {
      errors.push({
        field: `items[${i}].cest`,
        code: 'ITEM_ST_MISSING_CEST',
        message: `Item "${item.product_name}": CEST obrigatorio quando ST esta ativa.`,
        severity: 'error',
        item_index: i,
      })
    }

    // Quantity validation
    if (item.quantity <= 0) {
      errors.push({
        field: `items[${i}].quantity`,
        code: 'ITEM_INVALID_QUANTITY',
        message: `Item "${item.product_name}": quantidade invalida.`,
        severity: 'error',
        item_index: i,
      })
    }
  }

  // ─── Totals validations ─────────────────────────

  if (totals.vNF <= 0) {
    errors.push({
      field: 'totals.vNF',
      code: 'TOTALS_ZERO_VNF',
      message: 'Valor total da nota fiscal zerado ou negativo.',
      severity: 'error',
    })
  }

  // Check item sum consistency (tolerance: R$ 0.05)
  const sumProd = items.reduce((s, item) => s + item.fiscal_total_value, 0)
  if (Math.abs(sumProd - totals.vProd) > 0.05) {
    warnings.push({
      field: 'totals.vProd',
      code: 'TOTALS_PROD_MISMATCH',
      message: `Soma dos itens (${sumProd.toFixed(2)}) diverge do total de produtos (${totals.vProd.toFixed(2)}).`,
      severity: 'warning',
    })
  }

  // Max items per nota check
  if (items.length > ctx.environment.max_itens_por_nota) {
    errors.push({
      field: 'items.length',
      code: 'ITEMS_EXCEED_MAX',
      message: `Numero de itens (${items.length}) excede o maximo configurado (${ctx.environment.max_itens_por_nota}).`,
      severity: 'error',
    })
  }

  return {
    is_valid: errors.length === 0,
    errors,
    warnings,
    checked_at: new Date().toISOString(),
  }
}
