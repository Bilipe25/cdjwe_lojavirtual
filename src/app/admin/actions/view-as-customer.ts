'use server'

import { cookies } from 'next/headers'

export async function setViewAsCustomerAction(active: boolean) {
    const cookieStore = await cookies()
    if (active) {
        cookieStore.set('view_as_customer', 'true', { path: '/' })
        cookieStore.delete('view_as_representative')
    } else {
        cookieStore.delete('view_as_customer')
    }
}

export async function setViewAsRepresentativeAction(active: boolean) {
    const cookieStore = await cookies()
    if (active) {
        cookieStore.set('view_as_representative', 'true', { path: '/' })
        cookieStore.delete('view_as_customer')
    } else {
        cookieStore.delete('view_as_representative')
    }
}
