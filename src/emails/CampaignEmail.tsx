import {
    Html, Head, Preview, Body, Container, Section, Text, Button, Img, Hr,
} from '@react-email/components'
import * as React from 'react'
import * as styles from './styles'

interface CampaignEmailProps {
    systemName: string
    title: string
    message: string
    imageUrl?: string | null
    buttonText?: string
    buttonUrl?: string
    unsubscribeUrl?: string
}

export default function CampaignEmail({
    systemName = 'CDJWE Estofados',
    title = 'Nova Promoção',
    message = '',
    imageUrl = null,
    buttonText = 'Ver Mais',
    buttonUrl = '',
    unsubscribeUrl = '',
}: CampaignEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>{title}</Preview>
            <Body style={styles.main}>
                <Container style={styles.container}>
                    <Section style={styles.headerSection}>
                        <Text style={styles.logo}>{systemName}</Text>
                    </Section>
                    <Section style={styles.contentSection}>
                        <Text style={styles.heading}>{title}</Text>

                        {imageUrl && (
                            <Img
                                src={imageUrl}
                                alt={title}
                                width="100%"
                                style={{ borderRadius: '8px', marginBottom: '16px', maxHeight: '300px', objectFit: 'cover' }}
                            />
                        )}

                        <Text style={styles.paragraph}>{message}</Text>

                        {buttonText && buttonUrl && (
                            <Section style={styles.ctaSection}>
                                <Button style={styles.buttonPrimary} href={buttonUrl}>
                                    {buttonText}
                                </Button>
                            </Section>
                        )}

                        <Hr style={styles.hr} />
                        <Text style={styles.footer}>
                            © {new Date().getFullYear()} {systemName}. Todos os direitos reservados.
                        </Text>
                        {unsubscribeUrl && (
                            <Text style={{ ...styles.footer, fontSize: '10px', marginTop: '8px' }}>
                                <a href={unsubscribeUrl} style={{ color: '#8898aa' }}>
                                    Cancelar inscrição
                                </a>
                            </Text>
                        )}
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}
