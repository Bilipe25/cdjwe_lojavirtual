'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Users, Building2, MapPin, Check, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { CustomerType } from '@/lib/types';

// Simplified schema for representative customer creation
const repCustomerSchema = z.object({
    fullName: z.string().min(3, 'Nome muito curto'),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
    password: z.string().min(6, 'Min 6 caracteres').optional().or(z.literal('')),
    companyName: z.string().min(3, 'Razão Social muito curta'),
    tradeName: z.string().optional(),
    cnpj: z.string().min(14, 'CNPJ inválido'),
    customerTypeId: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
});

export type RepCustomerFormData = z.infer<typeof repCustomerSchema>;

interface RepresentativeCustomerFormProps {
    onClose: () => void;
    onSave: (data: RepCustomerFormData) => Promise<void>;
    customerTypes: CustomerType[];
    saving: boolean;
    initialData?: any;
}

export function RepresentativeCustomerForm({
    onClose,
    onSave,
    customerTypes,
    saving,
    initialData,
}: RepresentativeCustomerFormProps) {
    const form = useForm<RepCustomerFormData>({
        resolver: zodResolver(repCustomerSchema),
        defaultValues: {
            fullName: initialData?.profile?.full_name || '',
            email: initialData?.profile?.email || '',
            phone: initialData?.profile?.phone || '',
            password: '',
            companyName: initialData?.company_name || '',
            tradeName: initialData?.trade_name || '',
            cnpj: initialData?.cnpj || '',
            customerTypeId: initialData?.customer_type_id || '',
            address: initialData?.addresses?.[0]?.street || '',
            city: initialData?.addresses?.[0]?.city || '',
            state: initialData?.addresses?.[0]?.state || '',
            zipCode: initialData?.addresses?.[0]?.zip_code || '',
        },
    });

    const { register, handleSubmit, formState: { errors }, setValue } = form;
    const selectedCustomerTypeId = useWatch({ control: form.control, name: 'customerTypeId' }) || '';

    const onSubmit = async (data: RepCustomerFormData) => {
        // If password is empty, generate a random one (the action backend will use it, 
        // but since our schema requires it or generates it, we can pass a dummy if missing
        // However, the action expects a password. Let's auto-generate one here if empty:
        if (!data.password) {
            data.password = Math.random().toString(36).slice(-8) + 'A1!'; 
        }
        await onSave(data);
    };

    return (
        <div className="flex flex-col h-full bg-muted/10">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 gradient-navy px-4 py-3 text-white shrink-0 shadow-sm z-10 sticky top-0">
                <button 
                    onClick={onClose} 
                    className="rounded-full p-1.5 hover:bg-white/20 transition-colors"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="text-base font-semibold text-white">
                    {initialData ? 'Editar Cliente' : 'Novo Cliente'}
                </h2>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                <form id="rep-customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-5 px-4 sm:px-6">
                    
                    {/* Access Settings */}
                    <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-3 border-b border-border/40 flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">Principal & Acesso</span>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Razão Social *</Label>
                                <Input {...register('companyName')} placeholder="Ex: Loja do João ME" className="bg-white/50 h-10 rounded-xl" />
                                {errors.companyName && <p className="text-[10px] text-red-500">{errors.companyName.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">CNPJ *</Label>
                                <Input {...register('cnpj')} placeholder="00.000.000/0001-00" className="bg-white/50 h-10 rounded-xl" />
                                {errors.cnpj && <p className="text-[10px] text-red-500">{errors.cnpj.message}</p>}
                                <p className="text-[10px] text-muted-foreground">O CNPJ será o login de acesso do cliente.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Nome Fantasia</Label>
                                <Input {...register('tradeName')} placeholder="Se houver" className="bg-white/50 h-10 rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Tipo de Cliente</Label>
                                <Select
                                    value={selectedCustomerTypeId || 'none'}
                                    onValueChange={(v) => setValue('customerTypeId', !v || v === 'none' ? undefined : v)}
                                >
                                    <SelectTrigger className="bg-white/50 h-10 rounded-xl">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sem tipo</SelectItem>
                                        {customerTypes.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Contact Settings */}
                    <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-3 border-b border-border/40 flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">Responsável & Contato</span>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Nome do Comprador *</Label>
                                <Input {...register('fullName')} placeholder="Nome completo" className="bg-white/50 h-10 rounded-xl" />
                                {errors.fullName && <p className="text-[10px] text-red-500">{errors.fullName.message}</p>}
                            </div>
                            
                            <div className="space-y-1.5">
                                <Label className="text-xs">E-mail (Login Alternativo) *</Label>
                                <Input {...register('email')} type="email" placeholder="email@loja.com" className="bg-white/50 h-10 rounded-xl" />
                                {errors.email && <p className="text-[10px] text-red-500">{errors.email.message}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Celular / WhatsApp</Label>
                                <Input {...register('phone')} placeholder="(11) 99999-9999" className="bg-white/50 h-10 rounded-xl" />
                            </div>
                        </div>
                    </div>

                    {/* Address */}
                    <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
                        <div className="bg-muted/30 px-4 py-3 border-b border-border/40 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">Endereço Principal</span>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-4">
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-xs">Endereço</Label>
                                <Input {...register('address')} placeholder="Rua, número" className="bg-white/50 h-10 rounded-xl" />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-xs">Cidade</Label>
                                <Input {...register('city')} placeholder="Sua cidade" className="bg-white/50 h-10 rounded-xl" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">UF</Label>
                                <Input {...register('state')} placeholder="SP" className="bg-white/50 h-10 rounded-xl uppercase" maxLength={2} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">CEP</Label>
                                <Input {...register('zipCode')} placeholder="00000-000" className="bg-white/50 h-10 rounded-xl" />
                            </div>
                        </div>
                    </div>

                </form>
            </div>

            {/* Fixed Bottom Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border/40 shadow-[0_-4px_20px_-2px_rgba(0,0,0,0.06)] pb-safe z-20 xl:relative xl:w-full">
                <Button 
                    type="submit" 
                    form="rep-customer-form"
                    disabled={saving} 
                    className="w-full h-12 rounded-xl gradient-navy hover:opacity-90 text-white font-semibold text-base shadow-sm"
                >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
                    {initialData ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR E SELECIONAR'}
                </Button>
            </div>
        </div>
    );
}
