'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileBadge2, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getStoreAddresses, getStoreFiscalData, upsertStoreFiscalData } from '../actions'
import type { StoreAddress } from '@/lib/types'

interface ClientFiscalSectionProps {
    storeId: string
}

type FiscalFormState = {
    personType: 'legal_entity' | 'individual'
    documentType: 'CNPJ' | 'CPF'
    documentNumber: string
    stateRegistration: string
    municipalRegistration: string
    taxpayerIndicator: 'contributor' | 'non_contributor' | 'exempt'
    fiscalEmail: string
    fiscalNotes: string
    fiscalAddressId: string | null
}

const DEFAULT_FORM: FiscalFormState = {
    personType: 'legal_entity',
    documentType: 'CNPJ',
    documentNumber: '',
    stateRegistration: '',
    municipalRegistration: '',
    taxpayerIndicator: 'contributor',
    fiscalEmail: '',
    fiscalNotes: '',
    fiscalAddressId: null,
}

function normalizeDigits(value?: string | null) {
    return (value || '').replace(/\D/g, '')
}

function validateFiscalForm(form: FiscalFormState) {
    const documentDigits = normalizeDigits(form.documentNumber)

    if (!documentDigits) {
        return 'Documento fiscal obrigatorio.'
    }

    if (form.documentType === 'CPF' && documentDigits.length !== 11) {
        return 'CPF deve conter 11 digitos.'
    }

    if (form.documentType === 'CNPJ' && documentDigits.length !== 14) {
        return 'CNPJ deve conter 14 digitos.'
    }

    if (form.personType === 'individual' && form.documentType !== 'CPF') {
        return 'Pessoa fisica deve utilizar CPF.'
    }

    if (form.personType === 'legal_entity' && form.documentType !== 'CNPJ') {
        return 'Pessoa juridica deve utilizar CNPJ.'
    }

    if (form.documentType === 'CNPJ' && form.taxpayerIndicator === 'contributor' && !form.stateRegistration.trim()) {
        return 'Inscricao estadual obrigatoria para contribuinte PJ.'
    }

    if (form.fiscalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.fiscalEmail)) {
        return 'E-mail fiscal invalido.'
    }

    return null
}

