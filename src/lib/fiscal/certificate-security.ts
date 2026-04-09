'use server'

import 'server-only'

import crypto from 'node:crypto'

function getCertificateSecret(): string {
  const configured =
    process.env.FISCAL_CERTIFICATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''

  if (!configured.trim()) {
    throw new Error('Segredo de certificado não configurado. Defina FISCAL_CERTIFICATE_SECRET no ambiente.')
  }

  return configured
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptCertificatePassword(password: string): string {
  const key = deriveKey(getCertificateSecret())
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    content: encrypted.toString('base64'),
  })
}

export function decryptCertificatePassword(payload: string): string {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; content: string }
  const key = deriveKey(getCertificateSecret())
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parsed.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.content, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function fingerprintFile(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) =>
    crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex')
  )
}
