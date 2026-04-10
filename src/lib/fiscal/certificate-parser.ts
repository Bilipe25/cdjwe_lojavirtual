'use server'

import 'server-only'

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ParsedA1CertificateMetadata {
  subject: string
  subjectCommonName: string | null
  issuer: string
  serialNumber: string
  thumbprint: string
  validFrom: string
  validTo: string
  hasPrivateKey: boolean
}

function buildTempCertificatePath(extension: string): string {
  const safeExtension = extension && extension.startsWith('.') ? extension : '.pfx'
  return path.join(
    os.tmpdir(),
    `cdjwe-cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExtension}`
  )
}

function normalizePowerShellError(error: unknown): string {
  if (error instanceof Error && error.message) {
    if (/spawn .*openssl.*enoent|not recognized as an internal or external command|command not found/i.test(error.message)) {
      return 'O host atual nao possui OpenSSL disponivel para validar o certificado A1 fora do ambiente Windows.'
    }

    if (/password|senha|network password|invalid password|mac verify error|pkcs12/i.test(error.message)) {
      return 'Nao foi possivel abrir o certificado A1 com a senha informada.'
    }

    if (/private key|chave privada/i.test(error.message)) {
      return 'O arquivo informado nao contem a chave privada necessaria para o certificado A1.'
    }

    return error.message
  }

  return 'Falha ao validar o certificado A1.'
}

function normalizeOpenSslDate(label: string, rawValue: string): string {
  const value = rawValue.replace(`${label}=`, '').trim()
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Nao foi possivel interpretar a validade do certificado A1.')
  }

  return parsed.toISOString()
}

function parseOpenSslLine(output: string, prefix: string): string {
  const line = output
    .split(/\r?\n/)
    .find((entry) => entry.trim().toLowerCase().startsWith(prefix.toLowerCase()))

  if (!line) {
    throw new Error(`Nao foi possivel localizar o campo ${prefix} na validacao do certificado A1.`)
  }

  return line.trim()
}

async function parseA1CertificateWithOpenSsl(
  tempPath: string,
  password: string
): Promise<ParsedA1CertificateMetadata> {
  const certPath = buildTempCertificatePath('.pem')
  const keyPath = buildTempCertificatePath('.key')

  try {
    const certExport = await execFileAsync(
      'openssl',
      ['pkcs12', '-in', tempPath, '-clcerts', '-nokeys', '-passin', `pass:${password}`, '-out', certPath],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )

    if (certExport.stderr?.trim()) {
      throw new Error(certExport.stderr.trim())
    }

    const keyExport = await execFileAsync(
      'openssl',
      ['pkcs12', '-in', tempPath, '-nocerts', '-nodes', '-passin', `pass:${password}`, '-out', keyPath],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )

    if (!/BEGIN (?:ENCRYPTED )?(?:RSA |EC )?PRIVATE KEY/.test(keyExport.stdout)) {
      throw new Error('private key missing')
    }

    const certInfo = await execFileAsync(
      'openssl',
      ['x509', '-in', certPath, '-noout', '-serial', '-issuer', '-subject', '-dates', '-fingerprint', '-sha1'],
      { windowsHide: true, maxBuffer: 1024 * 1024 }
    )

    const info = certInfo.stdout
    const subjectLine = parseOpenSslLine(info, 'subject=')
    const issuerLine = parseOpenSslLine(info, 'issuer=')
    const serialLine = parseOpenSslLine(info, 'serial=')
    const notBeforeLine = parseOpenSslLine(info, 'notBefore=')
    const notAfterLine = parseOpenSslLine(info, 'notAfter=')
    const fingerprintLine = parseOpenSslLine(info, 'sha1 fingerprint=')

    const subject = subjectLine.replace(/^subject=/i, '').trim()
    const cnMatch = subject.match(/CN\s*=\s*([^,\/]+)/i)

    return {
      subject,
      subjectCommonName: cnMatch ? cnMatch[1].trim() : null,
      issuer: issuerLine.replace(/^issuer=/i, '').trim(),
      serialNumber: serialLine.replace(/^serial=/i, '').trim(),
      thumbprint: fingerprintLine.replace(/^sha1 fingerprint=/i, '').replace(/:/g, '').trim(),
      validFrom: normalizeOpenSslDate('notBefore', notBeforeLine),
      validTo: normalizeOpenSslDate('notAfter', notAfterLine),
      hasPrivateKey: true,
    }
  } catch (error) {
    throw new Error(normalizePowerShellError(error))
  } finally {
    await fs.rm(certPath, { force: true }).catch(() => undefined)
    await fs.rm(keyPath, { force: true }).catch(() => undefined)
  }
}

export async function parseA1CertificateFromBuffer(
  fileBuffer: Buffer,
  password: string,
  fileName = 'certificado.pfx'
): Promise<ParsedA1CertificateMetadata> {
  if (!password.trim()) {
    throw new Error('Informe a senha do certificado para validar o arquivo A1.')
  }

  const extension = path.extname(fileName) || '.pfx'
  const tempPath = buildTempCertificatePath(extension)

  try {
    await fs.writeFile(tempPath, fileBuffer)

    if (process.platform !== 'win32') {
      return await parseA1CertificateWithOpenSsl(tempPath, password)
    }

    const script = `
$ErrorActionPreference = 'Stop'
$path = $env:CDJWE_CERT_PATH
$password = $env:CDJWE_CERT_PASSWORD
$bytes = [System.IO.File]::ReadAllBytes($path)
$collection = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet
$collection.Import($bytes, $password, $flags)
$cert = $collection | Sort-Object NotAfter -Descending | Select-Object -First 1
if ($null -eq $cert) {
  throw 'Nenhum certificado utilizavel foi encontrado no arquivo A1.'
}
$commonName = $cert.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
[pscustomobject]@{
  subject = $cert.Subject
  subjectCommonName = $(if ([string]::IsNullOrWhiteSpace($commonName)) { $null } else { $commonName })
  issuer = $cert.Issuer
  serialNumber = $cert.SerialNumber
  thumbprint = $cert.Thumbprint
  validFrom = $cert.NotBefore.ToUniversalTime().ToString('o')
  validTo = $cert.NotAfter.ToUniversalTime().ToString('o')
  hasPrivateKey = $cert.HasPrivateKey
} | ConvertTo-Json -Compress -Depth 3
`

    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        env: {
          ...process.env,
          CDJWE_CERT_PATH: tempPath,
          CDJWE_CERT_PASSWORD: password,
        },
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    )

    if (stderr?.trim()) {
      throw new Error(stderr.trim())
    }

    const parsed = JSON.parse(stdout.trim()) as ParsedA1CertificateMetadata

    if (!parsed.serialNumber || !parsed.issuer || !parsed.validFrom || !parsed.validTo) {
      throw new Error('Os metadados principais do certificado nao puderam ser extraidos.')
    }

    if (!parsed.hasPrivateKey) {
      throw new Error('O arquivo informado nao contem a chave privada necessaria para o certificado A1.')
    }

    return parsed
  } catch (error) {
    throw new Error(normalizePowerShellError(error))
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined)
  }
}
