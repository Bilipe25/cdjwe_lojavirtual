import { useState } from 'react';
import { Key, Copy, Send, Loader2, MessageCircle, Mail, Eye, EyeOff, RefreshCw } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { generateCustomerPassword, setCustomerPassword, sendAccessLink } from '../actions';
import { toast } from 'sonner';
import type { CustomerWithStore } from './CustomerList';

interface CustomerAccessModalProps {
    customer: CustomerWithStore | null;
    isOpen: boolean;
    onClose: () => void;
}

export function CustomerAccessModal({ customer, isOpen, onClose }: CustomerAccessModalProps) {
    const [password, setPassword] = useState('');
    const [customPassword, setCustomPassword] = useState('');
    const [showPassword, setShowPassword] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [settingPassword, setSettingPassword] = useState(false);
    const [sendingLink, setSendingLink] = useState(false);

    const store = customer?.stores?.[0];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cdjwe-lojavirtual.vercel.app';
    const loginUrl = `${appUrl}/login`;

    const handleGenerate = async () => {
        if (!customer) return;
        setGenerating(true);
        try {
            const result = await generateCustomerPassword(customer.id);
            if ('error' in result && result.error) {
                toast.error(result.error);
            } else if ('password' in result && result.password) {
                setPassword(result.password);
                toast.success('Senha gerada com sucesso!');
            }
        } finally {
            setGenerating(false);
        }
    };

    const handleSetCustomPassword = async () => {
        if (!customer || !customPassword) return;
        if (customPassword.length < 6) {
            toast.error('A senha deve ter no mínimo 6 caracteres');
            return;
        }
        setSettingPassword(true);
        try {
            const result = await setCustomerPassword(customer.id, customPassword);
            if ('error' in result && result.error) {
                toast.error(result.error);
            } else {
                setPassword(customPassword);
                toast.success('Senha definida com sucesso!');
            }
        } finally {
            setSettingPassword(false);
        }
    };

    const handleCopyCredentials = () => {
        const text = `Link de acesso: ${loginUrl}\nUsuário: ${customer?.email}\n${password ? `Senha: ${password}` : ''}`;
        navigator.clipboard.writeText(text);
        toast.success('Credenciais copiadas!');
    };

    const handleSendWhatsApp = async () => {
        if (!customer) return;
        setSendingLink(true);
        try {
            const result = await sendAccessLink(customer.id, 'whatsapp', password || undefined);
            if ('error' in result && result.error) {
                toast.error(result.error);
            } else if ('whatsappUrl' in result && result.whatsappUrl) {
                window.open(result.whatsappUrl, '_blank');
                toast.success('WhatsApp aberto com a mensagem!');
            }
        } finally {
            setSendingLink(false);
        }
    };

    const handleSendEmail = async () => {
        if (!customer) return;
        setSendingLink(true);
        try {
            const result = await sendAccessLink(customer.id, 'email', password || undefined);
            if ('error' in result && result.error) {
                toast.error(result.error);
            } else {
                toast.success('Email de acesso enviado com sucesso!');
            }
        } finally {
            setSendingLink(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="font-heading text-xl flex items-center gap-2">
                        <Key className="h-5 w-5 text-bronze" />
                        Acesso do Cliente
                    </DialogTitle>
                    <DialogDescription>
                        {customer?.full_name} — {store?.company_name}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                    {/* Credentials Display */}
                    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Link de Acesso</Label>
                            <p className="text-sm font-mono bg-white rounded px-2 py-1.5 border truncate">{loginUrl}</p>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Usuário (E-mail)</Label>
                            <p className="text-sm font-mono bg-white rounded px-2 py-1.5 border">{customer?.email}</p>
                        </div>
                        {password && (
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Senha</Label>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-mono bg-white rounded px-2 py-1.5 border flex-1">
                                        {showPassword ? password : '••••••••'}
                                    </p>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <Button variant="outline" size="sm" onClick={handleCopyCredentials} className="w-full gap-2 mt-2">
                            <Copy className="h-4 w-4" />
                            Copiar Credenciais
                        </Button>
                    </div>

                    <Separator />

                    {/* Password Generation */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Definir Senha</h4>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerate}
                            disabled={generating}
                            className="w-full gap-2"
                        >
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Gerar Senha Aleatória
                        </Button>

                        <div className="flex gap-2">
                            <Input
                                placeholder="Ou defina uma senha..."
                                value={customPassword}
                                onChange={(e) => setCustomPassword(e.target.value)}
                                className="bg-white/60 text-sm"
                            />
                            <Button
                                size="sm"
                                onClick={handleSetCustomPassword}
                                disabled={settingPassword || !customPassword}
                                className="shrink-0 gradient-navy border-0 text-white"
                            >
                                {settingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Definir'}
                            </Button>
                        </div>
                    </div>

                    <Separator />

                    {/* Send Access Link */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-navy">Enviar Link de Acesso</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                variant="outline"
                                onClick={handleSendWhatsApp}
                                disabled={sendingLink}
                                className="gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                            >
                                {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                WhatsApp
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleSendEmail}
                                disabled={sendingLink}
                                className="gap-2"
                            >
                                {sendingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                E-mail
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
