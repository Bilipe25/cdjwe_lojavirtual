import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import type { OrderItem, OrderStatus, SystemSettings } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getBase64ImageFromURL } from '@/lib/utils'
import {
    buildOrderSnapshotSummary,
    formatOrderCurrency,
    getOrderItemCommunicationPricing,
} from '@/lib/orders/order-communication'

const pdfFontsConfig = pdfFonts as unknown as { pdfMake?: { vfs?: unknown }; vfs?: unknown }
const pdfMakeConfig = pdfMake as unknown as {
    vfs?: unknown
    fonts?: Record<
        string,
        {
            normal: string
            bold: string
            italics: string
            bolditalics: string
        }
    >
}

if (pdfFonts && pdfFontsConfig.pdfMake) {
    pdfMakeConfig.vfs = pdfFontsConfig.pdfMake.vfs
} else if (pdfFonts) {
    pdfMakeConfig.vfs = pdfFontsConfig.vfs || pdfFonts
}

type ReceiptOrder = {
    id: string
    order_number: string
    status: OrderStatus
    created_at: string
    subtotal: number
    discount_amount: number
    total: number
    notes?: string | null
    store?: {
        company_name?: string | null
        cnpj?: string | null
        address?: string | null
        city?: string | null
        state?: string | null
        zip_code?: string | null
        phone?: string | null
    } | null
    profile?: {
        full_name?: string | null
        phone?: string | null
    } | null
    payment_condition?: {
        name?: string | null
    } | null
}

function buildPricingLine(item: OrderItem) {
    const pricing = getOrderItemCommunicationPricing({
        productName: item.product_name,
        fabricName: item.fabric_name,
        colorName: item.color_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        productPrice: item.product_price,
        variationPrice: item.variation_price,
        finalPrice: item.final_price,
    })

    const parts = [pricing.appliedLabel, `Base ${formatOrderCurrency(pricing.basePrice)}`]

    if (pricing.variationPrice !== null) {
        parts.push(`Cor ${formatOrderCurrency(pricing.variationPrice)}`)
    }

    if (pricing.hasFrozenSnapshot) {
        parts.push(`Final ${formatOrderCurrency(pricing.finalPrice)}`)
    }

    return parts.join(' | ')
}

