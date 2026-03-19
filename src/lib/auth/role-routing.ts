import type { ApprovalStatus, UserRole } from '@/lib/types'

export function getDefaultRouteByRole(role: UserRole, status: ApprovalStatus) {
    if (role === 'admin') return '/admin/dashboard'
    if (role === 'representative') return '/sales/dashboard'

    if (status === 'pending' || status === 'imported') return '/pending-approval'
    if (status === 'blocked') return '/blocked'
    return '/dashboard'
}

export function isBlockedCustomerStatus(role: UserRole, status: ApprovalStatus) {
    return role === 'client' && (status === 'pending' || status === 'imported' || status === 'blocked')
}

export function requiresPendingRedirect(role: UserRole, status: ApprovalStatus) {
    return role === 'client' && (status === 'pending' || status === 'imported')
}

export function requiresBlockedRedirect(role: UserRole, status: ApprovalStatus) {
    return role === 'client' && status === 'blocked'
}
