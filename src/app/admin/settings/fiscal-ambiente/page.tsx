'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Hash,
  Loader2,
  Power,
  Radio,
  Save,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FiscalHelpText } from '../components/FiscalHelpText'
import { FiscalReadinessCard } from '../components/FiscalReadinessCard'
import { FiscalPageSummaryPanel } from '../components/FiscalPageSummaryPanel'
import { loadFiscalEnvironmentAction, saveFiscalEnvironmentAction } from './actions'
import type { CompanyFiscalEnvironment } from '@/lib/types'

interface FormState {
  ambiente: string
  seriePadraoNfe: string
  proximoNumeroNfe: string
  tipoEmissao: string
  emissaoAtiva: boolean
}

const initialForm: FormState = {
  ambiente: 'homologacao',
  seriePadraoNfe: '1',
  proximoNumeroNfe: '1',
  tipoEmissao: 'normal',
  emissaoAtiva: false,
}

const TIPO_EMISSAO_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'contingencia_scan', label: 'Contingência SCAN' },
  { value: 'contingencia_dpec', label: 'Contingência DPEC' },
  { value: 'contingencia_fsda', label: 'Contingência FS-DA' },
  { value: 'contingencia_svcan', label: 'Contingência SVC-AN' },
  { value: 'contingencia_svcrs', label: 'Contingência SVC-RS' },
]

