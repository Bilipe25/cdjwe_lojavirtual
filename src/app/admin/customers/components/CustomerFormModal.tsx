import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Users, Building2, MapPin, Check, Tag } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { customerSchema, type CustomerFormData } from '../schema';
import type { CustomerType, CustomerTag, Profile } from '@/lib/types';

interface CustomerFormModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    saving: boolean;
    onSave: (data: CustomerFormData) => Promise<void>;
    customerTypes: CustomerType[];
    customerTags: CustomerTag[];
    representatives: Partial<Profile>[];
}

export function CustomerFormModal({
    isOpen,
    onOpenChange,
    saving,
    onSave,
    customerTypes,
    customerTags,
    representatives
}: CustomerFormModalProps) {
    const form = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema),
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
            password: '',
            companyName: '',
            tradeName: '',
            cnpj: '',
            customerTypeId: '',
            representativeId: '',
            tagIds: [],
            address: '',
            city: '',
            state: '',
            zipCode: ''
        }
    });

    const { register, handleSubmit, reset, formState: { errors, isDirty }, setValue } = form;
    const selectedCustomerTypeId = useWatch({ control: form.control, name: 'customerTypeId' }) || '';
    const selectedRepresentativeId = useWatch({ control: form.control, name: 'representativeId' }) || '';
    const selectedTagIds = useWatch({ control: form.control, name: 'tagIds' }) || [];
    const selectedCustomerType = customerTypes.find((type) => type.id === selectedCustomerTypeId);
    const selectedRepresentative = representatives.find((rep) => rep.id === selectedRepresentativeId);
    const willBecomeRepresentative =
        (selectedCustomerType?.slug || '').toLowerCase() === 'representante' ||
        (selectedCustomerType?.name || '').toLowerCase() === 'representante';
    const hasMissingCustomerTypeOption = Boolean(
        selectedCustomerTypeId && selectedCustomerTypeId !== 'none' && !selectedCustomerType
    );
    const hasMissingRepresentativeOption = Boolean(
        selectedRepresentativeId && selectedRepresentativeId !== 'none' && !selectedRepresentative
    );

    // Reset when opening modal fresh
    useEffect(() => {
        if (isOpen) {
            reset({
                fullName: '',
                email: '',
                phone: '',
                password: '',
                companyName: '',
                tradeName: '',
                cnpj: '',
                customerTypeId: '',
                representativeId: '',
                tagIds: [],
                address: '',
                city: '',
                state: '',
                zipCode: ''
            });
        }
    }, [isOpen, reset]);

    const handleOpenChange = (open: boolean) => {
        if (!open && isDirty) {
            if (!confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
                return;
            }
        }
        onOpenChange(open);
    };

    const onSubmit = async (data: CustomerFormData) => {
        await onSave(data);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-heading text-2xl">
                        Novo Cliente
                    </DialogTitle>
                    <DialogDescription>
                        Crie um novo acesso de lojista. O login principal sera pelo CNPJ e a conta ja sera aprovada automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
                    {/* Pessoais / Acesso */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Users className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados de Acesso (Login)</span>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="border-navy/20 bg-white text-navy">
                                    CNPJ = acesso principal
                                </Badge>
                                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                    E-mail = acesso alternativo
                                </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                Mesmo que o cliente tenha e-mail, o fluxo principal de entrada no portal passa a ser pelo CNPJ. O e-mail continua como opcional e alternativo.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nome do Responsável *</Label>
                                <Input {...register('fullName')} placeholder="João da Silva" className="bg-white/60" />
                                {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Telefone / WhatsApp</Label>
                                <Input {...register('phone')} placeholder="(11) 99999-9999" className="bg-white/60" />
                                {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>E-mail (Login) *</Label>
                                <Input {...register('email')} type="email" placeholder="joao@loja.com.br" className="bg-white/60" />
                                <p className="text-[11px] text-muted-foreground">
                                    Usado como acesso alternativo e para comunicacoes com o cliente.
                                </p>
                                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Senha Inicial *</Label>
                                <Input {...register('password')} type="text" placeholder="Min 6 caracteres" className="bg-white/60" />
                                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Empresa */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Building2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados da Empresa</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Razão Social *</Label>
                                <Input {...register('companyName')} placeholder="João da Silva Móveis ME" className="bg-white/60" />
                                {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Nome Fantasia</Label>
                                <Input {...register('tradeName')} placeholder="Loja do João" className="bg-white/60" />
                                {errors.tradeName && <p className="text-xs text-red-500">{errors.tradeName.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>CNPJ *</Label>
                                <Input {...register('cnpj')} placeholder="00.000.000/0001-00" className="bg-white/60" />
                                <p className="text-[11px] text-muted-foreground">
                                    Este sera o identificador principal de acesso do cliente no portal.
                                </p>
                                {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Cliente</Label>
                                <Select
                                    value={selectedCustomerTypeId || 'none'}
                                    onValueChange={(v) => setValue('customerTypeId', !v || v === 'none' ? undefined : v)}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sem tipo</SelectItem>
                                        {hasMissingCustomerTypeOption && (
                                            <SelectItem value={selectedCustomerTypeId}>Tipo vinculado (inativo)</SelectItem>
                                        )}
                                        {customerTypes.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.name}
                                                {!t.is_active ? ' (inativo)' : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {willBecomeRepresentative && (
                                    <p className="text-[11px] text-blue-700">
                                        Este cadastro sera promovido para representante e passara a acessar o painel de representante no login.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Representante Responsável</Label>
                                <Select
                                    value={selectedRepresentativeId || 'none'}
                                    onValueChange={(v) => setValue('representativeId', !v || v === 'none' ? undefined : v)}
                                >
                                    <SelectTrigger className="bg-white/60">
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Nenhum representante</SelectItem>
                                        {hasMissingRepresentativeOption && (
                                            <SelectItem value={selectedRepresentativeId}>Representante vinculado (inativo)</SelectItem>
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

                    {/* Endereço */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <MapPin className="h-4 w-4" />
                            <span className="text-sm font-medium">Endereço (Opcional)</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Endereço</Label>
                                <Input {...register('address')} placeholder="Rua, número" className="bg-white/60" />
                            </div>
                            <div className="space-y-2">
                                <Label>Cidade</Label>
                                <Input {...register('city')} placeholder="Cidade" className="bg-white/60" />
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

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={saving} className="gradient-navy border-0 text-white min-w-[140px]">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                            Salvar e Aprovar
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
