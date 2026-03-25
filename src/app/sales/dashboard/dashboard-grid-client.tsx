'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  MapPinned,
  Palette,
  ShoppingBag,
  Sofa,
  Users,
} from 'lucide-react'

const dashboardActions = [
  { label: 'Venda', href: '/sales/orders/new', icon: ShoppingBag, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Orcamento', href: '/sales/quotes/new', icon: FileText, color: 'bg-bronze/10 hover:bg-bronze/20', iconColor: 'text-bronze' },
  { label: 'Visita', href: '/sales/visits', icon: MapPinned, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Clientes', href: '/sales/customers', icon: Users, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Pedidos', href: '/sales/orders', icon: ClipboardCheck, color: 'bg-bronze/10 hover:bg-bronze/20', iconColor: 'text-bronze' },
  { label: 'Orcamentos', href: '/sales/quotes', icon: BarChart3, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
  { label: 'Catalogo de tecidos', href: '/sales/fabrics', icon: Palette, color: 'bg-bronze/10 hover:bg-bronze/20', iconColor: 'text-bronze' },
  { label: 'Catalogo de produtos', href: '/sales/catalog', icon: Sofa, color: 'bg-primary/5 hover:bg-primary/10', iconColor: 'text-primary' },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

export function DashboardGridClient() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-3 sm:grid-cols-3 lg:grid-cols-8"
    >
      {dashboardActions.map((action) => (
        <motion.div key={action.href} variants={item}>
          <Link href={action.href}>
            <motion.div
              whileTap={{ scale: 0.95 }}
              className={`relative flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-border/40 p-4 shadow-sm transition-all duration-200 ${action.color} min-h-[100px]`}
            >
              <action.icon className={`h-7 w-7 ${action.iconColor}`} />
              <span className="text-center text-xs font-semibold leading-tight text-foreground">{action.label}</span>
            </motion.div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  )
}