export default function FiscalAmbientePage() {
  const [env, setEnv] = useState<CompanyFiscalEnvironment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirmProducao, setConfirmProducao] = useState(false)
  const [pendingAmbiente, setPendingAmbiente] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(initialForm)
  const [savedForm, setSavedForm] = useState<FormState>(initialForm)

  const hasChanges = JSON.stringify(form) !== JSON.stringify(savedForm)

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const result = await loadFiscalEnvironmentAction()
      if (result.data) {
        setEnv(result.data)
        const loaded: FormState = {
          ambiente: result.data.ambiente || 'homologacao',
          seriePadraoNfe: result.data.serie_padrao_nfe || '1',
          proximoNumeroNfe: result.data.proximo_numero_nfe?.toString() || '1',
          tipoEmissao: result.data.tipo_emissao || 'normal',
          emissaoAtiva: result.data.emissao_ativa || false,
        }
        setForm(loaded)
        setSavedForm(loaded)
      }
      setLoading(false)
    }

    load()
  }, [])

  const handleAmbienteChange = (value: string) => {
    if (value === 'producao' && form.ambiente !== 'producao') {
      setPendingAmbiente(value)
      setConfirmProducao(true)
      return
    }

    updateField('ambiente', value)
  }

  const handleConfirmProducao = () => {
    if (pendingAmbiente) {
      updateField('ambiente', pendingAmbiente)
    }
    setConfirmProducao(false)
    setPendingAmbiente(null)
  }

  const handleSave = async () => {
    setSaving(true)
    const result = await saveFiscalEnvironmentAction({
      id: env?.id,
      ambiente: form.ambiente,
      serie_padrao_nfe: form.seriePadraoNfe,
      proximo_numero_nfe: parseInt(form.proximoNumeroNfe, 10) || 1,
      tipo_emissao: form.tipoEmissao,
      emissao_ativa: form.emissaoAtiva,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Ambiente de emissão salvo com sucesso.')
      setSavedForm({ ...form })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold font-heading text-gradient-navy">Ambiente de Emissão</h1>
          <p className="text-muted-foreground mt-1">
            Controle de homologação, produção, série, numeração e habilitação operacional da NF-e.
          </p>
        </div>
        <Button className="gradient-navy border-0 text-white gap-2" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <FiscalPageSummaryPanel
        badges={[
          { label: form.ambiente === 'producao' ? 'Produção' : 'Homologação', tone: form.ambiente === 'producao' ? 'success' : 'info' },
          { label: form.emissaoAtiva ? 'Emissão ativa' : 'Emissão inativa', tone: form.emissaoAtiva ? 'success' : 'warning' },
          { label: 'Controle operacional', tone: 'neutral' },
        ]}
        items={[
          {
            label: 'Status',
            value: form.emissaoAtiva ? 'Operação habilitada' : 'Operação controlada',
            detail: 'Esta página define como a empresa opera na emissão, não as regras fiscais da base.',
          },
          {
            label: 'Pendências',
            value: form.seriePadraoNfe && form.proximoNumeroNfe && form.tipoEmissao ? 'Sem lacunas locais' : 'Revisar parâmetros básicos',
            detail: 'A checagem final ainda depende da prontidão fiscal geral da empresa.',
          },
          {
            label: 'Última atualização',
            value: env?.updated_at ? new Date(env.updated_at).toLocaleDateString('pt-BR') : 'Ainda não salvo',
            detail: hasChanges ? 'Existem alterações locais ainda não salvas.' : 'Sem alterações pendentes nesta página.',
          },
        ]}
        helperText="Aqui ficam somente parâmetros operacionais de emissão. Dados do emissor, vínculos com bases fiscais e certificado digital são administrados em páginas separadas."
      />

      <FiscalReadinessCard />

      <div className="rounded-2xl border bg-amber-50/60 p-4 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          A liberação de produção e a ativação da emissão passam por uma checagem real de prontidão fiscal no backend.
          Se houver bloqueios, o salvamento explica o que ainda precisa ser resolvido.
        </span>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Card className="glass-card border-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Radio className="h-5 w-5 text-bronze" />
              Ambiente operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleAmbienteChange('homologacao')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                  form.ambiente === 'homologacao'
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-muted/40 bg-muted/10 hover:border-muted/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${form.ambiente === 'homologacao' ? 'bg-blue-500' : 'bg-muted/30'}`}>
                    <Shield className={`h-5 w-5 ${form.ambiente === 'homologacao' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${form.ambiente === 'homologacao' ? 'text-blue-700' : 'text-muted-foreground'}`}>Homologação</div>
                    <div className="text-xs text-muted-foreground">Ambiente de testes e validações</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleAmbienteChange('producao')}
                className={`flex-1 p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                  form.ambiente === 'producao'
                    ? 'border-emerald-500 bg-emerald-50 shadow-md'
                    : 'border-muted/40 bg-muted/10 hover:border-muted/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${form.ambiente === 'producao' ? 'bg-emerald-500' : 'bg-muted/30'}`}>
                    <CheckCircle2 className={`h-5 w-5 ${form.ambiente === 'producao' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className={`font-semibold ${form.ambiente === 'producao' ? 'text-emerald-700' : 'text-muted-foreground'}`}>Produção</div>
                    <div className="text-xs text-muted-foreground">NF-e com validade jurídica</div>
                  </div>
                </div>
              </button>
            </div>

            <AnimatePresence>
              {form.ambiente === 'homologacao' ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Notas emitidas em homologação não possuem validade jurídica e devem ser usadas apenas em testes.</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Hash className="h-5 w-5 text-bronze" />
              Série, numeração e modo de emissão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Série padrão da NF-e
                  <FiscalHelpText text="Série usada na emissão principal. O padrão mais comum é 1, mas a empresa pode operar com outras séries conforme sua governança fiscal." />
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={form.seriePadraoNfe}
                  onChange={(e) => updateField('seriePadraoNfe', e.target.value)}
                  className="bg-white/60"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  Próximo número da NF-e
                  <FiscalHelpText text="Número reservado para a próxima nota fiscal. O sistema deve manter essa trilha íntegra para evitar saltos e conflitos de numeração." />
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={form.proximoNumeroNfe}
                  onChange={(e) => updateField('proximoNumeroNfe', e.target.value)}
                  className="bg-white/60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Tipo de emissão
                <FiscalHelpText text="Use Normal no fluxo principal. Os modos de contingência entram apenas quando a operação fiscal exigir procedimentos alternativos autorizados." />
              </Label>
              <Select value={form.tipoEmissao} onValueChange={(value) => updateField('tipoEmissao', value || 'normal')}>
                <SelectTrigger className="bg-white/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_EMISSAO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
              <div className="flex items-center gap-3">
                <Power className={`h-5 w-5 ${form.emissaoAtiva ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-sm font-medium">Emissão ativa</div>
                  <div className="text-xs text-muted-foreground">
                    Quando ativada, a operação fica autorizada a emitir NF-e dentro do ambiente configurado.
                  </div>
                </div>
              </div>
              <Switch checked={form.emissaoAtiva} onCheckedChange={(value) => updateField('emissaoAtiva', value)} />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="sm:hidden sticky bottom-4 z-10">
        <Button className="w-full h-12 gradient-navy border-0 text-white text-base gap-2 shadow-lg" onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Salvar ambiente de emissão
        </Button>
      </div>

      <AlertDialog open={confirmProducao} onOpenChange={setConfirmProducao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar uso em produção
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao mudar para <strong>Produção</strong>, o sistema passa a tratar a empresa como candidata à emissão com validade jurídica.
              O backend continuará bloqueando a gravação se a prontidão fiscal ainda estiver incompleta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmProducao} className="bg-emerald-600 hover:bg-emerald-700">
              Confirmar produção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
