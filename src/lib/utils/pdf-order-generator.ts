import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces'
import type { OrderItem, OrderStatus, SystemSettings } from '@/lib/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getBase64ImageFromURL } from '@/lib/utils'
import {
    formatOrderCurrency,
    getOrderItemCommunicationPricing,
} from '@/lib/orders/order-communication'
import { getOrderPaymentDisplay } from '@/lib/orders/order-payment-display'

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
    created_by_profile?: {
        full_name?: string | null
        role?: string | null
    } | null
    payment_method_name?: string | null
    payment_method_code?: string | null
    payment_condition_name?: string | null
    payment_condition_description?: string | null
    payment_installments?: number | null
    payment_discount_percentage?: number | null
    payment_surcharge_percentage?: number | null
    payment_condition?: {
        name?: string | null
        description?: string | null
        installments?: number | null
        discount_percentage?: number | null
        surcharge_percentage?: number | null
    } | null
}

function buildItemVariantLine(item: OrderItem) {
    const parts = [item.fabric_name, item.color_name, item.size].filter(Boolean)
    return parts.length > 0 ? parts.join(' / ') : 'Sem variacao informada'
}

function buildAppliedPriceLine(item: OrderItem) {
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

    if (pricing.variationPrice !== null) {
        return `Preco unitario com ajuste de cor: ${formatOrderCurrency(pricing.finalPrice)}`
    }

    if (pricing.usesCommercialPolicy) {
        return `Preco unitario pela politica comercial: ${formatOrderCurrency(pricing.finalPrice)}`
    }

    return `Preco unitario aplicado: ${formatOrderCurrency(pricing.finalPrice)}`
}

function buildCustomerAddress(order: ReceiptOrder) {
    const parts = [
        order.store?.address,
        order.store?.city,
        order.store?.state,
        order.store?.zip_code ? `CEP ${order.store.zip_code}` : null,
    ].filter(Boolean)

    return parts.join(', ') || 'Endereco nao informado'
}

function buildCustomerPhone(order: ReceiptOrder) {
    return order.store?.phone || order.profile?.phone || 'Nao informado'
}

function buildRepresentative(order: ReceiptOrder) {
    return order.created_by_profile?.full_name || order.profile?.full_name || 'Nao informado'
}

function createSectionTitle(title: string, options?: { lineWidth?: number; marginBottom?: number }): Content {
    const lineWidth = options?.lineWidth ?? 515
    const marginBottom = options?.marginBottom ?? 10

    return {
        stack: [
            {
                text: title.toUpperCase(),
                fontSize: 8.5,
                bold: true,
                color: '#475569',
                characterSpacing: 0.8,
            },
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: lineWidth, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }],
                margin: [0, 6, 0, 0],
            },
        ],
        margin: [0, 0, 0, marginBottom],
    }
}

function createInfoCell(label: string, value: string, options?: { colSpan?: number }) {
    return {
        stack: [
            { text: label.toUpperCase(), fontSize: 7, color: '#94a3b8', bold: true, margin: [0, 0, 0, 3] },
            { text: value || 'N/A', fontSize: 9.6, color: '#0f172a', bold: true, lineHeight: 1.15 },
        ],
        fillColor: '#f8fafc',
        border: [false, false, false, false],
        margin: [10, 8, 10, 8],
        ...(options?.colSpan ? { colSpan: options.colSpan } : {}),
    } as TableCell
}

function createSummaryRow(label: string, value: string, options?: { highlight?: boolean; accent?: boolean }) {
    const isHighlight = options?.highlight ?? false
    const isAccent = options?.accent ?? false

    return {
        columns: [
            {
                text: label,
                fontSize: isHighlight ? 10.5 : 9.5,
                bold: isHighlight,
                color: isAccent ? '#16a34a' : '#64748b',
            },
            {
                text: value,
                fontSize: isHighlight ? 14 : 10,
                bold: true,
                alignment: 'right',
                color: isHighlight ? '#c2410c' : isAccent ? '#16a34a' : '#0f172a',
            },
        ],
        margin: [0, 0, 0, isHighlight ? 0 : 7],
    } as Content
}

