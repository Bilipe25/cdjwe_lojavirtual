import type { ApprovalStatus, UserRole } from '@/lib/types'

export function getDefaultRouteByRole(role: UserRole, status: ApprovalStatus) {
    if (role === 'admin') return '/admin/dashboard'

    if (status === 'blocked') return '/blocked'
    if (status === 'pending' || status === 'imported') return '/pending-approval'

    if (role === 'representative') return '/sales/dashboard'
    if (role === 'driver') return '/motorista'
    return '/dashboard'
}

export function isBlockedCustomerStatus(role: UserRole, status: ApprovalStatus) {
    return role !== 'admin' && (status === 'pending' || status === 'imported' || status === 'blocked')
}

export function requiresPendingRedirect(role: UserRole, status: ApprovalStatus) {
    return role !== 'admin' && (status === 'pending' || status === 'imported')
}

export function requiresBlockedRedirect(role: UserRole, status: ApprovalStatus) {
    return role !== 'admin' && status === 'blocked'
}
