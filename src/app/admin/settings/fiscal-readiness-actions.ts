'use server'

import { evaluateCompanyFiscalReadiness } from '@/lib/fiscal/company-readiness'

export async function loadFiscalReadinessAction() {
  try {
    const data = await evaluateCompanyFiscalReadiness()
    return { data, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao avaliar prontidão fiscal.'
    return { data: null, error: message }
  }
}
