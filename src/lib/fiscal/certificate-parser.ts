import 'server-only'

import forge from 'node-forge'

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

/**
 * Classifies the error thrown during PKCS#12 parsing and returns a
 * user-facing message in Portuguese.  The goal is to map *every* known
 * failure mode to an accurate description so the admin never sees a
 * misleading message (e.g. "missing private key" when the real problem
 * is a wrong password).
 */
function normalizeCertificateParserError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const msg = error.message

    // node-forge throws "PKCS#12 MAC could not be verified. Invalid password?"
    // or "Invalid password" when the passphrase is wrong.
    if (/invalid password|mac could not be verified|mac verify/i.test(msg)) {
      return 'Nao foi possivel abrir o certificado A1 com a senha informada. Verifique a senha e tente novamente.'
    }

    // node-forge throws "Cannot read PKCS#12 PFX" or ASN.1 parse errors
    // when the file is not a valid PKCS#12 container.
    if (
      /cannot read pkcs|too few bytes|invalid asn|unexpected asn|invalid der|premature end/i.test(msg)
    ) {
      return 'O arquivo enviado nao e um certificado PKCS#12 valido. Verifique se o arquivo .pfx ou .p12 esta integro.'
    }

    // Unsupported / legacy algorithm the JS implementation cannot handle.
    if (/unsupported|not supported|unknown oid|unknown algorithm/i.test(msg)) {
      return 'O arquivo A1 utiliza um algoritmo de criptografia nao suportado. Tente reexportar o certificado com algoritmo moderno (AES/SHA-256).'
    }

    // Explicit private key messages (from our own throw below, or pass-through).
    if (/private key|chave privada/i.test(msg)) {
      return 'O arquivo informado nao contem a chave privada necessaria para o certificado A1. Reexporte o certificado incluindo a chave privada.'
    }

    return msg
  }

  return 'Falha ao validar o certificado A1.'
}

/**
 * Formats a forge certificate attribute map (subject / issuer) into the
 * classic X.509 one-line string representation:
 *   CN = Foo, O = Bar, C = BR
 */
function formatDN(attrs: forge.pki.CertificateField[]): string {
  return attrs
    .map((attr) => {
      const name = attr.shortName || attr.name || attr.type || '?'
      return `${name} = ${attr.value}`
    })
    .join(', ')
}

/**
 * Computes the SHA-1 thumbprint of a certificate – the same value
 * Windows shows in the certificate details dialog.
 */
function computeThumbprint(cert: forge.pki.Certificate): string {
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const md = forge.md.sha1.create()
  md.update(derBytes)
  return md.digest().toHex().toUpperCase()
}

/**
 * Parses a PKCS#12 (.pfx / .p12) buffer entirely in JavaScript using
 * `node-forge`.  This implementation does **not** depend on any
 * operating-system binary (openssl, powershell, certutil, etc.) and
 * therefore works reliably in every environment – local dev (Windows /
 * macOS / Linux) and serverless production (Vercel, AWS Lambda, etc.).
 *
 * Returns the same `ParsedA1CertificateMetadata` interface consumed by
 * the rest of the fiscal certificate pipeline.
 */
export async function parseA1CertificateFromBuffer(
  fileBuffer: Buffer,
  password: string,
  _fileName = 'certificado.pfx'
): Promise<ParsedA1CertificateMetadata> {
  if (!password.trim()) {
    throw new Error('Informe a senha do certificado para validar o arquivo A1.')
  }

  try {
    // node-forge expects a binary string, not a Node.js Buffer.
    const binaryString = fileBuffer.toString('binary')

    // Decode the ASN.1 structure first, then open the PKCS#12 bag.
    const asn1 = forge.asn1.fromDer(binaryString)
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)

    // ── Extract certificates ──────────────────────────────────────────
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBagList = certBags[forge.pki.oids.certBag] || []

    if (certBagList.length === 0) {
      throw new Error('Nenhum certificado utilizavel foi encontrado no arquivo A1.')
    }

    // Pick the leaf certificate (the one with the latest expiry).
    const certs = certBagList
      .filter((bag) => bag.cert !== undefined && bag.cert !== null)
      .map((bag) => bag.cert as forge.pki.Certificate)

    if (certs.length === 0) {
      throw new Error('Nao foi possivel extrair o certificado publico do arquivo A1.')
    }

    const cert = certs.length === 1
      ? certs[0]
      : certs.sort(
          (a, b) => b.validity.notAfter.getTime() - a.validity.notAfter.getTime()
        )[0]

    // ── Extract private key ───────────────────────────────────────────
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
    const keyBagList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || []

    // Also check for unencrypted key bags as a fallback.
    const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag })
    const keyBagList2 = keyBags2[forge.pki.oids.keyBag] || []

    const allKeys = [...keyBagList, ...keyBagList2]
    const hasPrivateKey = allKeys.some((bag) => bag.key !== undefined && bag.key !== null)

    if (!hasPrivateKey) {
      throw new Error(
        'O arquivo informado nao contem a chave privada necessaria para o certificado A1. Reexporte o certificado incluindo a chave privada.'
      )
    }

    // ── Build metadata ────────────────────────────────────────────────
    const subject = formatDN(cert.subject.attributes)
    const issuer = formatDN(cert.issuer.attributes)

    const cnAttr = cert.subject.getField('CN')
    const subjectCommonName = cnAttr ? String(cnAttr.value) : null

    const serialNumber = cert.serialNumber.toUpperCase()
    const thumbprint = computeThumbprint(cert)

    const validFrom = cert.validity.notBefore.toISOString()
    const validTo = cert.validity.notAfter.toISOString()

    // ── Validate essential fields ─────────────────────────────────────
    if (!serialNumber || !issuer || !validFrom || !validTo) {
      throw new Error('Os metadados principais do certificado nao puderam ser extraidos.')
    }

    return {
      subject,
      subjectCommonName,
      issuer,
      serialNumber,
      thumbprint,
      validFrom,
      validTo,
      hasPrivateKey: true,
    }
  } catch (error) {
    throw new Error(normalizeCertificateParserError(error))
  }
}