export function ClientFiscalSection({ storeId }: ClientFiscalSectionProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<FiscalFormState>(DEFAULT_FORM)
    const [addresses, setAddresses] = useState<StoreAddress[]>([])

    useEffect(() => {
        let active = true

        const load = async () => {
            setLoading(true)
            const [fiscalRes, addressRes] = await Promise.all([
                getStoreFiscalData(storeId),
                getStoreAddresses(storeId),
            ])

            if (!active) return

            if ('error' in fiscalRes && fiscalRes.error) {
                toast.error(fiscalRes.error)
            }

            if ('error' in addressRes && addressRes.error) {
                toast.error(addressRes.error)
            }

            const fiscalData = ('data' in fiscalRes ? fiscalRes.data : null) as Record<string, unknown> | null
            const addressData = ('data' in addressRes ? addressRes.data : []) as StoreAddress[] | undefined
            const resolvedAddresses = Array.isArray(addressData) ? addressData : []
            setAddresses(resolvedAddresses)

            if (fiscalData) {
                setForm({
                    personType: (fiscalData.person_type as 'legal_entity' | 'individual') || 'legal_entity',
                    documentType: (fiscalData.document_type as 'CNPJ' | 'CPF') || 'CNPJ',
                    documentNumber: String(fiscalData.document_number || ''),
                    stateRegistration: String(fiscalData.state_registration || ''),
                    municipalRegistration: String(fiscalData.municipal_registration || ''),
                    taxpayerIndicator:
                        (fiscalData.taxpayer_indicator as 'contributor' | 'non_contributor' | 'exempt') || 'contributor',
                    fiscalEmail: String(fiscalData.fiscal_email || ''),
                    fiscalNotes: String(fiscalData.fiscal_notes || ''),
                    fiscalAddressId: (fiscalData.fiscal_address_id as string | null) || null,
                })
            } else {
                setForm((previous) => ({
                    ...previous,
                    fiscalAddressId: resolvedAddresses.find((address) => address.is_main)?.id || null,
                }))
            }

            setLoading(false)
        }

        void load()
        return () => {
            active = false
        }
    }, [storeId])

    const selectedAddress = useMemo(
        () => addresses.find((address) => address.id === form.fiscalAddressId) || null,
        [addresses, form.fiscalAddressId]
    )

    const handleSave = async () => {
        const validationError = validateFiscalForm(form)
        if (validationError) {
            toast.error(validationError)
            return
        }

        setSaving(true)
        const result = await upsertStoreFiscalData({
            storeId,
            personType: form.personType,
            documentType: form.documentType,
            documentNumber: form.documentNumber,
            stateRegistration: form.stateRegistration || undefined,
            municipalRegistration: form.municipalRegistration || undefined,
            taxpayerIndicator: form.taxpayerIndicator,
            fiscalEmail: form.fiscalEmail || undefined,
            fiscalNotes: form.fiscalNotes || undefined,
            fiscalAddressId: form.fiscalAddressId,
        })
        setSaving(false)

        if ('error' in result && result.error) {
            toast.error(result.error)
            return
        }

        toast.success('Dados fiscais salvos com sucesso.')
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando configuracao fiscal...
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2 text-navy">
                <FileBadge2 className="h-4 w-4" />
                <h3 className="font-semibold">Fiscal e NF-e</h3>
                <Badge variant="outline" className="text-xs">
                    Preparado para emissao
                </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label>Tipo de Pessoa</Label>
                    <Select
                        value={form.personType}
                        onValueChange={(value) => {
                            const nextPersonType = value as 'legal_entity' | 'individual'
                            setForm((previous) => ({
                                ...previous,
                                personType: nextPersonType,
                                documentType: nextPersonType === 'individual' ? 'CPF' : 'CNPJ',
                            }))
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="legal_entity">Pessoa Juridica</SelectItem>
                            <SelectItem value="individual">Pessoa Fisica</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Tipo Documento</Label>
                    <Select
                        value={form.documentType}
                        onValueChange={(value) =>
                            setForm((previous) => ({
                                ...previous,
                                documentType: value as 'CPF' | 'CNPJ',
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CNPJ">CNPJ</SelectItem>
                            <SelectItem value="CPF">CPF</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                    <Label>Documento Fiscal</Label>
                    <Input
                        value={form.documentNumber}
                        onChange={(event) =>
                            setForm((previous) => ({ ...previous, documentNumber: event.target.value }))
                        }
                        placeholder={form.documentType === 'CPF' ? 'Somente numeros do CPF' : 'Somente numeros do CNPJ'}
                    />
                </div>

                <div className="space-y-2">
                    <Label>Inscricao Estadual</Label>
                    <Input
                        value={form.stateRegistration}
                        onChange={(event) =>
                            setForm((previous) => ({ ...previous, stateRegistration: event.target.value }))
                        }
                        placeholder="Opcional"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Inscricao Municipal</Label>
                    <Input
                        value={form.municipalRegistration}
                        onChange={(event) =>
                            setForm((previous) => ({ ...previous, municipalRegistration: event.target.value }))
                        }
                        placeholder="Opcional"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Indicador de Contribuinte</Label>
                    <Select
                        value={form.taxpayerIndicator}
                        onValueChange={(value) =>
                            setForm((previous) => ({
                                ...previous,
                                taxpayerIndicator: value as 'contributor' | 'non_contributor' | 'exempt',
                            }))
                        }
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="contributor">Contribuinte</SelectItem>
                            <SelectItem value="non_contributor">Nao contribuinte</SelectItem>
                            <SelectItem value="exempt">Isento</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>E-mail Fiscal</Label>
                    <Input
                        type="email"
                        value={form.fiscalEmail}
                        onChange={(event) =>
                            setForm((previous) => ({ ...previous, fiscalEmail: event.target.value }))
                        }
                        placeholder="fiscal@empresa.com"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label>Endereco Fiscal</Label>
                <Select
                    value={form.fiscalAddressId || 'none'}
                    onValueChange={(value) =>
                        setForm((previous) => ({
                            ...previous,
                            fiscalAddressId: value === 'none' ? null : value,
                        }))
                    }
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione um endereco" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Sem endereco vinculado</SelectItem>
                        {addresses.map((address) => (
                            <SelectItem key={address.id} value={address.id}>
                                {address.title} - {address.city}/{address.state}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {selectedAddress && (
                    <p className="text-xs text-muted-foreground">
                        {selectedAddress.address}, {selectedAddress.number || 's/n'} - {selectedAddress.city}/{selectedAddress.state}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label>Observacoes Fiscais</Label>
                <Textarea
                    rows={3}
                    value={form.fiscalNotes}
                    onChange={(event) => setForm((previous) => ({ ...previous, fiscalNotes: event.target.value }))}
                    placeholder="Anotacoes fiscais para pedidos e emissao."
                />
            </div>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="gradient-navy border-0 text-white">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Dados Fiscais
                </Button>
            </div>
        </div>
    )
}
