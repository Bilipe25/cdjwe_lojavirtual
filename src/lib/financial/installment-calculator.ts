/**
 * Installment Calculator — Pure utility for computing installment schedules.
 *
 * Used both server-side (RPC preview) and client-side (modal preview).
 */

export interface InstallmentPreview {
  number: number
  dueDate: string // ISO date string YYYY-MM-DD
  amount: number
}

export interface CalculateInstallmentsInput {
  totalAmount: number
  installmentCount: number
  issueDate: string // ISO date string YYYY-MM-DD
  installmentDays?: string | null // e.g., "30, 60, 90"
}

/**
 * Calculate installment schedule.
 *
 * - Divides `totalAmount` equally across `installmentCount` parcels
 * - Remainder cents are added to the last installment
 * - Due dates default to 30-day intervals from issueDate
 * - If `installmentDays` is provided (e.g., "30, 60, 90"), those offsets are used instead
 *
 * @returns Array of InstallmentPreview
 */
export function calculateInstallments(input: CalculateInstallmentsInput): InstallmentPreview[] {
  const { totalAmount, installmentCount, issueDate, installmentDays } = input

  if (installmentCount < 1 || totalAmount <= 0) return []

  const baseAmount = Math.floor((totalAmount / installmentCount) * 100) / 100
  const remainder = Math.round((totalAmount - baseAmount * installmentCount) * 100) / 100

  // Parse custom day offsets
  let dayOffsets: number[] | null = null
  if (installmentDays && installmentDays.trim()) {
    dayOffsets = installmentDays
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
  }

  const issueDateObj = new Date(issueDate + 'T00:00:00')
  const installments: InstallmentPreview[] = []

  for (let i = 1; i <= installmentCount; i++) {
    const offset = dayOffsets && i <= dayOffsets.length ? dayOffsets[i - 1] : i * 30
    const dueDate = new Date(issueDateObj)
    dueDate.setDate(dueDate.getDate() + offset)

    const amount = i === installmentCount ? baseAmount + remainder : baseAmount

    installments.push({
      number: i,
      dueDate: formatISODate(dueDate),
      amount: Math.round(amount * 100) / 100,
    })
  }

  return installments
}

function formatISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Format a date string to pt-BR display format (DD/MM/YYYY)
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Calculate days overdue from a due date to today.
 * Returns 0 if not yet due.
 */
export function daysOverdue(dueDate: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = today.getTime() - due.getTime()
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0
}
