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
    heading, paragraph, ctaSection, buttonPrimary, hr, footer,
} from './styles'

const statusConfig: Record<string, { label: string; emoji: string; color: string; bgColor: string; message: string }> = {
    pending: { label: 'Em Análise', emoji: '⏳', color: '#d97706', bgColor: '#fffbeb', message: 'Seu pedido está sendo analisado pela nossa equipe.' },
    approved: { label: 'Aprovado', emoji: '✅', color: '#16a34a', bgColor: '#f0fdf4', message: 'Seu pedido foi aprovado e será encaminhado para produção em breve.' },
    in_production: { label: 'Em Produção', emoji: '🏭', color: '#2563eb', bgColor: '#eff6ff', message: 'Seu pedido está sendo fabricado com todo o cuidado que você merece.' },
    shipped: { label: 'Enviado', emoji: '🚚', color: '#7c3aed', bgColor: '#f5f3ff', message: 'Seu pedido foi despachado e está a caminho! Em breve você receberá sua encomenda.' },
    delivered: { label: 'Entregue', emoji: '📦', color: '#059669', bgColor: '#ecfdf5', message: 'Seu pedido foi entregue com sucesso! Esperamos que esteja satisfeito.' },
    cancelled: { label: 'Cancelado', emoji: '❌', color: '#dc2626', bgColor: '#fef2f2', message: 'Infelizmente, seu pedido foi cancelado. Entre em contato conosco para mais informações.' },
}

interface OrderStatusEmailProps {
    orderNumber: string
    clientName: string
    newStatus: string
    systemName?: string
    appUrl?: string
}

export default function OrderStatusEmail({
    orderNumber,
    clientName,
    newStatus,
    systemName = 'CDJWE',
    appUrl = 'http://localhost:3000',
}: OrderStatusEmailProps) {
    const config = statusConfig[newStatus] || statusConfig.pending

    // Template-specific styles
    const statusBadge = { borderRadius: '12px', padding: '24px', textAlign: 'center' as const, margin: '0 0 20px', border: '2px solid' }
    const statusEmoji = { fontSize: '36px', margin: '0 0 8px' }
    const statusLabel = { fontSize: '20px', fontWeight: '700' as const, margin: '0 0 4px' }
    const statusOrderNumber = { color: '#64748b', fontSize: '14px', fontWeight: '500' as const, margin: '0' }
    const statusMessage = { color: '#555', fontSize: '15px', lineHeight: '24px', margin: '0 0 24px', textAlign: 'center' as const }

    return (
        <Html>
            <Head />
            <Preview>{config.emoji} Pedido #{orderNumber} — {config.label}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={headerSection}>
                        <Heading style={logo}>{systemName}</Heading>
                    </Section>

                    <Section style={contentSection}>
                        <Heading style={heading}>
                            Atualização do Pedido
                        </Heading>
                        <Text style={paragraph}>
                            Olá <strong>{clientName}</strong>,
                        </Text>

                        <Section style={{ ...statusBadge, backgroundColor: config.bgColor, borderColor: config.color }}>
                            <Text style={statusEmoji}>{config.emoji}</Text>
                            <Text style={{ ...statusLabel, color: config.color }}>{config.label}</Text>
                            <Text style={statusOrderNumber}>Pedido #{orderNumber}</Text>
                        </Section>

                        <Text style={statusMessage}>
                            {config.message}
                        </Text>

                        <Section style={ctaSection}>
                            <Button style={buttonPrimary} href={`${appUrl}/orders`}>
                                Ver Meus Pedidos
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
