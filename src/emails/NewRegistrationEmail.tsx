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
    heading, paragraph, infoCard, infoLabel, infoValue,
    ctaSection, buttonPrimary, hr, footer,
} from './styles'

interface NewRegistrationEmailProps {
    clientName: string
    clientEmail: string
    companyName: string
    cnpj: string
    systemName?: string
    appUrl?: string
}

export default function NewRegistrationEmail({
    clientName,
    clientEmail,
    companyName,
    cnpj,
    systemName = 'CDJWE',
    appUrl = 'http://localhost:3000',
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
                            <Button style={buttonPrimary} href={`${appUrl}/admin/customers`}>
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
