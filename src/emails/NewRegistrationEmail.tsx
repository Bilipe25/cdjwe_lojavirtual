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

interface NewRegistrationEmailProps {
    clientName: string
    clientEmail: string
    companyName: string
    cnpj: string
    systemName?: string
}

export default function NewRegistrationEmail({
    clientName,
    clientEmail,
    companyName,
    cnpj,
    systemName = 'CDJWE',
}: NewRegistrationEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>Novo cadastro de cliente: {clientName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>📋 Novo Cadastro Recebido</Heading>
                        <Text style={paragraph}>
                            Um novo cliente se registrou no sistema e aguarda aprovação.
                        </Text>

                        <Section style={infoCard}>
                            <Text style={infoLabel}>Nome</Text>
                            <Text style={infoValue}>{clientName}</Text>

                            <Text style={infoLabel}>Email</Text>
                            <Text style={infoValue}>{clientEmail}</Text>

                            <Text style={infoLabel}>Empresa</Text>
                            <Text style={infoValue}>{companyName}</Text>

                            <Text style={infoLabel}>CNPJ</Text>
                            <Text style={infoValue}>{cnpj}</Text>
                        </Section>

                        <Section style={ctaSection}>
                            <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/customers`}>
                                Ver Cadastro no Painel
                            </Button>
                        </Section>
                    </Section>

                    <Hr style={hr} />
                    <Text style={footer}>
                        Este é um email automático do sistema {systemName}. Não responda a este email.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

// Styles
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
const ctaSection = { textAlign: 'center' as const, marginTop: '24px' }
const button = { backgroundColor: '#1e3a5f', color: '#ffffff', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e6ebf1', margin: '20px 0' }
const footer = { color: '#8898aa', fontSize: '12px', textAlign: 'center' as const }
