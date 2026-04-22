import 'server-only'

import { createHash } from 'node:crypto'

interface CommercialItemIdentityInput {
  productVariantId: string
  productName: string
  sku?: string | null
  commercialCode?: string | null
  colorName?: string | null
  fabricName?: string | null
  sizeName?: string | null
  size?: string | null
}

function normalizeSegment(value: string | null | undefined) {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()

  return normalized || null
}

function buildVariantSuffix(input: CommercialItemIdentityInput) {
  const parts = [
    normalizeSegment(input.colorName),
    normalizeSegment(input.fabricName),
    normalizeSegment(input.sizeName || input.size),
  ].filter(Boolean)

  if (parts.length === 0) return null

  return parts
    .map((part) => String(part).slice(0, 8))
    .join('-')
    .slice(0, 32)
}

export function buildCommercialItemDescription(input: Omit<CommercialItemIdentityInput, 'commercialCode' | 'sku' | 'productVariantId'>) {
  const variantParts = [
    input.colorName?.trim() || null,
    input.fabricName?.trim() || null,
    input.sizeName?.trim() || input.size?.trim() || null,
  ].filter(Boolean)

  return variantParts.length > 0
    ? `${input.productName} - (${variantParts.join(' - ')})`
    : input.productName
}

export function buildCommercialItemCode(input: CommercialItemIdentityInput) {
  const sku = normalizeSegment(input.sku)
  if (sku) return sku.slice(0, 60)

  const commercialCode = normalizeSegment(input.commercialCode)
  const variantSuffix = buildVariantSuffix(input)

  if (commercialCode && variantSuffix) {
    return `${commercialCode}-${variantSuffix}`.slice(0, 60)
  }

  if (commercialCode) return commercialCode.slice(0, 60)

  const fallbackSeed = [
    input.productVariantId,
    input.productName,
    input.colorName,
    input.fabricName,
    input.sizeName || input.size,
  ]
    .filter(Boolean)
    .join('|')

  const digest = createHash('sha1').update(fallbackSeed).digest('hex').slice(0, 12).toUpperCase()
  return `ITEM-${digest}`.slice(0, 60)
}
