'use server'

import { cookies } from 'next/headers'

export async function setViewAsCustomerAction(active: boolean) {
    const cookieStore = await cookies()
    if (active) {
        cookieStore.set('view_as_customer', 'true', { path: '/' })
    } else {
        cookieStore.delete('view_as_customer')
    }
}
