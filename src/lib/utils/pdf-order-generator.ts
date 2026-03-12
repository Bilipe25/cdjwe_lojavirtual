import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { Order, OrderItem, SystemSettings } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Initialize pdfMake fonts
;(pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs

export async function generateOrderReceiptPDF(
  order: Order & { store?: any; profile?: any; payment_condition?: any },
  items: OrderItem[],
  settings?: SystemSettings | null
) {
  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    content: [
      // Company Header
      {
        columns: [
          settings?.logo_url ? {
            text: 'LOGO', // Placeholder for logo if we had a way to convert URL to base64 easily, for now text
            fontSize: 20,
            bold: true,
            color: '#0f172a',
            width: 'auto'
          } : {
            text: settings?.system_name || 'CDJWE',
            fontSize: 20,
            bold: true,
            color: '#0f172a',
            width: 'auto'
          },
          {
            stack: [
              { text: settings?.system_name || 'CDJWE', bold: true, fontSize: 14 },
              { text: settings?.cnpj ? `CNPJ: ${settings.cnpj}` : '', fontSize: 9, color: '#64748b' },
              { text: settings?.address || '', fontSize: 9, color: '#64748b' },
              { text: `${settings?.city || ''} - ${settings?.state || ''}`, fontSize: 9, color: '#64748b' },
            ],
            alignment: 'right'
          }
        ],
        margin: [0, 0, 0, 20]
      },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 20] },

      // Title and Basic Order Info
      {
        columns: [
          {
            stack: [
              { text: 'COMPROVANTE DE PEDIDO', fontSize: 18, bold: true, color: '#0f172a' },
              { text: `Número: ${order.order_number}`, fontSize: 12, bold: true, color: '#c2410c', margin: [0, 2, 0, 0] }
            ]
          },
          {
            stack: [
              { text: `Data: ${format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, fontSize: 10, alignment: 'right' },
              { text: `Status: ${getStatusLabel(order.status).toUpperCase()}`, fontSize: 10, bold: true, alignment: 'right', color: getStatusColor(order.status), margin: [0, 2, 0, 0] }
            ]
          }
        ],
        margin: [0, 0, 0, 30]
      },

      // Customer Info
      {
        table: {
          widths: ['*'],
          body: [
            [{ text: 'DADOS DO CLIENTE', fillColor: '#f1f5f9', bold: true, fontSize: 10, margin: [10, 5, 10, 5], color: '#0f172a', border: [false, false, false, false] }],
            [{
              columns: [
                {
                  stack: [
                    { text: 'Lojista / Razão Social:', fontSize: 8, color: '#64748b' },
                    { text: order.store?.company_name || 'N/A', fontSize: 10, bold: true }
                  ],
                  width: '*'
                },
                {
                  stack: [
                    { text: 'CNPJ:', fontSize: 8, color: '#64748b' },
                    { text: order.store?.cnpj || 'N/A', fontSize: 10, bold: true }
                  ],
                  width: '*'
                }
              ],
              margin: [10, 10, 10, 15] as [number, number, number, number],
              border: [false, false, false, false]
            }],
            [{
              columns: [
                {
                  stack: [
                    { text: 'Representante:', fontSize: 8, color: '#64748b' },
                    { text: order.profile?.full_name || 'N/A', fontSize: 10, bold: true }
                  ],
                  width: '*'
                },
                {
                  stack: [
                    { text: 'Telefone:', fontSize: 8, color: '#64748b' },
                    { text: order.store?.phone || order.profile?.phone || 'N/A', fontSize: 10, bold: true }
                  ],
                  width: '*'
                }
              ],
              margin: [10, 0, 10, 15] as [number, number, number, number],
              border: [false, false, false, false]
            }]
          ]
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 30]
      },

      // Items Table
      { text: 'ITENS DO PEDIDO', fontSize: 10, bold: true, color: '#0f172a', margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'PRODUTO / DESCRIÇÃO', bold: true, fontSize: 9, fillColor: '#f1f5f9', border: [false, true, false, true], margin: [0, 5, 0, 5] },
              { text: 'QTD', bold: true, fontSize: 9, alignment: 'center', fillColor: '#f1f5f9', border: [false, true, false, true], margin: [0, 5, 0, 5] },
              { text: 'UNID.', bold: true, fontSize: 9, alignment: 'right', fillColor: '#f1f5f9', border: [false, true, false, true], margin: [0, 5, 0, 5] },
              { text: 'TOTAL', bold: true, fontSize: 9, alignment: 'right', fillColor: '#f1f5f9', border: [false, true, false, true], margin: [0, 5, 0, 5] },
            ] as any,
            ...items.map(item => [
              {
                stack: [
                  { text: item.product_name, fontSize: 10, bold: true },
                  { text: `${item.fabric_name} - ${item.color_name}${item.size ? ` - ${item.size}` : ''}`, fontSize: 8, color: '#64748b' }
                ],
                margin: [0, 5, 0, 5],
                border: [false, false, false, true]
              },
              { text: item.quantity.toString(), fontSize: 10, alignment: 'center', margin: [0, 5, 0, 5], border: [false, false, false, true] },
              { text: `R$ ${item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, fontSize: 10, alignment: 'right', margin: [0, 5, 0, 5], border: [false, false, false, true] },
              { text: `R$ ${item.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, fontSize: 10, bold: true, alignment: 'right', margin: [0, 5, 0, 5], border: [false, false, false, true] },
            ] as any)
          ]
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 20]
      } as any,

      // Totals and Payment
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'FORMA DE PAGAMENTO', fontSize: 9, bold: true, color: '#0f172a', margin: [0, 0, 0, 4] },
              { text: order.payment_condition?.name || 'A combinar', fontSize: 10, bold: true },
              { text: order.payment_condition?.description || '', fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] },
              order.notes ? { 
                stack: [
                  { text: 'OBSERVAÇÕES', fontSize: 9, bold: true, color: '#0f172a', margin: [0, 15, 0, 4] },
                  { text: order.notes, fontSize: 9, color: '#475569' }
                ]
              } : null
            ].filter(Boolean) as any
          },
          {
            width: 150,
            stack: [
              {
                columns: [
                  { text: 'SUBTOTAL:', fontSize: 10, color: '#64748b' },
                  { text: `R$ ${order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, fontSize: 10, alignment: 'right' }
                ],
                margin: [0, 0, 0, 4]
              },
              {
                columns: [
                  { text: 'DESCONTO:', fontSize: 10, color: '#16a34a' },
                  { text: `- R$ ${order.discount_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, fontSize: 10, alignment: 'right', color: '#16a34a' }
                ],
                margin: [0, 0, 0, 8]
              },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 8] },
              {
                columns: [
                  { text: 'TOTAL:', fontSize: 12, bold: true, color: '#0f172a' },
                  { text: `R$ ${order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, fontSize: 14, bold: true, alignment: 'right', color: '#c2410c' }
                ]
              }
            ]
          }
        ],
        margin: [0, 20, 0, 0]
      },

      // Footer disclaimer
      {
        text: 'Este documento é um comprovante de solicitação de pedido e está sujeito à análise de crédito e disponibilidade de estoque pela CDJWE.',
        fontSize: 8,
        color: '#94a3b8',
        alignment: 'center',
        margin: [40, 60, 40, 0]
      }
    ],
    styles: {
      header: { fontSize: 18, bold: true },
      subheader: { fontSize: 14, bold: true }
    },
    defaultStyle: { font: 'Roboto' }
  }

  pdfMake.createPdf(docDefinition).download(`Pedido-${order.order_number}-${order.store?.company_name || 'receipt'}.pdf`)
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Em Análise',
    approved: 'Aprovado',
    in_production: 'Em Produção',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado'
  }
  return labels[status] || status
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: '#d97706', // amber
    approved: '#2563eb', // blue
    in_production: '#9333ea', // purple
    shipped: '#0891b2', // cyan
    delivered: '#16a34a', // green
    cancelled: '#dc2626'  // red
  }
  return colors[status] || '#0f172a'
}