export async function generateOrderReceiptPDF(
    order: ReceiptOrder,
    items: OrderItem[],
    settings?: SystemSettings | null
) {
    const logoBase64 = settings?.logo_url ? await getBase64ImageFromURL(settings.logo_url) : null
    const snapshotSummary = buildOrderSnapshotSummary(
        items.map((item) => ({
            productName: item.product_name,
            fabricName: item.fabric_name,
            colorName: item.color_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            subtotal: item.subtotal,
            productPrice: item.product_price,
            variationPrice: item.variation_price,
            finalPrice: item.final_price,
        }))
    )

    const itemRows: TableCell[][] = items.map((item) => [
        {
            stack: [
                { text: item.product_name, fontSize: 10, bold: true, color: '#0f172a' },
                { text: `${item.fabric_name} - ${item.color_name}${item.size ? ` - ${item.size}` : ''}`, fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0] },
                { text: buildPricingLine(item), fontSize: 7, color: '#475569', margin: [0, 4, 0, 0] },
            ],
            margin: [0, 8, 0, 8],
            border: [false, false, false, true],
        },
        { text: item.quantity.toString(), fontSize: 10, alignment: 'center', margin: [0, 8, 0, 8], border: [false, false, false, true] },
        { text: formatOrderCurrency(item.unit_price), fontSize: 10, alignment: 'right', margin: [0, 8, 0, 8], border: [false, false, false, true] },
        { text: formatOrderCurrency(item.subtotal), fontSize: 10, bold: true, alignment: 'right', margin: [0, 8, 0, 8], border: [false, false, false, true] },
    ])

    const content: Content[] = [
        {
            columns: [
                logoBase64
                    ? {
                          image: logoBase64,
                          width: 80,
                          margin: [0, 0, 0, 10],
                      }
                    : {
                          text: settings?.system_name || 'CDJWE',
                          fontSize: 22,
                          bold: true,
                          color: '#0f172a',
                          width: 'auto',
                      },
                {
                    stack: [
                        { text: settings?.system_name || 'CDJWE ESTOFADOS', bold: true, fontSize: 14, color: '#0f172a' },
                        { text: settings?.cnpj ? `CNPJ: ${settings.cnpj}` : '', fontSize: 9, color: '#475569', margin: [0, 2, 0, 0] },
                        { text: settings?.address || '', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] },
                        { text: `${settings?.city || ''} - ${settings?.state || ''}${settings?.zip_code ? ` (CEP: ${settings.zip_code})` : ''}`, fontSize: 9, color: '#64748b' },
                    ],
                    alignment: 'right',
                },
            ],
            margin: [0, 0, 0, 20],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 20] },
        {
            columns: [
                {
                    stack: [
                        { text: 'COMPROVANTE DE PEDIDO', fontSize: 18, bold: true, color: '#0f172a' },
                        { text: `Numero: ${order.order_number}`, fontSize: 12, bold: true, color: '#c2410c', margin: [0, 2, 0, 0] },
                    ],
                },
                {
                    stack: [
                        { text: `Data: ${format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, fontSize: 10, alignment: 'right', color: '#475569' },
                        { text: `Status: ${getStatusLabel(order.status).toUpperCase()}`, fontSize: 10, bold: true, alignment: 'right', color: getStatusColor(order.status), margin: [0, 2, 0, 0] },
                    ],
                },
            ],
            margin: [0, 0, 0, 30],
        },
        {
            table: {
                widths: ['*'],
                body: [
                    [{ text: 'DADOS DO CLIENTE', fillColor: '#f1f5f9', bold: true, fontSize: 10, margin: [10, 5, 10, 5], color: '#0f172a', border: [false, false, false, false] }],
                    [{
                        columns: [
                            {
                                stack: [
                                    { text: 'Lojista / Razao Social:', fontSize: 8, color: '#64748b' },
                                    { text: order.store?.company_name || 'N/A', fontSize: 10, bold: true },
                                ],
                                width: '65%',
                            },
                            {
                                stack: [
                                    { text: 'CNPJ:', fontSize: 8, color: '#64748b' },
                                    { text: order.store?.cnpj || 'N/A', fontSize: 10, bold: true },
                                ],
                                width: '35%',
                            },
                        ],
                        margin: [10, 10, 10, 5],
                        border: [false, false, false, false],
                    }],
                    [{
                        stack: [
                            { text: 'Endereco:', fontSize: 8, color: '#64748b' },
                            {
                                text: [
                                    order.store?.address,
                                    order.store?.city,
                                    order.store?.state,
                                    order.store?.zip_code ? `CEP: ${order.store.zip_code}` : '',
                                ]
                                    .filter(Boolean)
                                    .join(', ') || 'Endereco nao informado',
                                fontSize: 9,
                                bold: true,
                            },
                        ],
                        margin: [10, 5, 10, 10],
                        border: [false, false, false, false],
                    }],
                    [{
                        columns: [
                            {
                                stack: [
                                    { text: 'Representante:', fontSize: 8, color: '#64748b' },
                                    { text: order.profile?.full_name || 'N/A', fontSize: 10, bold: true },
                                ],
                                width: '65%',
                            },
                            {
                                stack: [
                                    { text: 'Telefone:', fontSize: 8, color: '#64748b' },
                                    { text: order.store?.phone || order.profile?.phone || 'N/A', fontSize: 10, bold: true },
                                ],
                                width: '35%',
                            },
                        ],
                        margin: [10, 0, 10, 15],
                        border: [false, false, false, false],
                    }],
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 30],
        },
        { text: 'ITENS DO PEDIDO', fontSize: 10, bold: true, color: '#0f172a', margin: [0, 0, 0, 10] },
        {
            table: {
                headerRows: 1,
                widths: ['*', 'auto', 'auto', 'auto'],
                body: [
                    [
                        { text: 'PRODUTO / DESCRICAO', bold: true, fontSize: 9, fillColor: '#f8fafc', border: [false, true, false, true], margin: [0, 8, 0, 8] },
                        { text: 'QTD', bold: true, fontSize: 9, alignment: 'center', fillColor: '#f8fafc', border: [false, true, false, true], margin: [0, 8, 0, 8] },
                        { text: 'UNID.', bold: true, fontSize: 9, alignment: 'right', fillColor: '#f8fafc', border: [false, true, false, true], margin: [0, 8, 0, 8] },
                        { text: 'TOTAL', bold: true, fontSize: 9, alignment: 'right', fillColor: '#f8fafc', border: [false, true, false, true], margin: [0, 8, 0, 8] },
                    ],
                    ...itemRows,
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 16],
        },
        {
            table: {
                widths: ['*'],
                body: [[{
                    stack: [
                        { text: 'SNAPSHOT FINANCEIRO', fontSize: 9, bold: true, color: '#0f172a' },
                        { text: snapshotSummary, fontSize: 9, color: '#475569', margin: [0, 5, 0, 0], lineHeight: 1.3 },
                    ],
                    fillColor: '#f8fafc',
                    border: [false, false, false, false],
                    margin: [12, 10, 12, 10],
                }]],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 20],
        },
        {
            columns: [
                {
                    width: '*',
                    stack: [
                        { text: 'CONDICAO DE PAGAMENTO', fontSize: 9, bold: true, color: '#0f172a', margin: [0, 0, 0, 6] },
                        {
                            canvas: [{ type: 'rect', x: 0, y: 0, w: 200, h: 25, r: 4, color: '#f8fafc', lineColor: '#e2e8f0', lineWidth: 0.5 }],
                            margin: [0, 0, 0, -25],
                        },
                        { text: (order.payment_condition?.name || 'A COMBINAR').toUpperCase(), fontSize: 10, bold: true, color: '#1e293b', margin: [10, 7, 0, 0] },
                        order.notes
                            ? {
                                  stack: [
                                      { text: 'OBSERVACOES', fontSize: 9, bold: true, color: '#0f172a', margin: [0, 20, 0, 6] },
                                      { text: order.notes, fontSize: 9, color: '#475569', lineHeight: 1.2 },
                                  ],
                              }
                            : null,
                    ].filter(Boolean) as Content[],
                },
                {
                    width: 170,
                    stack: [
                        {
                            columns: [
                                { text: 'SUBTOTAL:', fontSize: 10, color: '#64748b' },
                                { text: formatOrderCurrency(order.subtotal), fontSize: 10, alignment: 'right', bold: true },
                            ],
                            margin: [0, 0, 0, 6],
                        },
                        {
                            columns: [
                                { text: 'DESCONTO:', fontSize: 10, color: '#16a34a' },
                                { text: `- ${formatOrderCurrency(order.discount_amount)}`, fontSize: 10, alignment: 'right', color: '#16a34a', bold: true },
                            ],
                            margin: [0, 0, 0, 10],
                        },
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 170, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 10] },
                        {
                            columns: [
                                { text: 'TOTAL DO PEDIDO:', fontSize: 11, bold: true, color: '#0f172a' },
                                { text: formatOrderCurrency(order.total), fontSize: 16, bold: true, alignment: 'right', color: '#c2410c' },
                            ],
                        },
                    ],
                },
            ],
            margin: [0, 25, 0, 0],
        },
        {
            text: 'Este documento registra o pedido com snapshot financeiro congelado. Alteracoes futuras em produto, cor ou tabela comercial nao alteram este historico.',
            fontSize: 8,
            color: '#94a3b8',
            alignment: 'center',
            margin: [40, 60, 40, 0],
        },
    ]

    const docDefinition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content,
        styles: {
            header: { fontSize: 18, bold: true },
            subheader: { fontSize: 14, bold: true },
        },
        defaultStyle: { font: 'Roboto' },
    }

    const vfs = (pdfMakeConfig.vfs as Record<string, string> | undefined) || {}
    const keys = Object.keys(vfs)
    const findFont = (patterns: string[], fallback: string) => {
        const match = keys.find((key) => patterns.some((pattern) => key.toLowerCase().includes(pattern.toLowerCase())))
        return match || fallback
    }

    const regular = findFont(['roboto-regular.ttf', 'roboto.ttf'], 'Roboto-Regular.ttf')
    const bold = findFont(['roboto-medium.ttf', 'roboto-bold.ttf'], regular)
    const italic = findFont(['roboto-italic.ttf'], regular)
    const boldItalic = findFont(['roboto-mediumitalic.ttf', 'roboto-bolditalic.ttf'], bold)

    pdfMakeConfig.fonts = {
        Roboto: {
            normal: regular,
            bold,
            italics: italic,
            bolditalics: boldItalic,
        },
    }

    pdfMake.createPdf(docDefinition).download(`Pedido-${order.order_number}-${order.store?.company_name || 'comprovante'}.pdf`)
}

function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
        pending: 'Em analise',
        approved: 'Aprovado',
        in_production: 'Em producao',
        shipped: 'Enviado',
        delivered: 'Entregue',
        cancelled: 'Cancelado',
    }
    return labels[status] || status
}

function getStatusColor(status: string) {
    const colors: Record<string, string> = {
        pending: '#d97706',
        approved: '#2563eb',
        in_production: '#9333ea',
        shipped: '#0891b2',
        delivered: '#16a34a',
        cancelled: '#dc2626',
    }
    return colors[status] || '#0f172a'
}
