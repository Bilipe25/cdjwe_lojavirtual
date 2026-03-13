import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save, MapPin, Building2, Users } from 'lucide-react';
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
import type { CustomerType } from '@/lib/types';
import type { CustomerWithStore } from './CustomerList';

interface CustomerEditDrawerProps {
    customer: CustomerWithStore | null;
    customerTypes: CustomerType[];
    isOpen: boolean;
    onClose: () => void;
    onSave: (profileId: string, storeId: string, data: CustomerEditFormData) => Promise<void>;
}

export function CustomerEditDrawer({
    customer,
    customerTypes,
    isOpen,
    onClose,
    onSave
}: CustomerEditDrawerProps) {
    const [saving, setSaving] = useState(false);
    const store = customer?.stores?.[0];

    const form = useForm<CustomerEditFormData>({
        resolver: zodResolver(customerEditSchema) as any,
    });

    const { register, handleSubmit, reset, formState: { errors }, setValue } = form;

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
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Tipo de Cliente</Label>
                                <Select
                                    value={form.watch('customerTypeId') || 'none'}
                                    onValueChange={(v) => setValue('customerTypeId', v === 'none' ? '' : v)}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sem tipo definido</SelectItem>
                                        {customerTypes.map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Endereço */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <MapPin className="h-4 w-4" />
                            <span className="text-sm font-medium">Endereço</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Endereço</Label>
                                <Input {...register('address')} placeholder="Rua, número" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Cidade</Label>
                                <Input {...register('city')} className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Estado</Label>
                                <Input {...register('state')} placeholder="UF" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>CEP</Label>
                                <Input {...register('zipCode')} placeholder="00000-000" className="bg-white/60" />
                            </div>
                        </div>
                    </div>
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
