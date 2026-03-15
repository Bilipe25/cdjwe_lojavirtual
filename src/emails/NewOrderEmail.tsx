import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
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
    infoCard,
    infoLabel,
    infoValue,
    ctaSection,
    buttonPrimary,
    hr,
    footer,
    formatCurrency,
} from './styles'
import { getAdminOrdersUrl } from '@/lib/orders/order-communication'

interface NewOrderEmailProps {
    orderId: string
    orderNumber: string
    clientName: string
    companyName: string
    itemCount: number
    total: number
    pricingSummary?: string
    systemName?: string
    appUrl?: string
}

export default function NewOrderEmail({
    orderId,
    orderNumber,
    clientName,
    companyName,
    itemCount,
    total,
    pricingSummary,
    systemName = 'CDJWE',
    appUrl = 'https://cdjwe-lojavirtual.vercel.app',
}: NewOrderEmailProps) {
    const infoValueLarge = { color: '#1e3a5f', fontSize: '20px', fontWeight: '700' as const, margin: '0 0 4px' }
    const hrInner = { borderColor: '#e2e8f0', margin: '16px 0' }
    const statsRow = { display: 'flex' as const, justifyContent: 'space-around' as const, textAlign: 'center' as const }
    const statItem = { margin: '0', display: 'inline-block', width: '50%', textAlign: 'center' as const }
    const statLabel = { color: '#94a3b8', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const }
    const statValue = { color: '#1e293b', fontSize: '18px', fontWeight: '700' as const }
    const statValueHighlight = { color: '#b8860b', fontSize: '18px', fontWeight: '700' as const }
    const snapshotBox = { marginTop: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '12px' }
    const snapshotTitle = { color: '#1e293b', fontSize: '12px', fontWeight: '700' as const, textTransform: 'uppercase' as const, margin: '0 0 6px' }
    const snapshotText = { color: '#475569', fontSize: '13px', lineHeight: '20px', margin: '0' }
    const adminUrl = getAdminOrdersUrl(appUrl)

    return (
        <Html>
            <Head />
            <Preview>Novo pedido #{orderNumber} - {companyName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>Novo pedido recebido</Heading>
                        <Text style={paragraph}>
                            Um novo pedido foi submetido e aguarda analise comercial.
                        </Text>

                        <Section style={infoCard}>
                            <Text style={infoLabel}>Pedido</Text>
                            <Text style={infoValueLarge}>#{orderNumber}</Text>

                            <Text style={infoLabel}>Cliente</Text>
                            <Text style={infoValue}>{clientName}</Text>

                            <Text style={infoLabel}>Empresa</Text>
                            <Text style={infoValue}>{companyName}</Text>

                            <Text style={infoLabel}>Referencia interna</Text>
                            <Text style={infoValue}>{orderId}</Text>

                            <Hr style={hrInner} />

                            <Section style={statsRow}>
                                <Text style={statItem}>
                                    <span style={statLabel}>Itens</span>
                                    <br />
                                    <span style={statValue}>{itemCount}</span>
                                </Text>
                                <Text style={statItem}>
                                    <span style={statLabel}>Total</span>
                                    <br />
                                    <span style={statValueHighlight}>R$ {formatCurrency(total)}</span>
                                </Text>
                            </Section>

                            {pricingSummary && (
                                <Section style={snapshotBox}>
                                    <Text style={snapshotTitle}>Snapshot financeiro</Text>
                                    <Text style={snapshotText}>{pricingSummary}</Text>
                                </Section>
                            )}
                        </Section>

                        <Section style={ctaSection}>
                            <Button style={buttonPrimary} href={adminUrl}>
                                Abrir painel de pedidos
                            </Button>
                        </Section>
                    </Section>

                    <Hr style={hr} />
                    <Text style={footer}>
                        Este e um email automatico do sistema {systemName}.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}
