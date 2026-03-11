import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Button,
    Hr,
} from '@react-email/components'

interface NewOrderEmailProps {
    orderNumber: string
    clientName: string
    companyName: string
    itemCount: number
    total: number
    systemName?: string
}

export default function NewOrderEmail({
    orderNumber,
    clientName,
    companyName,
    itemCount,
    total,
    systemName = 'CDJWE',
}: NewOrderEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>Novo pedido #{orderNumber} — {companyName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>🛒 Novo Pedido Recebido</Heading>
                        <Text style={paragraph}>
                            Um novo pedido foi submetido e aguarda análise.
                        </Text>

                        <Section style={infoCard}>
                            <Text style={infoLabel}>Pedido</Text>
                            <Text style={infoValueLarge}>#{orderNumber}</Text>

                            <Text style={infoLabel}>Cliente</Text>
                            <Text style={infoValue}>{clientName}</Text>

                            <Text style={infoLabel}>Empresa</Text>
                            <Text style={infoValue}>{companyName}</Text>

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
                                    <span style={statValueHighlight}>
                                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </Text>
                            </Section>
                        </Section>

                        <Section style={ctaSection}>
                            <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/orders`}>
                                Ver Pedido no Painel
                            </Button>
                        </Section>
                    </Section>

                    <Hr style={hr} />
                    <Text style={footer}>
                        Este é um email automático do sistema {systemName}.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { margin: '0 auto', padding: '20px 0', maxWidth: '580px' }
const headerSection = { backgroundColor: '#1e3a5f', padding: '24px 32px', borderRadius: '12px 12px 0 0' }
const logo = { color: '#ffffff', fontSize: '22px', fontWeight: '700' as const, margin: '0', textAlign: 'center' as const }
const contentSection = { backgroundColor: '#ffffff', padding: '32px', borderRadius: '0 0 12px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
const heading = { color: '#1e3a5f', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 12px' }
const paragraph = { color: '#555', fontSize: '15px', lineHeight: '24px', margin: '0 0 20px' }
const infoCard = { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '20px', border: '1px solid #e2e8f0' }
const infoLabel = { color: '#94a3b8', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '12px 0 2px' }
const infoValue = { color: '#1e293b', fontSize: '15px', fontWeight: '500' as const, margin: '0 0 4px' }
const infoValueLarge = { color: '#1e3a5f', fontSize: '20px', fontWeight: '700' as const, margin: '0 0 4px' }
const hrInner = { borderColor: '#e2e8f0', margin: '16px 0' }
const statsRow = { display: 'flex' as const, justifyContent: 'space-around' as const, textAlign: 'center' as const }
const statItem = { margin: '0', display: 'inline-block', width: '50%', textAlign: 'center' as const }
const statLabel = { color: '#94a3b8', fontSize: '11px', fontWeight: '600' as const, textTransform: 'uppercase' as const }
const statValue = { color: '#1e293b', fontSize: '18px', fontWeight: '700' as const }
const statValueHighlight = { color: '#b8860b', fontSize: '18px', fontWeight: '700' as const }
const ctaSection = { textAlign: 'center' as const, marginTop: '24px' }
const button = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e6ebf1', margin: '20px 0' }
const footer = { color: '#8898aa', fontSize: '12px', textAlign: 'center' as const }
