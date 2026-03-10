'use client'

import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { AdminMobileHeader } from '@/components/layout/admin-mobile-header'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen">
            <AdminSidebar />
            <div className="flex-1 flex flex-col">
                <AdminMobileHeader />
                <main className="flex-1 p-4 md:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
