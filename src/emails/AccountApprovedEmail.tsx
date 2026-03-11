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

interface AccountApprovedEmailProps {
    clientName: string
    systemName?: string
}

export default function AccountApprovedEmail({
    clientName,
    systemName = 'CDJWE',
}: AccountApprovedEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>Sua conta foi aprovada — {systemName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>✅ Conta Aprovada!</Heading>
                        <Text style={paragraph}>
                            Olá <strong>{clientName}</strong>,
                        </Text>
                        <Text style={paragraph}>
                            Temos o prazer de informar que sua conta foi aprovada com sucesso!
                            Agora você tem acesso completo ao nosso catálogo de produtos e pode
                            começar a fazer seus pedidos.
                        </Text>

                        <Section style={highlightBox}>
                            <Text style={highlightText}>
                                🎉 Explore nosso catálogo e encontre os melhores produtos para sua loja!
                            </Text>
                        </Section>

                        <Section style={ctaSection}>
                            <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/catalog`}>
                                Acessar o Catálogo
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

const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { margin: '0 auto', padding: '20px 0', maxWidth: '580px' }
const headerSection = { backgroundColor: '#1e3a5f', padding: '24px 32px', borderRadius: '12px 12px 0 0' }
const logo = { color: '#ffffff', fontSize: '22px', fontWeight: '700' as const, margin: '0', textAlign: 'center' as const }
const contentSection = { backgroundColor: '#ffffff', padding: '32px', borderRadius: '0 0 12px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
const heading = { color: '#16a34a', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 16px' }
const paragraph = { color: '#555', fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }
const highlightBox = { backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #bbf7d0', margin: '20px 0' }
const highlightText = { color: '#166534', fontSize: '14px', fontWeight: '500' as const, margin: '0', textAlign: 'center' as const }
const ctaSection = { textAlign: 'center' as const, marginTop: '24px' }
const button = { backgroundColor: '#16a34a', color: '#ffffff', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e6ebf1', margin: '20px 0' }
const footer = { color: '#8898aa', fontSize: '12px', textAlign: 'center' as const }
