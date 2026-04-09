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
    if (/password|senha|network password/i.test(error.message)) {
      return 'Nao foi possivel abrir o certificado A1 com a senha informada.'
    }

    return error.message
  }

  return 'Falha ao validar o certificado A1.'
}

export async function parseA1CertificateFromBuffer(
  fileBuffer: Buffer,
  password: string,
  fileName = 'certificado.pfx'
): Promise<ParsedA1CertificateMetadata> {
  if (!password.trim()) {
    throw new Error('Informe a senha do certificado para validar o arquivo A1.')
  }

  if (process.platform !== 'win32') {
    throw new Error(
      'O parsing automatico do certificado A1 desta fase esta disponivel apenas em hosts Windows.'
    )
  }

  const extension = path.extname(fileName) || '.pfx'
  const tempPath = buildTempCertificatePath(extension)

  try {
    await fs.writeFile(tempPath, fileBuffer)

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
