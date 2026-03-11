'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, Mail, MapPin, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SystemSettings } from '@/lib/types'

export function StoreFooter() {
    const [settings, setSettings] = useState<SystemSettings | null>(null)

    useEffect(() => {
        const load = async () => {
            const supabase = createClient()
            const { data } = await supabase.from('system_settings').select('*').limit(1).single()
            if (data) setSettings(data as SystemSettings)
        }
        load()
    }, [])

    const companyName = settings?.system_name || 'CDJWE Estofados'
    const initials = companyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    const whatsappNumber = settings?.whatsapp?.replace(/\D/g, '') || ''
    const whatsappLink = whatsappNumber ? `https://wa.me/55${whatsappNumber}` : null

    const fullAddress = [settings?.address, settings?.city, settings?.state].filter(Boolean).join(', ')
    const cepDisplay = settings?.zip_code ? ` — CEP: ${settings.zip_code}` : ''

    return (
        <footer className="border-t bg-muted/30" role="contentinfo">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <div className="flex items-center gap-2.5 mb-3">
                            {settings?.logo_url ? (
                                <div className="h-10 w-32 shrink-0 relative">
                                    <Image
                                        priority
                                        src={settings.logo_url}
                                        alt={companyName}
                                        fill
                                        className="object-contain object-left"
                                    />
                                </div>
                            ) : (
                                <div className="h-9 w-9 rounded-lg gradient-bronze flex items-center justify-center shrink-0">
                                    <span className="text-white font-bold text-xs">{initials}</span>
                                </div>
                            )}
                            <span className="font-semibold font-heading text-gradient-navy">{companyName}</span>
                        </div>
                        {settings?.cnpj && (
                            <p className="text-xs text-muted-foreground mb-2">CNPJ: {settings.cnpj}</p>
                        )}
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Estofados de alta qualidade para revenda. Fábrica própria com entrega para todo o Brasil.
                        </p>

                        {/* Social Icons */}
                        {(settings?.instagram || settings?.facebook || whatsappLink) && (
                            <div className="flex items-center gap-3 mt-4">
                                {whatsappLink && (
                                    <a
                                        href={whatsappLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors"
                                        aria-label="WhatsApp"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                    </a>
                                )}
                                {settings?.instagram && (
                                    <a
                                        href={settings.instagram.startsWith('http') ? settings.instagram : `https://instagram.com/${settings.instagram.replace('@', '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-8 w-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center hover:bg-pink-200 transition-colors"
                                        aria-label="Instagram"
                                    >
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153a4.908 4.908 0 0 1 1.153 1.772c.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772 4.915 4.915 0 0 1-1.772 1.153c-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 0 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
                                        </svg>
                                    </a>
                                )}
                                {settings?.facebook && (
                                    <a
                                        href={settings.facebook.startsWith('http') ? settings.facebook : `https://facebook.com/${settings.facebook}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                                        aria-label="Facebook"
                                    >
                                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                        </svg>
                                    </a>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div>
                        <h3 className="font-semibold text-sm mb-3">Navegação</h3>
                        <nav className="flex flex-col gap-2">
                            <Link href="/catalog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Catálogo</Link>
                            <Link href="/favorites" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Favoritos</Link>
                            <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Meus Pedidos</Link>
                            <Link href="/cart" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Carrinho</Link>
                            <Link href="/profile" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Meu Perfil</Link>
                        </nav>
                    </div>

                    {/* Contact Info */}
                    <div>
                        <h3 className="font-semibold text-sm mb-3">Contato</h3>
                        <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
                            {(settings?.phone || settings?.phone_secondary) && (
                                <div className="flex items-start gap-2">
                                    <Phone className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" />
                                    <div>
                                        {settings?.phone && <p>{settings.phone}</p>}
                                        {settings?.phone_secondary && <p>{settings.phone_secondary}</p>}
                                    </div>
                                </div>
                            )}
                            {settings?.email && (
                                <a href={`mailto:${settings.email}`} className="flex items-center gap-2 hover:text-foreground transition-colors">
                                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                                    {settings.email}
                                </a>
                            )}
                            {whatsappLink && settings?.whatsapp && (
                                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                                    <MessageCircle className="h-4 w-4 shrink-0 text-green-500" />
                                    {settings.whatsapp}
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Address */}
                    <div>
                        <h3 className="font-semibold text-sm mb-3">Endereço</h3>
                        <div className="text-sm text-muted-foreground">
                            {fullAddress ? (
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" />
                                    <p className="leading-relaxed">
                                        {fullAddress}{cepDisplay}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-muted-foreground/50 italic text-xs">Endereço não configurado</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Copyright */}
                <div className="border-t mt-8 pt-6 text-center text-xs text-muted-foreground">
                    <p>© {new Date().getFullYear()} {companyName}. Todos os direitos reservados.</p>
                </div>
            </div>
        </footer>
    )
}
