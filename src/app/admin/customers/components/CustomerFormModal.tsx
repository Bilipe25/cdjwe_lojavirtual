import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Users, Building2, Check } from 'lucide-react';
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
import { customerSchema, type CustomerFormData } from '../schema';

interface CustomerFormModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    saving: boolean;
    onSave: (data: CustomerFormData) => Promise<void>;
}

export function CustomerFormModal({
    isOpen,
    onOpenChange,
    saving,
    onSave
}: CustomerFormModalProps) {
    const form = useForm<CustomerFormData>({
        resolver: zodResolver(customerSchema) as any,
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
            password: '',
            companyName: '',
            tradeName: '',
            cnpj: ''
        }
    });

    const { register, handleSubmit, reset, formState: { errors, isDirty } } = form;

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
                cnpj: ''
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
                        Crie um novo acesso de lojista. A conta já será aprovada automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
                    {/* Pessoais / Acesso */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-muted-foreground border-b pb-2">
                            <Users className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados de Acesso (Login)</span>
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
                                {errors.cnpj && <p className="text-xs text-red-500">{errors.cnpj.message}</p>}
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
