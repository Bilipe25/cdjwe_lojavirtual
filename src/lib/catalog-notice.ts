export const CATALOG_NOTICE_MAX_CHARACTERS = 2000

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeCatalogNoticePlainText(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized.length > 0 ? normalized : null
}

export function getCatalogNoticeCharacterCount(value: string | null | undefined): number {
  return normalizeCatalogNoticePlainText(value)?.length ?? 0
}

export function plainTextToCatalogNoticeHtml(value: string | null | undefined): string {
  const normalized = normalizeCatalogNoticePlainText(value)

  if (!normalized) return ''

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
