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
import {
  getUnsupportedFiscalEmissionModeMessage,
  isOperationalFiscalEmissionModeSupported,
} from '@/lib/fiscal/emission-mode'

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
  const emitterIeDigits = (ctx.emitter.ie || '').replace(/\D/g, '')
  const storeIeDigits = (ctx.store.ie || '').replace(/\D/g, '')

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

  if (!ctx.emitter.ibge || ctx.emitter.ibge.length < 7 || ctx.emitter.ibge === '0000000') {
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
  } else if (ctx.emitter.ie !== 'ISENTO' && emitterIeDigits.length < 2) {
    errors.push({
      field: 'emitter.ie',
      code: 'EMITTER_INVALID_IE',
      message: 'Inscricao estadual do emitente invalida.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.logradouro || ctx.emitter.logradouro.trim().length < 2) {
    errors.push({
      field: 'emitter.logradouro',
      code: 'EMITTER_MISSING_LOGRADOURO',
      message: 'Logradouro fiscal do emitente nao informado.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.bairro || ctx.emitter.bairro.trim().length < 2) {
    errors.push({
      field: 'emitter.bairro',
      code: 'EMITTER_MISSING_BAIRRO',
      message: 'Bairro fiscal do emitente nao informado.',
      severity: 'error',
    })
  }

  if (!ctx.emitter.cidade || ctx.emitter.cidade.trim().length < 2) {
    errors.push({
      field: 'emitter.cidade',
      code: 'EMITTER_MISSING_CIDADE',
      message: 'Cidade fiscal do emitente nao informada.',
      severity: 'error',
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

  if (!ctx.store.ibge || ctx.store.ibge.length < 7 || ctx.store.ibge === '0000000') {
    errors.push({
      field: 'store.ibge',
      code: 'STORE_MISSING_IBGE',
      message: 'Codigo IBGE do municipio do destinatario nao informado. Obrigatorio para NF-e.',
      severity: 'error',
    })
  }

  if (ctx.store.taxpayer_indicator === 'contributor' && !ctx.store.ie) {
    warnings.push({
      field: 'store.ie',
      code: 'STORE_CONTRIBUTOR_NO_IE',
      message: 'Destinatario marcado como contribuinte mas sem IE informada.',
      severity: 'warning',
    })
  } else if (ctx.store.ie && ctx.store.ie !== 'ISENTO' && storeIeDigits.length < 2) {
    errors.push({
      field: 'store.ie',
      code: 'STORE_INVALID_IE',
      message: 'Inscricao estadual do destinatario invalida.',
      severity: 'error',
    })
  }

  if (!ctx.store.logradouro || ctx.store.logradouro.trim().length < 2) {
    errors.push({
      field: 'store.logradouro',
      code: 'STORE_MISSING_LOGRADOURO',
      message: 'Logradouro do destinatario nao informado.',
      severity: 'error',
    })
  }

  if (!ctx.store.bairro || ctx.store.bairro.trim().length < 2) {
    errors.push({
      field: 'store.bairro',
      code: 'STORE_MISSING_BAIRRO',
      message: 'Bairro do destinatario nao informado.',
      severity: 'error',
    })
  }

  if (!ctx.store.cidade || ctx.store.cidade.trim().length < 2) {
    errors.push({
      field: 'store.cidade',
      code: 'STORE_MISSING_CIDADE',
      message: 'Cidade do destinatario nao informada.',
      severity: 'error',
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

  if (!ctx.environment.emissao_ativa) {
    errors.push({
      field: 'environment.emissao_ativa',
      code: 'ENV_EMISSION_DISABLED',
      message: 'A emissao fiscal esta desativada no ambiente de emissao.',
      severity: 'error',
    })
  }

  if (!isOperationalFiscalEmissionModeSupported(ctx.environment.tipo_emissao)) {
    errors.push({
      field: 'environment.tipo_emissao',
      code: 'ENV_UNSUPPORTED_EMISSION_MODE',
      message: getUnsupportedFiscalEmissionModeMessage(ctx.environment.tipo_emissao)
        || 'O tipo de emissao configurado ainda nao esta operacional no fluxo atual.',
      severity: 'error',
    })
  }

  if (!ctx.operation.natureza_operacao_descricao || ctx.operation.natureza_operacao_descricao.trim().length < 3) {
    errors.push({
      field: 'operation.natureza_operacao_descricao',
      code: 'OPERATION_MISSING_NATUREZA',
      message: 'Natureza da operacao fiscal nao informada.',
      severity: 'error',
    })
  }

  if (ctx.operation.cfop_global_code && !/^\d{4}$/.test(ctx.operation.cfop_global_code)) {
    errors.push({
      field: 'operation.cfop_global_code',
      code: 'OPERATION_INVALID_CFOP_GLOBAL',
      message: 'CFOP global do pedido invalido.',
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

    if (ctx.operation.cfop_global_code && item.cfop_source !== 'item_override' && item.cfop !== ctx.operation.cfop_global_code) {
      warnings.push({
        field: `items[${i}].cfop`,
        code: 'ITEM_CFOP_GLOBAL_DIVERGENCE',
        message: `Item "${item.product_name}": CFOP efetivo difere do CFOP global configurado para o pedido.`,
        severity: 'warning',
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

  if (ctx.transport.freight_value > 0 && ctx.transport.freight_mode === 'sem_frete') {
    errors.push({
      field: 'transport.freight_mode',
      code: 'TRANSPORT_MODE_INCOMPATIBLE',
      message: 'Modalidade do frete esta como "sem frete", mas existe valor de frete informado.',
      severity: 'error',
    })
  }

  if (ctx.transport.transporter_document && ctx.transport.transporter_document.length < 11) {
    errors.push({
      field: 'transport.transporter_document',
      code: 'TRANSPORT_INVALID_DOCUMENT',
      message: 'Documento do transportador invalido.',
      severity: 'error',
    })
  }

  if (ctx.transport.freight_mode !== 'sem_frete' && ctx.transport.freight_value <= 0) {
    warnings.push({
      field: 'transport.freight_value',
      code: 'TRANSPORT_ZERO_FREIGHT_VALUE',
      message: 'Existe modalidade de frete informada, mas o valor do frete esta zerado.',
      severity: 'warning',
    })
  }

  if (ctx.transport.vehicle_uf && ctx.transport.vehicle_uf.length !== 2) {
    errors.push({
      field: 'transport.vehicle_uf',
      code: 'TRANSPORT_INVALID_VEHICLE_UF',
      message: 'UF do veiculo invalida.',
      severity: 'error',
    })
  }

  if (ctx.transport.freight_mode === 'terceiros' && !ctx.transport.transporter_name) {
    warnings.push({
      field: 'transport.transporter_name',
      code: 'TRANSPORT_MISSING_NAME',
      message: 'Frete por terceiros configurado sem nome da transportadora.',
      severity: 'warning',
    })
  }

  for (let volumeIndex = 0; volumeIndex < ctx.volumes.length; volumeIndex++) {
    const volume = ctx.volumes[volumeIndex]
    if (!volume.species || volume.species.trim().length < 2) {
      errors.push({
        field: `volumes[${volumeIndex}].species`,
        code: 'VOLUME_MISSING_SPECIES',
        message: `Volume ${volumeIndex + 1}: especie nao informada.`,
        severity: 'error',
      })
    }

    if (volume.quantity <= 0) {
      errors.push({
        field: `volumes[${volumeIndex}].quantity`,
        code: 'VOLUME_INVALID_QUANTITY',
        message: `Volume ${volumeIndex + 1}: quantidade invalida.`,
        severity: 'error',
      })
    }

    if (volume.gross_weight !== null && volume.gross_weight < 0) {
      errors.push({
        field: `volumes[${volumeIndex}].gross_weight`,
        code: 'VOLUME_INVALID_GROSS_WEIGHT',
        message: `Volume ${volumeIndex + 1}: peso bruto invalido.`,
        severity: 'error',
      })
    }

    if (volume.net_weight !== null && volume.net_weight < 0) {
      errors.push({
        field: `volumes[${volumeIndex}].net_weight`,
        code: 'VOLUME_INVALID_NET_WEIGHT',
        message: `Volume ${volumeIndex + 1}: peso liquido invalido.`,
        severity: 'error',
      })
    }

    if (
      volume.gross_weight !== null &&
      volume.net_weight !== null &&
      volume.net_weight > volume.gross_weight
    ) {
      warnings.push({
        field: `volumes[${volumeIndex}]`,
        code: 'VOLUME_NET_GT_GROSS',
        message: `Volume ${volumeIndex + 1}: peso liquido maior que o peso bruto.`,
        severity: 'warning',
      })
    }
  }

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

  const totalVolumes = ctx.volumes.reduce((sum, volume) => sum + volume.quantity, 0)
  if (totalVolumes !== totals.volume_count) {
    warnings.push({
      field: 'totals.volume_count',
      code: 'TOTALS_VOLUME_MISMATCH',
      message: `Somatorio dos volumes (${totalVolumes}) diverge do total consolidado (${totals.volume_count}).`,
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
