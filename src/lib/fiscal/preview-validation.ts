interface PreviewValidationEntry {
  code: string
  message: string
}

interface PreviewValidationShape {
  errors: PreviewValidationEntry[]
}

export const PREVIEW_VALIDATION_IGNORED_CODES = new Set([
  'ENV_EMISSION_DISABLED',
  'ENV_UNSUPPORTED_EMISSION_MODE',
])

export function getPreviewBlockingErrors(validation?: PreviewValidationShape | null) {
  if (!validation) return []

  return validation.errors.filter(
    (error) => !PREVIEW_VALIDATION_IGNORED_CODES.has(error.code)
  )
}

export function getPreviewBlockingMessage(validation?: PreviewValidationShape | null) {
  const blockingErrors = getPreviewBlockingErrors(validation)
  return blockingErrors[0]?.message || null
}
