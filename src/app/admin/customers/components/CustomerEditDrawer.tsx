import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save, Building2, Users, Tag } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { customerEditSchema, type CustomerEditFormData } from '../schema';
import type { CustomerType, CustomerTag, Profile } from '@/lib/types';
import type { CustomerWithStore } from './CustomerList';
import { CustomerAddressManager } from './CustomerAddressManager';

interface CustomerEditDrawerProps {
    customer: CustomerWithStore | null;
    customerTypes: CustomerType[];
    customerTags: CustomerTag[];
    representatives: Partial<Profile>[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (profileId: string, storeId: string, data: CustomerEditFormData) => Promise<void>;
}

export function CustomerEditDrawer({
    customer,
    customerTypes,
    customerTags,
    representatives,
    isOpen,
    onClose,
    onSave
}: CustomerEditDrawerProps) {
    const [saving, setSaving] = useState(false);
    const store = customer?.stores?.[0];

    const form = useForm<CustomerEditFormData>({
        resolver: zodResolver(customerEditSchema),
    });

    const { register, handleSubmit, reset, formState: { errors }, setValue } = form;
    const selectedCustomerTypeId = useWatch({ control: form.control, name: 'customerTypeId' }) || '';
    const selectedRepresentativeId = useWatch({ control: form.control, name: 'representativeId' }) || '';
    const selectedTagIds = useWatch({ control: form.control, name: 'tagIds' }) || [];
    const selectedCustomerType = customerTypes.find((type) => type.id === selectedCustomerTypeId);
    const selectedRepresentative = representatives.find((rep) => rep.id === selectedRepresentativeId);
    const hasMissingCustomerTypeOption = Boolean(
        selectedCustomerTypeId && selectedCustomerTypeId !== 'none' && !selectedCustomerType
    );
    const hasMissingRepresentativeOption = Boolean(
        selectedRepresentativeId && selectedRepresentativeId !== 'none' && !selectedRepresentative
    );
    const fallbackCustomerTypeLabel = store?.customer_type?.name || 'Tipo vinculado (inativo)';
    const fallbackRepresentativeLabel = store?.representative?.full_name || 'Representante vinculado (inativo)';
    const selectedCustomerTypeLabel =
        selectedCustomerType
            ? `${selectedCustomerType.name}${!selectedCustomerType.is_active ? ' (inativo)' : ''}`
            : hasMissingCustomerTypeOption
                ? fallbackCustomerTypeLabel
                : '';
    const selectedRepresentativeLabel =
        selectedRepresentative?.full_name || (hasMissingRepresentativeOption ? fallbackRepresentativeLabel : '');

    useEffect(() => {
        if (isOpen && customer) {
            reset({
                fullName: customer.full_name || '',
                email: customer.email || '',
                phone: customer.phone || '',
                companyName: store?.company_name || '',
                tradeName: store?.trade_name || '',
                cnpj: store?.cnpj || '',
                customerTypeId: store?.customer_type_id || '',
                representativeId: store?.representative_id || '',
                tagIds: store?.store_tags?.map(st => st.tag_id) || [],
                address: store?.address || '',
                city: store?.city || '',
                state: store?.state || '',
                zipCode: store?.zip_code || '',
            });
        }
    }, [isOpen, customer, store, reset]);

    const onSubmit = async (data: CustomerEditFormData) => {
        if (!customer || !store) return;
        setSaving(true);
        try {
            await onSave(customer.id, store.id, data);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
                <SheetHeader className="p-6 border-b bg-white z-10">
                    <SheetTitle className="text-xl font-heading text-navy">
                        Editar Cliente
                    </SheetTitle>
                    <SheetDescription>
                        {customer?.full_name} — {store?.company_name}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Dados Pessoais */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Users className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados Pessoais</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Nome do Responsável *</Label>
                                <Input {...register('fullName')} className="bg-white/60" />
                                {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>E-mail *</Label>
                                <Input {...register('email')} type="email" className="bg-white/60" disabled />
                                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Telefone / WhatsApp</Label>
                                <Input {...register('phone')} className="bg-white/60" />
                            </div>
                        </div>
                    </div>

                    {/* Dados da Empresa */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Building2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados da Empresa</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Razão Social *</Label>
                                <Input {...register('companyName')} className="bg-white/60" />
                                {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Nome Fantasia</Label>
                                <Input {...register('tradeName')} className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>CNPJ *</Label>
                                <Input {...register('cnpj')} className="bg-white/60" />
                                {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Cliente</Label>
                                <Select
                                    value={selectedCustomerTypeId || 'none'}
                                    onValueChange={(v) => setValue('customerTypeId', !v || v === 'none' ? undefined : v)}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione...">
                                            {selectedCustomerTypeId && selectedCustomerTypeId !== 'none' ? selectedCustomerTypeLabel : undefined}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sem tipo</SelectItem>
                                        {hasMissingCustomerTypeOption && (
                                            <SelectItem value={selectedCustomerTypeId}>{fallbackCustomerTypeLabel}</SelectItem>
                                        )}
                                        {customerTypes.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name}
                                                {!t.is_active ? ' (inativo)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Representante Responsável</Label>
                                <Select
                                    value={selectedRepresentativeId || 'none'}
                                    onValueChange={(v) => setValue('representativeId', !v || v === 'none' ? undefined : v)}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione...">
                                            {selectedRepresentativeId && selectedRepresentativeId !== 'none' ? selectedRepresentativeLabel : undefined}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhum</SelectItem>
                                        {hasMissingRepresentativeOption && (
                                            <SelectItem value={selectedRepresentativeId}>{fallbackRepresentativeLabel}</SelectItem>
                                        )}
                                        {representatives
                                            .filter((r) => Boolean(r.id))
                                            .map(r => (
                                                <SelectItem key={r.id as string} value={r.id as string}>
                                                    {r.full_name || 'Representante sem nome'}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Tag className="h-4 w-4" />
                            <span className="text-sm font-medium">Tags (Segmentação)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {customerTags.map(tag => {
                                const isSelected = selectedTagIds.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => {
                                            if (isSelected) {
                                                setValue('tagIds', selectedTagIds.filter(id => id !== tag.id), { shouldDirty: true });
                                            } else {
                                                setValue('tagIds', [...selectedTagIds, tag.id], { shouldDirty: true });
                                            }
                                        }}
                                        className={`px-3 py-1 text-xs border rounded-full transition-colors ${
                                            isSelected 
                                                ? tag.color 
                                                : 'bg-white text-muted-foreground border-border hover:bg-slate-50'
                                        }`}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}
                            {customerTags.length === 0 && (
                                <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</span>
                            )}
                        </div>
                    </div>

                    {/* Endereço Multiponto */}
                    {store && (
                        <CustomerAddressManager storeId={store.id} />
                    )}
                </form>

                <SheetFooter className="p-4 border-t bg-white mt-auto shrink-0">
                    <div className="flex gap-3 w-full">
                        <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit(onSubmit)}
                            disabled={saving}
                            className="flex-1 gradient-navy border-0 text-white"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Salvar Alterações
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
