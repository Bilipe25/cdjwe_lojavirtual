import {
    Body,
    Button,
    Column,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Row,
    Section,
    Text,
} from '@react-email/components'
import {
    main,
    container,
    headerSection,
    logo,
    contentSection,
    heading,
    paragraph,
    ctaSection,
    buttonPrimary,
    hr,
    footer,
    formatCurrency,
} from './styles'
import {
    buildOrderSnapshotSummary,
    getCustomerOrderDetailsUrl,
    getOrderItemCommunicationPricing,
} from '@/lib/orders/order-communication'

interface OrderItem {
    productName: string
    fabricName: string
    colorName: string
    quantity: number
    unitPrice: number
    subtotal: number
    productPrice?: number | null
    variationPrice?: number | null
    finalPrice?: number | null
}

interface OrderConfirmationEmailProps {
    orderId: string
    orderNumber: string
    clientName: string
    items: OrderItem[]
    subtotal: number
    discount: number
    total: number
    snapshotSummary?: string
    systemName?: string
    appUrl?: string
}

export default function OrderConfirmationEmail({
    orderId,
    orderNumber,
    clientName,
    items,
    subtotal,
    discount,
    total,
    snapshotSummary,
    systemName = 'CDJWE',
    appUrl = 'https://cdjwe-lojavirtual.vercel.app',
}: OrderConfirmationEmailProps) {
    const orderBadge = { backgroundColor: '#1e3a5f', borderRadius: '8px', padding: '12px', textAlign: 'center' as const, margin: '0 0 20px' }
    const orderBadgeText = { color: '#ffffff', fontSize: '16px', fontWeight: '700' as const, margin: '0' }
    const tableContainer = { margin: '0 0 20px' }
    const tableHeader = { backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px 6px 0 0' }
    const thProduct = { color: '#64748b', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const, width: '60%', padding: '8px' }
    const thQty = { color: '#64748b', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const, width: '15%', textAlign: 'center' as const, padding: '8px' }
    const thPrice = { color: '#64748b', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const, width: '25%', textAlign: 'right' as const, padding: '8px' }
    const tableRow = { borderBottom: '1px solid #f1f5f9' }
    const tableRowEven = { borderBottom: '1px solid #f1f5f9', backgroundColor: '#fafafa' }
    const tdProduct = { padding: '10px 8px', width: '60%' }
    const tdQty = { padding: '10px 8px', width: '15%', textAlign: 'center' as const }
    const tdPrice = { padding: '10px 8px', width: '25%', textAlign: 'right' as const }
    const productName = { color: '#1e293b', fontSize: '14px', fontWeight: '500' as const, margin: '0' }
    const productDetail = { color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }
    const pricingDetail = { color: '#64748b', fontSize: '11px', lineHeight: '18px', margin: '4px 0 0' }
    const qtyText = { color: '#1e293b', fontSize: '14px', margin: '0' }
    const priceText = { color: '#1e293b', fontSize: '14px', fontWeight: '500' as const, margin: '0' }
    const totalsSection = { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }
    const totalLabel = { color: '#64748b', fontSize: '14px', padding: '4px 0', width: '70%' }
    const totalValue = { color: '#1e293b', fontSize: '14px', textAlign: 'right' as const, padding: '4px 0', width: '30%' }
    const discountLabel = { color: '#16a34a', fontSize: '14px', padding: '4px 0', width: '70%' }
    const discountValue = { color: '#16a34a', fontSize: '14px', textAlign: 'right' as const, padding: '4px 0', width: '30%' }
    const hrThin = { borderColor: '#e2e8f0', margin: '8px 0' }
    const grandTotalLabel = { color: '#1e3a5f', fontSize: '16px', fontWeight: '700' as const, padding: '4px 0', width: '70%' }
    const grandTotalValue = { color: '#b8860b', fontSize: '18px', fontWeight: '700' as const, textAlign: 'right' as const, padding: '4px 0', width: '30%' }
    const statusNote = { color: '#555', fontSize: '14px', lineHeight: '22px', margin: '20px 0', textAlign: 'center' as const, backgroundColor: '#fffbeb', padding: '12px', borderRadius: '8px', border: '1px solid #fef3c7' }
    const snapshotNoteStyle = { color: '#334155', fontSize: '13px', lineHeight: '20px', margin: '18px 0 0', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }
    const resolvedSnapshotSummary = snapshotSummary || buildOrderSnapshotSummary(items)
    const orderUrl = getCustomerOrderDetailsUrl(appUrl, orderId)

    return (
        <Html>
            <Head />
            <Preview>Pedido #{orderNumber} confirmado - {systemName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>Pedido confirmado</Heading>
                        <Text style={paragraph}>
                            Ola <strong>{clientName}</strong>, seu pedido foi recebido com sucesso.
                        </Text>

                        <Section style={orderBadge}>
                            <Text style={orderBadgeText}>Pedido #{orderNumber}</Text>
                        </Section>

                        <Section style={tableContainer}>
                            <Row style={tableHeader}>
                                <Column style={thProduct}>Produto</Column>
                                <Column style={thQty}>Qtd</Column>
                                <Column style={thPrice}>Valor</Column>
                            </Row>
                            {items.map((item, index) => {
                                const pricing = getOrderItemCommunicationPricing(item)
                                const pricingParts = [
                                    pricing.appliedLabel,
                                    `Base R$ ${formatCurrency(pricing.basePrice)}`,
                                ]

                                if (pricing.variationPrice !== null) {
                                    pricingParts.push(`Cor R$ ${formatCurrency(pricing.variationPrice)}`)
                                }

                                if (pricing.hasFrozenSnapshot) {
                                    pricingParts.push(`Final R$ ${formatCurrency(pricing.finalPrice)}`)
                                }

                                return (
                                    <Row key={`${item.productName}-${index}`} style={index % 2 === 0 ? tableRowEven : tableRow}>
                                        <Column style={tdProduct}>
                                            <Text style={productName}>{item.productName}</Text>
                                            <Text style={productDetail}>{item.fabricName} - {item.colorName}</Text>
                                            <Text style={pricingDetail}>{pricingParts.join(' | ')}</Text>
                                        </Column>
                                        <Column style={tdQty}>
                                            <Text style={qtyText}>{item.quantity}</Text>
                                        </Column>
                                        <Column style={tdPrice}>
                                            <Text style={priceText}>R$ {formatCurrency(item.subtotal)}</Text>
                                        </Column>
                                    </Row>
                                )
                            })}
                        </Section>

                        <Section style={totalsSection}>
                            <Row>
                                <Column style={totalLabel}>Subtotal</Column>
                                <Column style={totalValue}>R$ {formatCurrency(subtotal)}</Column>
                            </Row>
                            {discount > 0 && (
                                <Row>
                                    <Column style={discountLabel}>Desconto</Column>
                                    <Column style={discountValue}>-R$ {formatCurrency(discount)}</Column>
                                </Row>
                            )}
                            <Hr style={hrThin} />
                            <Row>
                                <Column style={grandTotalLabel}>Total</Column>
                                <Column style={grandTotalValue}>R$ {formatCurrency(total)}</Column>
                            </Row>
                        </Section>

                        <Text style={snapshotNoteStyle}>{resolvedSnapshotSummary}</Text>

                        <Text style={statusNote}>
                            Seu pedido esta em <strong>analise</strong>. Voce recebera atualizacoes por email quando houver mudancas.
                        </Text>

                        <Section style={ctaSection}>
                            <Button style={buttonPrimary} href={orderUrl}>
                                Acompanhar seu pedido
                            </Button>
                        </Section>
                    </Section>

                    <Hr style={hr} />
                    <Text style={footer}>
                        Este e um email automatico do sistema {systemName}. Nao responda a este email.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}
