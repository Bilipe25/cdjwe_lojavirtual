'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BRAZIL_UF_OPTIONS } from '@/lib/fiscal/icms'
import type { IbscbsBaseOption, IcmsBaseOption } from '../emitter-taxes'

interface EmitterStateLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'icms' | 'ibscbs'
  mode: 'add' | 'edit'
  existingUFs: (string | null)[]
  icmsOptions?: IcmsBaseOption[]
  ibscbsOptions?: IbscbsBaseOption[]
  editData?: {
    id: string
    targetUf: string | null
    baseId: string
    versionId?: string | null
  }
  onSave: (data: {
    targetUf: string | null
    baseId: string
    versionId?: string | null
    editId?: string
  }) => Promise<void>
}

const UF_ALL_OPTION = { value: '__NATIONAL__', label: 'Brasil (regra nacional / padrao)' }

export function EmitterStateLinkDialog({
  open,
  onOpenChange,
  type,
  mode,
  existingUFs,
  icmsOptions,
  ibscbsOptions,
  editData,
  onSave,
}: EmitterStateLinkDialogProps) {
  const [selectedUf, setSelectedUf] = useState<string>('__NATIONAL__')
  const [selectedBaseId, setSelectedBaseId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    const nextSelectedUf = mode === 'edit' && editData ? editData.targetUf || '__NATIONAL__' : '__NATIONAL__'
    const nextSelectedBaseId = mode === 'edit' && editData ? editData.baseId : ''

    const timer = window.setTimeout(() => {
      setSelectedUf(nextSelectedUf)
      setSelectedBaseId(nextSelectedBaseId)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [editData, mode, open])

  const availableUFs = [
    UF_ALL_OPTION,
    ...BRAZIL_UF_OPTIONS.map((uf) => ({ value: uf.value, label: `${uf.value} - ${uf.label}` })),
  ].filter((uf) => {
    const ufValue = uf.value === '__NATIONAL__' ? null : uf.value
    if (mode === 'edit' && editData?.targetUf === ufValue) return true
    return !existingUFs.includes(ufValue)
  })

  const options = type === 'icms' ? icmsOptions || [] : ibscbsOptions || []
  const selectedIbscbsOption = useMemo(
    () => (type === 'ibscbs' ? (ibscbsOptions || []).find((option) => option.id === selectedBaseId) : undefined),
    [ibscbsOptions, selectedBaseId, type]
  )
  const resolvedSelectedVersionId =
    type === 'ibscbs'
      ? selectedIbscbsOption?.activeVersionId ||
        (selectedBaseId === editData?.baseId ? editData?.versionId || '' : '')
      : ''

  const handleConfirm = async () => {
    if (!selectedBaseId) return

    setSaving(true)
    await onSave({
      targetUf: selectedUf === '__NATIONAL__' ? null : selectedUf,
      baseId: selectedBaseId,
      versionId: type === 'ibscbs' ? resolvedSelectedVersionId || null : null,
      editId: mode === 'edit' ? editData?.id : undefined,
    })
    setSaving(false)
    onOpenChange(false)
  }

  const typeLabel = type === 'icms' ? 'ICMS' : 'IBS/CBS'
  const titleLabel =
    type === 'ibscbs'
      ? mode === 'add'
        ? 'Vincular complemento geografico de IBS/CBS'
        : 'Editar complemento geografico de IBS/CBS'
      : mode === 'add'
        ? `Vincular base ${typeLabel}`
        : `Editar vinculo ${typeLabel}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'add' ? (
              <Plus className="h-5 w-5 text-bronze" />
            ) : (
              <Pencil className="h-5 w-5 text-bronze" />
            )}
            {titleLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>UF de destino</Label>
            <Select value={selectedUf} onValueChange={(value) => setSelectedUf(value || '__NATIONAL__')}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder="Selecione a UF" />
              </SelectTrigger>
              <SelectContent>
                {availableUFs.map((uf) => (
                  <SelectItem key={uf.value} value={uf.value}>
                    {uf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {type === 'ibscbs'
                ? 'Use Brasil para a regra nacional do emitente. Escolha uma UF especifica apenas quando o runtime IBS/CBS realmente mudar por estado.'
                : 'Use Brasil para a regra nacional. Escolha uma UF especifica apenas quando houver excecao fiscal por estado.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Base {typeLabel}</Label>
            <Select value={selectedBaseId} onValueChange={(value) => setSelectedBaseId(value || '')}>
              <SelectTrigger className="bg-white/60">
                <SelectValue placeholder={`Selecione uma base ${typeLabel}`} />
              </SelectTrigger>
              <SelectContent>
                {options.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Nenhuma base {typeLabel} ativa encontrada.
                  </div>
                ) : (
                  options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.code} - {option.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {type === 'ibscbs' ? (
              <p className="text-xs text-muted-foreground">
                O CFOP continua dono do enquadramento da operacao. Aqui o emitente so informa qual base/versionamento
                geografico o runtime deve herdar para esta abrangencia.
              </p>
            ) : null}
          </div>

          {type === 'ibscbs' ? (
            <div className="space-y-2 rounded-xl border bg-muted/10 p-4">
              <div className="text-sm font-medium">Versao geografica vinculada da base IBS/CBS</div>
              <div className="text-sm text-muted-foreground">
                {selectedIbscbsOption?.activeVersionLabel || 'Selecione uma base com versao ativa.'}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedIbscbsOption?.activeValidFrom
                  ? `Vigencia inicial: ${new Date(selectedIbscbsOption.activeValidFrom).toLocaleDateString('pt-BR')}`
                  : 'A base selecionada precisa ter uma versao ativa para ser vinculada ao emitente.'}
              </div>
              <div className="text-xs text-muted-foreground">
                Perfil tributario e CFOP continuam falando a mesma linguagem fiscal; este vinculo apenas acrescenta o
                recorte geografico do emitente.
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            className="gradient-navy gap-1.5 border-0 text-white"
            onClick={handleConfirm}
            disabled={!selectedBaseId || (type === 'ibscbs' && !resolvedSelectedVersionId) || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'add' ? 'Adicionar' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
