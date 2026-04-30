'use client'

import { CheckCircle2, Copy, FileDown, FileText, Home, Loader2, MessageCircle, Share2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CompletionActionRow } from '@/components/sales/order-builder/components/completion-action-row'
import type { OrderBuilderCompletionData } from '@/components/sales/order-builder/types'
import { formatCurrency } from '@/components/sales/order-builder/utils'

type CompletionHandler = () => unknown | Promise<unknown>

export function OrderCompletionOverlay({
  loading,
  data,
  pdfLoading,
  whatsAppLoading,
  shareLoading,
  onShare,
  onWhatsApp,
  onDownloadPdf,
  onPrintAndWhatsApp,
  onNewForCustomer,
  onViewOrder,
  onBackDashboard,
}: {
  loading: boolean
  data: OrderBuilderCompletionData | null
  pdfLoading: boolean
  whatsAppLoading: boolean
  shareLoading: boolean
  onShare: CompletionHandler
  onWhatsApp: CompletionHandler
  onDownloadPdf: CompletionHandler
  onPrintAndWhatsApp: CompletionHandler
  onNewForCustomer: () => void
  onViewOrder: () => void
  onBackDashboard: () => void
}) {
  if (!loading && !data) return null

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-background">
      {loading || !data ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="glass-card rounded-2xl border border-border/40 px-6 py-6 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium text-foreground">Preparando finalizacao do pedido...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 pb-5 pt-4 text-white gradient-navy shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold font-heading">Atendimento finalizado</p>
                <p className="mt-0.5 text-xs text-white/75">Pedido #{data.order.order_number}</p>
                <p className="mt-1 text-[11px] text-white/70">Total {formatCurrency(data.order.total)}</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
            <div className="glass-card overflow-hidden rounded-2xl border border-border/40">
              <CompletionActionRow
                icon={Share2}
                label="Compartilhar"
                description="Compartilhe o resumo do pedido"
                onClick={() => {
                  void onShare()
                }}
                busy={shareLoading}
              />
              <CompletionActionRow
                icon={MessageCircle}
                label="Enviar por WhatsApp"
                description="Abrir WhatsApp com mensagem pronta"
                onClick={() => {
                  void onWhatsApp()
                }}
                busy={whatsAppLoading}
              />
              <CompletionActionRow
                icon={FileDown}
                label="Impressao (PDF)"
                description="Gerar comprovante em PDF"
                onClick={() => {
                  void onDownloadPdf()
                }}
                busy={pdfLoading}
              />
              <CompletionActionRow
                icon={Copy}
                label="Imprimir e enviar no WhatsApp"
                description="Gera o PDF e abre o WhatsApp"
                onClick={() => {
                  void onPrintAndWhatsApp()
                }}
                busy={pdfLoading || whatsAppLoading}
              />
              <CompletionActionRow
                icon={ShoppingBag}
                label="Novo atendimento para este cliente"
                description="Iniciar novo pedido mantendo o cliente"
                onClick={onNewForCustomer}
              />
              <CompletionActionRow
                icon={FileText}
                label="Ver pedido finalizado"
                description="Abrir a pagina de detalhes do pedido"
                onClick={onViewOrder}
                last
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background/95 p-4 backdrop-blur-sm">
            <Button
              className="h-12 w-full rounded-xl border-0 text-sm font-bold gradient-bronze text-white hover:opacity-90"
              onClick={onBackDashboard}
            >
              <Home className="mr-2 h-4 w-4" />
              VOLTAR AO MENU INICIAL
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
