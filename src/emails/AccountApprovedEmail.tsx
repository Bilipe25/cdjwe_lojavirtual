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
import {
    main, container, headerSection, logo, contentSection,
    ctaSection, buttonSuccess, hr, footer,
} from './styles'

interface AccountApprovedEmailProps {
    clientName: string
    systemName?: string
    appUrl?: string
}

export default function AccountApprovedEmail({
    clientName,
    systemName = 'CDJWE',
    appUrl = 'https://cdjwe-lojavirtual.vercel.app',
}: AccountApprovedEmailProps) {
    const headingStyle = { color: '#16a34a', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 16px' }
    const paragraphStyle = { color: '#555', fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }
    const highlightBox = { backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #bbf7d0', margin: '20px 0' }
    const highlightText = { color: '#166534', fontSize: '14px', fontWeight: '500' as const, margin: '0', textAlign: 'center' as const }

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
                        <Heading style={headingStyle}>✅ Conta Aprovada!</Heading>
                        <Text style={paragraphStyle}>
                            Olá <strong>{clientName}</strong>,
                        </Text>
                        <Text style={paragraphStyle}>
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
                            <Button style={buttonSuccess} href={`${appUrl}/catalog`}>
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