export async function generateOrderReceiptPDF(
    order: ReceiptOrder,
    items: OrderItem[],
    settings?: SystemSettings | null
) {
    const logoBase64 = settings?.logo_url ? await getBase64ImageFromURL(settings.logo_url) : null
    const paymentDisplay = getOrderPaymentDisplay(order)
    const showCombinedPaymentLabel =
        !paymentDisplay.methodName ||
        !paymentDisplay.conditionName ||
        paymentDisplay.methodName === paymentDisplay.conditionName
    const paymentDetailsRows: Content[] = []

    if (paymentDisplay.methodName) {
        paymentDetailsRows.push({
            columns: [
                { text: 'Meio', fontSize: 7.4, color: '#94a3b8', bold: true, width: 52 },
                { text: paymentDisplay.methodName, fontSize: 8.4, color: '#0f172a', bold: true },
            ],
            margin: [0, 0, 0, 4],
        })
    }

    if (paymentDisplay.conditionName && paymentDisplay.conditionName !== paymentDisplay.methodName) {
        paymentDetailsRows.push({
            columns: [
                { text: 'Condicao', fontSize: 7.4, color: '#94a3b8', bold: true, width: 52 },
                { text: paymentDisplay.conditionName, fontSize: 8.4, color: '#0f172a', bold: true },
            ],
            margin: [0, 0, 0, 4],
        })
    }

    const paymentBoxStack: Content[] = [
        {
            text: 'CONFIRMADO NO CHECKOUT',
            fontSize: 7.2,
            bold: true,
            color: '#64748b',
            characterSpacing: 0.7,
        },
        {
            text: (showCombinedPaymentLabel ? paymentDisplay.combinedLabel : 'PAGAMENTO PERSONALIZADO').toUpperCase(),
            fontSize: 10,
            bold: true,
            color: '#1e293b',
            margin: [0, 5, 0, 0],
        },
    ]

    if (paymentDetailsRows.length > 0) {
        paymentBoxStack.push({
            stack: paymentDetailsRows,
            margin: [0, 8, 0, 0],
        })
    }

    if (paymentDisplay.adjustmentsLabel) {
        paymentBoxStack.push({
            text: paymentDisplay.adjustmentsLabel,
            fontSize: 8,
            color: '#047857',
            margin: [0, 8, 0, 0],
        })
    }

    if (paymentDisplay.description) {
        paymentBoxStack.push({
            text: paymentDisplay.description,
            fontSize: 8,
            color: '#64748b',
            lineHeight: 1.2,
            margin: [0, 4, 0, 0],
        })
    }

    const itemRows: TableCell[][] = items.map((item) => {
        const rowBorderColor: [string, string, string, string] = ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0']

        return [
            {
                stack: [
                    { text: item.product_name, fontSize: 10.2, bold: true, color: '#0f172a', lineHeight: 1.1 },
                    { text: buildItemVariantLine(item), fontSize: 8, color: '#64748b', margin: [0, 2, 0, 0], lineHeight: 1.15 },
                    { text: buildAppliedPriceLine(item), fontSize: 7.4, color: '#475569', margin: [0, 3, 0, 0], lineHeight: 1.15 },
                ],
                margin: [0, 5, 0, 5],
                border: [false, false, false, true],
                borderColor: rowBorderColor,
            },
            {
                text: item.quantity.toString(),
                fontSize: 9.5,
                alignment: 'center',
                margin: [0, 9, 0, 0],
                border: [false, false, false, true],
                borderColor: rowBorderColor,
            },
            {
                text: formatOrderCurrency(item.unit_price),
                fontSize: 9.5,
                alignment: 'right',
                margin: [0, 9, 0, 0],
                border: [false, false, false, true],
                borderColor: rowBorderColor,
            },
            {
                text: formatOrderCurrency(item.subtotal),
                fontSize: 9.7,
                bold: true,
                alignment: 'right',
                margin: [0, 9, 0, 0],
                border: [false, false, false, true],
                borderColor: rowBorderColor,
            },
        ]
    })

    const content: Content[] = [
        {
            columns: [
                logoBase64
                    ? {
                          image: logoBase64,
                          width: 80,
                          margin: [0, 0, 0, 6],
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
                        { text: settings?.system_name || 'CDJWE ESTOFADOS', bold: true, fontSize: 13.5, color: '#0f172a' },
                        { text: [settings?.city, settings?.state].filter(Boolean).join(' / '), fontSize: 8.5, color: '#64748b', margin: [0, 2, 0, 0] },
                        { text: settings?.cnpj ? `CNPJ ${settings.cnpj}` : '', fontSize: 8.5, color: '#94a3b8', margin: [0, 4, 0, 0] },
                    ],
                    alignment: 'right',
                },
            ],
            margin: [0, 0, 0, 14],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 0, 0, 16] },
        {
            columns: [
                {
                    stack: [
                        { text: 'COMPROVANTE DE PEDIDO', fontSize: 16, bold: true, color: '#0f172a' },
                        { text: `Numero ${order.order_number}`, fontSize: 10.5, bold: true, color: '#c2410c', margin: [0, 3, 0, 0] },
                    ],
                },
                {
                    stack: [
                        { text: `Emitido em ${format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, fontSize: 9.2, alignment: 'right', color: '#475569' },
                        {
                            table: {
                                widths: ['auto'],
                                body: [[{
                                    text: getStatusLabel(order.status).toUpperCase(),
                                    fontSize: 8.2,
                                    bold: true,
                                    color: getStatusColor(order.status),
                                    fillColor: '#eff6ff',
                                    border: [false, false, false, false],
                                    margin: [10, 5, 10, 5],
                                    alignment: 'center',
                                }]],
                            },
                            layout: 'noBorders',
                            alignment: 'right',
                            margin: [0, 6, 0, 0],
                        },
                    ],
                },
            ],
            margin: [0, 0, 0, 16],
        },
        createSectionTitle('Dados do cliente'),
        {
            table: {
                widths: ['*', 120, 120],
                body: [
                    [
                        createInfoCell('Cliente', order.store?.company_name || 'N/A'),
                        createInfoCell('CNPJ', order.store?.cnpj || 'N/A'),
                        createInfoCell('Telefone', buildCustomerPhone(order)),
                    ],
                    [
                        createInfoCell('Endereco', buildCustomerAddress(order), { colSpan: 2 }),
                        {},
                        createInfoCell('Representante', buildRepresentative(order)),
                    ],
                ],
            },
            layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: () => 0,
                paddingRight: () => 0,
                paddingTop: () => 0,
                paddingBottom: () => 6,
            },
            margin: [0, 0, 0, 14],
        },
        createSectionTitle('Itens do pedido'),
        {
            table: {
                headerRows: 1,
                widths: ['*', 42, 70, 74],
                body: [
                    [
                        { text: 'PRODUTO / DESCRICAO', bold: true, fontSize: 8.2, color: '#64748b', fillColor: '#f8fafc', border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'], margin: [0, 6, 0, 6] },
                        { text: 'QTD', bold: true, fontSize: 8.2, alignment: 'center', color: '#64748b', fillColor: '#f8fafc', border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'], margin: [0, 6, 0, 6] },
                        { text: 'UNIT.', bold: true, fontSize: 8.2, alignment: 'right', color: '#64748b', fillColor: '#f8fafc', border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'], margin: [0, 6, 0, 6] },
                        { text: 'TOTAL', bold: true, fontSize: 8.2, alignment: 'right', color: '#64748b', fillColor: '#f8fafc', border: [false, false, false, true], borderColor: ['#ffffff', '#ffffff', '#ffffff', '#e2e8f0'], margin: [0, 6, 0, 6] },
                    ],
                    ...itemRows,
                ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 14],
        },
        {
            columns: [
                {
                    width: '*',
                    stack: [
                        createSectionTitle('Pagamento', { lineWidth: 320, marginBottom: 8 }),
                        {
                            table: {
                                widths: ['*'],
                                body: [[{
                                    stack: paymentBoxStack,
                                    fillColor: '#f8fafc',
                                    border: [false, false, false, false],
                                    margin: [12, 9, 12, 9],
                                }]],
                            },
                            layout: 'noBorders',
                            margin: [0, -2, 0, 0],
                        },
                        ...(order.notes
                            ? [
                                  createSectionTitle('Observacoes', { lineWidth: 320, marginBottom: 8 }),
                                  {
                                      table: {
                                          widths: ['*'],
                                          body: [[{
                                              text: order.notes,
                                              fontSize: 9,
                                              color: '#475569',
                                              lineHeight: 1.25,
                                              fillColor: '#f8fafc',
                                              border: [false, false, false, false],
                                              margin: [12, 9, 12, 9],
                                          }]],
                                      },
                                      layout: 'noBorders',
                                      margin: [0, -2, 0, 0],
                                  } as Content,
                              ]
                            : []),
                    ],
                },
                {
                    width: 162,
                    stack: [
                        createSectionTitle('Resumo financeiro', { lineWidth: 162, marginBottom: 8 }),
                        {
                            table: {
                                widths: ['*'],
                                body: [[{
                                    stack: [
                                        createSummaryRow('Subtotal', formatOrderCurrency(order.subtotal)),
                                        createSummaryRow('Desconto', `- ${formatOrderCurrency(order.discount_amount)}`, { accent: true }),
                                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 162, y2: 0, lineWidth: 1, lineColor: '#e2e8f0' }], margin: [0, 2, 0, 10] },
                                        createSummaryRow('Total do pedido', formatOrderCurrency(order.total), { highlight: true }),
                                    ],
                                    fillColor: '#f8fafc',
                                    border: [false, false, false, false],
                                    margin: [12, 11, 12, 11],
                                }]],
                            },
                            layout: 'noBorders',
                            margin: [0, -2, 0, 0],
                        },
                    ],
                },
            ],
            columnGap: 18,
            margin: [0, 2, 0, 0],
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

