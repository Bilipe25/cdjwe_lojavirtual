'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileBadge,
  Fingerprint,
  Loader2,
  LockKeyhole,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { FiscalHelpText } from '../components/FiscalHelpText'
import { FiscalPageSummaryPanel } from '../components/FiscalPageSummaryPanel'
import { loadCertificateAction, saveCertificateAction, uploadCertificateAction } from './actions'
import type { CompanyCertificateConfig } from '@/lib/types'

interface FormState {
  certificateName: string
  certificateStatus: string
  validFrom: string
  validTo: string
  certificateSerial: string
  certificateIssuer: string
  certificateStoragePath: string
  uploadedFileName: string
  certificateFingerprintSha256: string
  isActive: boolean
  alertDaysBeforeExpiry: string
}

const initialForm: FormState = {
  certificateName: '',
  certificateStatus: 'pending',
  validFrom: '',
  validTo: '',
  certificateSerial: '',
  certificateIssuer: '',
  certificateStoragePath: '',
  uploadedFileName: '',
  certificateFingerprintSha256: '',
  isActive: false,
  alertDaysBeforeExpiry: '30',
}

function formatDateBR(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function normalizeDateInput(value: string) {
  if (!value) return ''
  return value.split('T')[0]
}

function buildFormState(record: CompanyCertificateConfig | null): FormState {
  if (!record) return initialForm

  return {
    certificateName: record.certificate_name || '',
    certificateStatus: record.certificate_status || 'pending',
    validFrom: record.valid_from || '',
    validTo: record.valid_to || '',
    certificateSerial: record.certificate_serial || '',
    certificateIssuer: record.certificate_issuer || '',
    certificateStoragePath: record.certificate_storage_path || '',
    uploadedFileName: record.uploaded_file_name || '',
    certificateFingerprintSha256: record.certificate_fingerprint_sha256 || '',
    isActive: record.is_active || false,
    alertDaysBeforeExpiry: record.alert_days_before_expiry?.toString() || '30',
  }
}

export default function FiscalCertificadoPage() {
  const [cert, setCert] = useState<CompanyCertificateConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [certPassword, setCertPassword] = useState('')
  const [form, setForm] = useState<FormState>(initialForm)
  const [savedForm, setSavedForm] = useState<FormState>(initialForm)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(savedForm) || certPassword.trim().length > 0
  }, [certPassword, form, savedForm])

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const result = await loadCertificateAction()

      if (result.error) {
        toast.error(result.error)
      }

      if (result.data) {
        setCert(result.data)
        const loaded = buildFormState(result.data)
        setForm(loaded)
        setSavedForm(loaded)
      }

      setLoading(false)
    }

    load()
  }, [])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    const payload = new FormData()
    payload.append('file', file)
    const result = await uploadCertificateAction(payload)

    if (result.error) {
      toast.error(result.error)
    } else if (result.path) {
      updateField('certificateStoragePath', result.path)
      updateField('uploadedFileName', result.fileName || file.name)
      updateField('certificateFingerprintSha256', result.fingerprintSha256 || '')

      if (!form.certificateName.trim()) {
        updateField('certificateName', file.name.replace(/\.(pfx|p12)$/i, ''))
      }

      toast.success('Arquivo do certificado enviado com sucesso. Salve para validar o A1 com a senha.')
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)

    const result = await saveCertificateAction({
      id: cert?.id,
      certificate_name: form.certificateName || null,
      valid_from: form.validFrom || null,
      valid_to: form.validTo || null,
      certificate_serial: form.certificateSerial || null,
      certificate_issuer: form.certificateIssuer || null,
      certificate_storage_path: form.certificateStoragePath || null,
      uploaded_file_name: form.uploadedFileName || null,
      certificate_fingerprint_sha256: form.certificateFingerprintSha256 || null,
      certificate_password: certPassword || null,
      is_active: form.isActive,
      alert_days_before_expiry: parseInt(form.alertDaysBeforeExpiry, 10) || 30,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      const nextCert = result.data || cert
      const nextForm = buildFormState(nextCert)

      toast.success(
        nextCert?.metadata_source === 'parsed_a1'
          ? 'Certificado validado e salvo com metadados extraídos automaticamente.'
          : 'Certificado digital salvo com sucesso.'
      )

      setCert(nextCert)
      setForm(nextForm)
      setSavedForm(nextForm)
      setCertPassword('')
    }

    setSaving(false)
  }

  const expiryDays = daysUntil(form.validTo)
  const isExpired = expiryDays !== null && expiryDays <= 0
  const isExpiringSoon =
    expiryDays !== null &&
    expiryDays > 0 &&
    expiryDays <= parseInt(form.alertDaysBeforeExpiry || '30', 10)
  const hasStoredPassword = Boolean(cert?.has_stored_password || certPassword.trim())
  const parsedSource = cert?.metadata_source === 'parsed_a1'
  const pendingCount = [
    !form.certificateStoragePath,
    !hasStoredPassword,
    !parsedSource,
    isExpired,
  ].filter(Boolean).length

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold font-heading text-gradient-navy">Certificado Digital</h1>
          <p className="text-muted-foreground mt-1">
            Upload do A1, senha operacional, validação automática e ativação segura do certificado usado na emissão.
          </p>
        </div>
        <Button
          className="gradient-navy border-0 text-white gap-2"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <FiscalPageSummaryPanel
        badges={[
          { label: parsedSource ? 'Certificado validado' : 'Validação pendente', tone: parsedSource ? 'success' : 'warning' },
          { label: form.isActive && !isExpired ? 'Certificado ativo' : 'Ativação controlada', tone: form.isActive && !isExpired ? 'success' : 'neutral' },
          { label: 'Segurança operacional', tone: 'info' },
        ]}
        items={[
          {
            label: 'Status',
            value: parsedSource ? 'A1 conferido pelo sistema' : 'A1 ainda precisa ser validado',
            detail: 'Serial, emissor e validade passam a vir do próprio arquivo quando a validação é concluída.',
          },
          {
            label: 'Pendências',
            value: pendingCount === 0 ? 'Nenhuma crítica' : `${pendingCount} ponto(s) para revisar`,
            detail: 'Arquivo, senha, parsing automático e validade entram nesta checagem.',
          },
          {
            label: 'Última atualização',
            value: cert?.updated_at ? new Date(cert.updated_at).toLocaleDateString('pt-BR') : 'Ainda não salvo',
            detail: cert?.last_validated_at ? `Última validação: ${formatDateBR(cert.last_validated_at)}` : 'Sem validação automática registrada.',
          },
        ]}
        helperText="Aqui ficam apenas upload, segurança e validade operacional do certificado A1. Ambiente de emissão, dados do emitente e vínculos fiscais são configurados em páginas separadas."
      />


      <Card className="glass-card border-0">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div
              className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
                form.isActive && !isExpired ? 'bg-emerald-100' : 'bg-amber-100'
              }`}
            >
              {form.isActive && !isExpired ? (
                <ShieldCheck className="h-7 w-7 text-emerald-600" />
              ) : isExpired ? (
                <ShieldOff className="h-7 w-7 text-red-600" />
              ) : (
                <ShieldAlert className="h-7 w-7 text-amber-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-xl font-semibold font-heading">
                {form.isActive && !isExpired
                  ? 'Certificado ativo'
                  : form.certificateStoragePath
                    ? 'Certificado cadastrado'
                    : 'Nenhum certificado cadastrado'}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {form.certificateName || 'Cadastre o certificado A1 da empresa para habilitar assinatura fiscal.'}
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                Validade: {formatDateBR(form.validFrom)} até {formatDateBR(form.validTo)}
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 text-sm flex items-start gap-3 ${
              parsedSource ? 'bg-emerald-50/60 text-emerald-800' : 'bg-amber-50/60 text-amber-800'
            }`}
          >
            {parsedSource ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>
              {parsedSource
                ? 'Os metadados operacionais deste certificado foram extraídos automaticamente do arquivo A1 com a senha operacional.'
                : 'Envie o arquivo e informe a senha operacional para que o sistema extraia automaticamente serial, emissor e validade do certificado A1.'}
            </span>
          </div>

          {isExpiringSoon ? (
            <div className="rounded-xl border bg-amber-50 p-4 text-sm text-amber-700">
              O certificado expira em <strong>{expiryDays} dias</strong>. Planeje a renovação antes de habilitar emissão em produção.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"
      >
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <Upload className="h-5 w-5 text-bronze" />
              Arquivo e senha operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                form.certificateStoragePath
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : 'border-muted/40 hover:border-muted/60'
              }`}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                  <span className="text-sm text-muted-foreground">Enviando certificado...</span>
                </div>
              ) : form.certificateStoragePath ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <span className="text-sm text-emerald-700 font-medium">Arquivo operacional registrado</span>
                  <span className="text-xs text-muted-foreground">Clique para substituir o certificado atual</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">Clique para enviar o arquivo .pfx / .p12</span>
                  <span className="text-xs text-muted-foreground">Máximo de 10MB</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".pfx,.p12" onChange={handleUpload} className="hidden" />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Senha operacional do certificado
                <FiscalHelpText text="A senha é armazenada com criptografia e usada para validar o A1 no backend. Informe novamente apenas quando quiser substituir a senha já registrada." />
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  placeholder={
                    hasStoredPassword
                      ? 'Senha já registrada. Digite apenas para trocar.'
                      : 'Digite a senha do certificado'
                  }
                  className="bg-white/60 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="h-3.5 w-3.5" />
                {hasStoredPassword
                  ? 'Já existe uma senha operacional registrada.'
                  : 'Ainda não há senha operacional armazenada.'}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/5">
              <div>
                <div className="text-sm font-medium">Certificado ativo</div>
                <div className="text-xs text-muted-foreground">
                  Ative apenas depois da validação automática do arquivo A1 com a senha operacional.
                </div>
              </div>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField('isActive', e.target.checked)}
                className="h-5 w-5 accent-emerald-600"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-lg font-heading flex items-center gap-2">
              <FileBadge className="h-5 w-5 text-bronze" />
              Metadados extraídos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>
                Nome de referência
                <FiscalHelpText text="Pode ser ajustado para facilitar a identificação interna. Os demais metadados abaixo são extraídos automaticamente do A1." />
              </Label>
              <Input
                value={form.certificateName}
                onChange={(e) => updateField('certificateName', e.target.value)}
                className="bg-white/60"
              />
            </div>
            <div className="space-y-2">
              <Label>Número serial</Label>
              <Input value={form.certificateSerial} readOnly className="bg-muted/30" />
            </div>
            <div className="space-y-2">
              <Label>Autoridade certificadora</Label>
              <Input value={form.certificateIssuer} readOnly className="bg-muted/30" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Válido de</Label>
                <Input type="date" value={normalizeDateInput(form.validFrom)} readOnly className="bg-muted/30" />
              </div>
              <div className="space-y-2">
                <Label>Válido até</Label>
                <Input type="date" value={normalizeDateInput(form.validTo)} readOnly className="bg-muted/30" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dias de alerta</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={form.alertDaysBeforeExpiry}
                onChange={(e) => updateField('alertDaysBeforeExpiry', e.target.value)}
                className="bg-white/60"
              />
            </div>

            <Separator />

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileBadge className="h-4 w-4 text-bronze" />
                <span>{form.uploadedFileName || 'Nenhum arquivo registrado ainda.'}</span>
              </div>
              <div className="flex items-start gap-2">
                <Fingerprint className="h-4 w-4 text-bronze mt-0.5" />
                <span className="break-all">{form.certificateFingerprintSha256 || 'Fingerprint ainda não disponível.'}</span>
              </div>
              <div>Fonte dos metadados: {parsedSource ? 'Arquivo A1 validado' : 'Ainda não validado automaticamente'}</div>
              <div>Última validação operacional: {formatDateBR(cert?.last_validated_at)}</div>
              <div>{cert?.validation_notes || 'Nenhuma observação operacional registrada ainda.'}</div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="sm:hidden sticky bottom-4 z-10">
        <Button
          className="w-full h-12 gradient-navy border-0 text-white text-base gap-2 shadow-lg"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Salvar certificado digital
        </Button>
      </div>
    </div>
  )
}
