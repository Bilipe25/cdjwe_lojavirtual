'use client'

import { motion } from 'framer-motion'
import { SlidersHorizontal } from 'lucide-react'
import { EmitterTaxesTab } from '../fiscal-emitente/components/EmitterTaxesTab'

export default function FiscalConfiguracoesPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Configurações Fiscais</h1>
        <p className="text-muted-foreground mt-1">
          Preferências fiscais do emitente e vínculos com bases de ICMS e IBS/CBS por UF.
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border bg-amber-50/60 p-4 text-sm text-amber-800 flex items-start gap-3">
          <SlidersHorizontal className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Esta área concentra preferências fiscais do emitente e vínculos com bases tributárias. Os dados cadastrais da
            empresa ficam em <strong>Dados do Emitente</strong>, enquanto série, numeração e ativação operacional ficam em{' '}
            <strong>Ambiente de Emissão</strong>.
          </span>
        </div>
      </motion.div>

      <EmitterTaxesTab />
    </div>
  )
}
