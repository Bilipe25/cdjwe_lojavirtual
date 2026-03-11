import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

interface SendEmailOptions {
    to: string | string[]
    subject: string
    react: React.ReactElement
}

export async function sendEmail({ to, subject, react }: SendEmailOptions) {
    if (!resend) {
        console.warn('[EMAIL] RESEND_API_KEY não configurada. Email não enviado:', subject)
        return { success: false, error: 'API key não configurada' }
    }

    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: Array.isArray(to) ? to : [to],
            subject,
            react,
        })

        if (error) {
            console.error('[EMAIL] Erro ao enviar:', error)
            return { success: false, error: error.message }
        }

        console.log('[EMAIL] Enviado com sucesso:', data?.id)
        return { success: true, id: data?.id }
    } catch (err: any) {
        console.error('[EMAIL] Exceção:', err)
        return { success: false, error: err.message }
    }
}
