'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog'
import { BRAZIL_UF_OPTIONS } from '@/lib/fiscal/icms'
import type { IcmsBaseOption, IbscbsBaseOption } from '../emitter-taxes'

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
    }
    onSave: (data: { targetUf: string | null; baseId: string; editId?: string }) => Promise<void>
}

const UF_ALL_OPTION = { value: '__NATIONAL__', label: 'Brasil (Nacional / Padrão)' }

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
        if (open) {
            if (mode === 'edit' && editData) {
                setSelectedUf(editData.targetUf || '__NATIONAL__')
                setSelectedBaseId(editData.baseId)
            } else {
                setSelectedUf('__NATIONAL__')
                setSelectedBaseId('')
            }
        }
    }, [open, mode, editData])

    // Filter out UFs already used (except current one being edited)
    const availableUFs = [UF_ALL_OPTION, ...BRAZIL_UF_OPTIONS.map(uf => ({ value: uf.value, label: `${uf.value} — ${uf.label}` }))].filter(
        (uf) => {
            const ufValue = uf.value === '__NATIONAL__' ? null : uf.value
            // Always show the currently edited UF
            if (mode === 'edit' && editData) {
                const editUf = editData.targetUf
                if (ufValue === editUf) return true
            }
            return !existingUFs.includes(ufValue)
        }
    )

    const options = type === 'icms' ? icmsOptions || [] : ibscbsOptions || []

    const handleConfirm = async () => {
        if (!selectedBaseId) return
        setSaving(true)
        await onSave({
            targetUf: selectedUf === '__NATIONAL__' ? null : selectedUf,
            baseId: selectedBaseId,
            editId: mode === 'edit' ? editData?.id : undefined,
        })
        setSaving(false)
        onOpenChange(false)
    }

    const typeLabel = type === 'icms' ? 'ICMS' : 'IBS/CBS'

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
                        {mode === 'add' ? `Vincular Base ${typeLabel}` : `Editar Vínculo ${typeLabel}`}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* UF Select */}
                    <div className="space-y-2">
                        <Label>UF de Destino</Label>
                        <Select
                            value={selectedUf}
                            onValueChange={(v) => setSelectedUf(v || '__NATIONAL__')}
                        >
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
                            Selecione &quot;Brasil&quot; para criar a regra padrão (nacional). Selecione uma UF específica para criar uma exceção regionalizada.
                        </p>
                    </div>

                    {/* Base Select */}
                    <div className="space-y-2">
                        <Label>Base {typeLabel}</Label>
                        <Select
                            value={selectedBaseId}
                            onValueChange={(v) => setSelectedBaseId(v || '')}
                        >
                            <SelectTrigger className="bg-white/60">
                                <SelectValue placeholder={`Selecione uma base ${typeLabel}`} />
                            </SelectTrigger>
                            <SelectContent>
                                {options.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                                        Nenhuma base {typeLabel} ativa encontrada.
                                        <br />
                                        <span className="text-xs">Crie uma base em Bases Fiscais → {typeLabel}.</span>
                                    </div>
                                ) : (
                                    options.map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                            {opt.code} — {opt.name}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <DialogClose asChild>
                        <Button variant="outline" disabled={saving}>
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button
                        className="gradient-navy border-0 text-white gap-1.5"
                        onClick={handleConfirm}
                        disabled={!selectedBaseId || saving}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {mode === 'add' ? 'Adicionar' : 'Salvar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
