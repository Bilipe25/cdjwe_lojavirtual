'use server'

import * as internal from './internal'

export async function getRepresentativeShellData() {
  return internal.getRepresentativeShellData()
}

export async function getRepresentativeDashboardData() {
  return internal.getRepresentativeDashboardData()
}