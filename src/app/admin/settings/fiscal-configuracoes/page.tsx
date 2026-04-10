'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, SlidersHorizontal } from 'lucide-react'
import { EmitterTaxesTab } from '../fiscal-emitente/components/EmitterTaxesTab'
import { loadEmitterFederalTaxConfig, loadEmitterIcmsLinks, loadEmitterIbscbsLinks } from '../fiscal-emitente/emitter-taxes'
import { FiscalPageSummaryPanel } from '../components/FiscalPageSummaryPanel'

function formatDateLabel(value: string | null | undefined) {
  if (!value) return 'Ainda não salvo'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Ainda não salvo'
  return date.toLocaleDateString('pt-BR')
}

export default function FiscalConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [federalUpdatedAt, setFederalUpdatedAt] = useState<string | null>(null)
  const [icmsCount, setIcmsCount] = useState(0)
  const [ibscbsCount, setIbscbsCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const [federalResult, icmsResult, ibscbsResult] = await Promise.all([
        loadEmitterFederalTaxConfig(),
        loadEmitterIcmsLinks(),
        loadEmitterIbscbsLinks(),
      ])

      setFederalUpdatedAt(federalResult.data?.updated_at || null)
      setIcmsCount(icmsResult.data.length)
      setIbscbsCount(ibscbsResult.data.length)
      setLoading(false)
    }

    load()
  }, [])

  const pendingCount = useMemo(() => {
    let count = 0
    if (!federalUpdatedAt) count += 1
    if (icmsCount === 0) count += 1
    if (ibscbsCount === 0) count += 1
    return count
  }, [federalUpdatedAt, icmsCount, ibscbsCount])

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold font-heading text-gradient-navy">Configurações Fiscais</h1>
        <p className="text-muted-foreground mt-1">
          Preferências fiscais do emitente e vínculos corporativos com bases tributárias por UF.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-background/70 px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando resumo das configurações fiscais...
        </div>
      ) : (
        <FiscalPageSummaryPanel
          badges={[
            { label: pendingCount === 0 ? 'Configuração fiscal revisada' : 'Configuração fiscal em andamento', tone: pendingCount === 0 ? 'success' : 'warning' },
            { label: 'Vínculos com bases fiscais', tone: 'info' },
            { label: 'Sem cadastro institucional', tone: 'neutral' },
          ]}
          items={[
            {
              label: 'Status',
              value: pendingCount === 0 ? 'Cobertura corporativa definida' : 'Há pontos para revisar',
              detail: 'Esta página cuida de preferências fiscais do emitente e vínculos por UF.',
            },
            {
              label: 'Pendências',
              value: pendingCount === 0 ? 'Nenhuma crítica' : `${pendingCount} bloco(s) em aberto`,
              detail: `ICMS: ${icmsCount} vínculo(s) • IBS/CBS: ${ibscbsCount} vínculo(s)`,
            },
            {
              label: 'Última atualização',
              value: formatDateLabel(federalUpdatedAt),
              detail: federalUpdatedAt
                ? 'Usando a atualização das preferências fiscais corporativas.'
                : 'As preferências corporativas ainda não foram salvas.',
            },
          ]}
          helperText="Aqui ficam regras e preferências do emitente que complementam as bases fiscais. Dados cadastrais continuam em Dados do Emitente, enquanto série, ambiente e certificado ficam nas páginas operacionais."
        />
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border bg-amber-50/60 p-4 text-sm text-amber-800 flex items-start gap-3">
          <SlidersHorizontal className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Esta área centraliza preferências fiscais do emitente e vínculos com bases tributárias. Dados cadastrais da
            empresa ficam em <strong>Dados do Emitente</strong>, enquanto série, numeração e ativação operacional ficam em{' '}
            <strong>Ambiente de Emissão</strong>.
          </span>
        </div>
      </motion.div>

      <EmitterTaxesTab />
    </div>
  )
}
