'use client'

import { ChevronLeft, ChevronRight, Mail, MapPin, Pencil, Phone, Plus, Search, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { BuilderCustomer } from '@/components/sales/order-builder/types'
import { cn } from '@/lib/utils'

export function CustomerSelectionOverlay({
  previewCustomer,
  customers,
  selectedStoreId,
  customerSearch,
  isCustomerSearchActive,
  onCustomerSearchChange,
  onCustomerSearchActiveChange,
  onPreviewCustomerChange,
  onClose,
  onCreateCustomer,
  onEditCustomer,
  onSelectCustomer,
}: {
  previewCustomer: BuilderCustomer | null
  customers: BuilderCustomer[]
  selectedStoreId: string
  customerSearch: string
  isCustomerSearchActive: boolean
  onCustomerSearchChange: (value: string) => void
  onCustomerSearchActiveChange: (value: boolean) => void
  onPreviewCustomerChange: (value: BuilderCustomer | null) => void
  onClose: () => void
  onCreateCustomer: () => void
  onEditCustomer: (customer: BuilderCustomer) => void
  onSelectCustomer: (customerId: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {previewCustomer ? (
        <>
          <div className="flex h-14 shrink-0 items-center justify-between px-4 py-3 text-white gradient-navy">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onPreviewCustomerChange(null)}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                title="Voltar"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <h2 className="text-lg font-bold font-heading">Dados do cliente</h2>
            </div>
            <button
              type="button"
              onClick={() => onEditCustomer(previewCustomer)}
              className="rounded-full p-2 transition-colors hover:bg-white/20"
              title="Editar"
            >
              <Pencil className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-y-contain bg-background" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="px-5 pb-4 pt-5">
              <h3 className="text-lg font-bold leading-snug text-foreground">{previewCustomer.company_name}</h3>
              {previewCustomer.cnpj ? <p className="mt-0.5 text-sm text-muted-foreground">CNPJ: {previewCustomer.cnpj}</p> : null}
              {previewCustomer.state_registration ? (
                <p className="text-sm text-muted-foreground">Inscricao Estadual: {previewCustomer.state_registration}</p>
              ) : null}
              {previewCustomer.customer_code ? (
                <p className="text-sm text-muted-foreground">Codigo: #{previewCustomer.customer_code}</p>
              ) : null}
            </div>

            <Separator />

            {previewCustomer.phone ? (
              <div className="flex items-center gap-4 border-b border-border/30 px-5 py-4">
                <Phone className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Celular</p>
                  <p className="text-sm font-medium text-foreground">{previewCustomer.phone}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ) : null}

            {previewCustomer.email ? (
              <div className="flex items-center gap-4 border-b border-border/30 px-5 py-4">
                <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{previewCustomer.email}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ) : null}

            {(() => {
              const address = previewCustomer.addresses?.find((item) => item.is_main) || previewCustomer.addresses?.[0]
              const legacyAddress = !address && previewCustomer.address
                ? {
                    address: previewCustomer.address,
                    city: previewCustomer.city,
                    state: previewCustomer.state,
                    zip_code: previewCustomer.zip_code,
                    neighborhood: null as string | null,
                  }
                : null
              const display = address || legacyAddress
              if (!display) return null

              return (
                <div className="flex items-start gap-4 border-b border-border/30 px-5 py-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{display.address}</p>
                    {display.neighborhood ? <p className="text-sm text-muted-foreground">{display.neighborhood}</p> : null}
                    <p className="text-sm text-muted-foreground">{[display.city, display.state].filter(Boolean).join(' - ')}</p>
                    {display.zip_code ? <p className="text-sm text-muted-foreground">{display.zip_code}</p> : null}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              )
            })()}

            {previewCustomer.assigned_price_tables && previewCustomer.assigned_price_tables.length > 0 ? (
              <>
                <div className="px-5 pb-2 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tabelas de preco</p>
                </div>
                <div className="flex flex-wrap gap-2 px-5 pb-4">
                  {previewCustomer.assigned_price_tables.map((table) => (
                    <Badge key={table.id} variant="outline" className="border-border text-xs">
                      {table.name}
                    </Badge>
                  ))}
                </div>
              </>
            ) : null}

            {previewCustomer.addresses && previewCustomer.addresses.length > 1 ? (
              <>
                <div className="px-5 pb-2 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Enderecos ({previewCustomer.addresses.length})
                  </p>
                </div>
                {previewCustomer.addresses.map((address) => (
                  <div key={address.id} className="flex items-start gap-4 border-b border-border/20 px-5 py-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">
                        {address.title}
                        {address.is_main ? ' (Principal)' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {address.address}
                        {address.number ? `, ${address.number}` : ''} - {address.city}/{address.state}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </div>

          <div className="safe-bottom shrink-0 border-t border-border/40 bg-card p-4">
            <Button
              className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-navy text-white hover:opacity-90"
              onClick={() => onSelectCustomer(previewCustomer.id)}
            >
              SELECIONAR ESTE CLIENTE
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="relative flex h-14 shrink-0 items-center justify-between overflow-hidden px-4 py-3 text-white gradient-navy">
            <div
              className={cn(
                'flex items-center gap-3 transition-all duration-300',
                isCustomerSearchActive ? 'pointer-events-none -translate-x-10 opacity-0' : 'translate-x-0 opacity-100'
              )}
            >
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                title="Voltar"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <h2 className="text-lg font-bold font-heading">Clientes</h2>
            </div>

            <div
              className={cn(
                'absolute inset-y-0 left-0 right-14 flex items-center px-4 transition-all duration-300',
                isCustomerSearchActive ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-10 opacity-0'
              )}
            >
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                <Input
                  value={customerSearch}
                  onChange={(event) => onCustomerSearchChange(event.target.value)}
                  placeholder="Buscar por Razao Social..."
                  className="h-10 rounded-xl border-0 border-white/20 bg-white/10 pl-10 text-white transition-all placeholder:text-white/40 focus:bg-white/20 focus-visible:ring-1 focus-visible:ring-white/30"
                  autoFocus={isCustomerSearchActive}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 bg-transparent">
              <button
                type="button"
                onClick={() => onCustomerSearchActiveChange(!isCustomerSearchActive)}
                className={cn('rounded-full p-2 transition-colors', isCustomerSearchActive ? 'bg-white/20' : 'hover:bg-white/20')}
                title="Buscar"
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onCreateCustomer}
                className="rounded-full p-2 transition-colors hover:bg-white/20"
                title="Novo Cliente"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-y-contain bg-muted/10" style={{ WebkitOverflowScrolling: 'touch' }}>
            {customers.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Users className="h-8 w-8 opacity-20" />
                <p>Nenhum cliente encontrado.</p>
              </div>
            ) : (
              customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onPreviewCustomerChange(customer)}
                  className="group flex w-full items-center gap-3 border-b border-border/30 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="w-1 shrink-0 self-stretch rounded-full bg-emerald-500/60" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                      {customer.company_name}
                    </p>
                    {customer.trade_name && customer.trade_name !== customer.company_name ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{customer.trade_name}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedStoreId === customer.id ? (
                      <Badge className="h-5 bg-emerald-500 text-[9px] hover:bg-emerald-600">Atual</Badge>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
