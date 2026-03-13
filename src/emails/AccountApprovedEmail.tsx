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
    clientEmail?: string 
    password?: string
    systemName?: string
    appUrl?: string
}

export default function AccountApprovedEmail({
    clientName,
    clientEmail,
    password,
    systemName = 'CDJWE',
    appUrl = 'https://cdjwe-lojavirtual.vercel.app',
}: AccountApprovedEmailProps) {
    const headingStyle = { color: '#16a34a', fontSize: '22px', fontWeight: '700' as const, margin: '0 0 16px' }
    const paragraphStyle = { color: '#555', fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' }
    const highlightBox = { backgroundColor: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', margin: '20px 0' }
    const credsBox = { backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px', border: '1px solid #bbf7d0', margin: '20px 0' }
    const highlightText = { color: '#0f172a', fontSize: '14px', fontWeight: '500' as const, margin: '0' }

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
                            Temos o prazer de informar que sua conta corporativa foi ativada com sucesso!
                            Agora você tem acesso completo ao nosso catálogo B2B.
                        </Text>

                        <Section style={highlightBox}>
                            <Text style={{ ...highlightText, marginBottom: '8px', fontWeight: '600' }}>Como acessar sua conta:</Text>
                            <Text style={{ ...paragraphStyle, fontSize: '14px', margin: '0 0 8px 0' }}>
                                Para sua conveniência, você pode realizar o login utilizando qualquer um dos seguintes dados:
                            </Text>
                            <ul style={{ color: '#555', fontSize: '14px', margin: '0 0 0 20px', padding: '0' }}>
                                <li><strong>E-mail</strong> {clientEmail ? `(${clientEmail})` : ''}</li>
                                <li><strong>CNPJ</strong></li>
                                <li><strong>Razão Social</strong></li>
                            </ul>
                        </Section>

                        {password && (
                            <Section style={credsBox}>
                                <Text style={{ ...highlightText, color: '#166534', marginBottom: '8px' }}>
                                    Foi gerada uma senha temporária em seu nome:
                                </Text>
                                <Text style={{ fontSize: '18px', fontWeight: '700', color: '#166534', margin: '0', letterSpacing: '2px', textAlign: 'center' }}>
                                    {password}
                                </Text>
                            </Section>
                        )}

                        <Section style={ctaSection}>
                            <Button style={buttonSuccess} href={`${appUrl}/login`}>
                                Acessar o Portal
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
