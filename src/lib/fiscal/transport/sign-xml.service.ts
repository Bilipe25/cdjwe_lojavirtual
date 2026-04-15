// ============================================================
// Fiscal Transport — XML Signing Service
// Signs NF-e XML with RSA-SHA1 using xml-crypto
// Extracts PFX from Supabase Storage, converts to PEM
// Vercel-compatible (pure JS, no native deps)
// ============================================================

import 'server-only'

import { SignedXml } from 'xml-crypto'
import forge from 'node-forge'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptCertificatePassword } from '../certificate-security'

interface CertificateData {
  privateKeyPem: string
  certificatePem: string
  certificateBase64: string // X509 DER base64 (without headers)
}

/**
 * Loads the PFX certificate from Supabase Storage,
 * decrypts the password, and extracts PEM key + cert.
 */
export async function loadCertificate(): Promise<CertificateData> {
  const supabase = createServiceRoleClient()

  // 1. Get certificate config
  const { data: certConfig, error: configError } = await supabase
    .from('company_certificate_config')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (configError || !certConfig) {
    throw new Error('Configuracao de certificado digital nao encontrada.')
  }

  if (certConfig.certificate_status !== 'active') {
    throw new Error(`Certificado digital com status "${certConfig.certificate_status}". Deve estar "active".`)
  }

  const storagePath = certConfig.certificate_storage_path
  if (!storagePath) {
    throw new Error('Caminho do certificado nao configurado (certificate_storage_path).')
  }

  // 2. Download PFX from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('certificates')
    .download(storagePath)

  if (downloadError || !fileData) {
    throw new Error(`Erro ao baixar certificado: ${downloadError?.message || 'Arquivo nao encontrado.'}`)
  }

  // 3. Decrypt password
  const encryptedPassword = certConfig.certificate_password_encrypted || certConfig.certificate_password_hash
  if (!encryptedPassword) {
    throw new Error('Senha do certificado nao encontrada.')
  }

  let password: string
  try {
    password = decryptCertificatePassword(encryptedPassword)
  } catch {
    throw new Error('Falha ao descriptografar a senha do certificado. Verifique FISCAL_CERTIFICATE_SECRET.')
  }

  // 4. Convert PFX → PEM using node-forge
  const pfxBuffer = await fileData.arrayBuffer()
  const pfxAsn1 = forge.asn1.fromDer(forge.util.createBuffer(new Uint8Array(pfxBuffer)))
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password)

  // Extract private key
  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]
  if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
    throw new Error('Chave privada nao encontrada no certificado PFX.')
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBag[0].key)

  // Extract certificate
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag })
  const certBag = certBags[forge.pki.oids.certBag]
  if (!certBag || certBag.length === 0 || !certBag[0].cert) {
    throw new Error('Certificado X509 nao encontrado no PFX.')
  }

  const cert = certBag[0].cert
  const certificatePem = forge.pki.certificateToPem(cert)

  // Extract base64 DER (for X509Certificate tag in signed XML)
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const certificateBase64 = forge.util.encode64(certDer)

  return { privateKeyPem, certificatePem, certificateBase64 }
}

/**
 * Signs the infNFe XML element using RSA-SHA1 (SEFAZ standard).
 *
 * The signature is enveloped inside the <NFe> element.
 *
 * @param nfeXml - The complete <NFe> XML string (with <infNFe> inside)
 * @param infNFeId - The Id attribute of infNFe (e.g., "NFe35260412345678000123550010000001231234567890")
 * @param certData - Certificate data (private key PEM + cert base64)
 * @returns Signed XML string
 */
export function signNFeXml(
  nfeXml: string,
  infNFeId: string,
  certData: CertificateData
): string {
  const certBase64 = certData.certificateBase64

  const sig = new SignedXml({
    privateKey: certData.privateKeyPem,
    publicCert: certData.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
  })

  // Reference to infNFe element by its Id
  sig.addReference({
    uri: `#${infNFeId}`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })

  sig.computeSignature(nfeXml, {
    prefix: '',
    location: {
      reference: `//*[local-name(.)='infNFe']`,
      action: 'after',
    },
  })

  return sig.getSignedXml()
}

/**
 * Signs an event XML (cancelamento, carta de correção).
 */
export function signEventXml(
  eventXml: string,
  eventId: string,
  certData: CertificateData
): string {
  const certBase64 = certData.certificateBase64

  const sig = new SignedXml({
    privateKey: certData.privateKeyPem,
    publicCert: certData.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
  })

  sig.addReference({
    uri: `#${eventId}`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })

  sig.computeSignature(eventXml, {
    prefix: '',
    location: {
      reference: `//*[local-name(.)='infEvento']`,
      action: 'after',
    },
  })

  return sig.getSignedXml()
}

export function signInutilizacaoXml(
  inutilizacaoXml: string,
  infInutId: string,
  certData: CertificateData
): string {
  const certBase64 = certData.certificateBase64

  const sig = new SignedXml({
    privateKey: certData.privateKeyPem,
    publicCert: certData.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
  })

  sig.addReference({
    uri: `#${infInutId}`,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })

  sig.computeSignature(inutilizacaoXml, {
    prefix: '',
    location: {
      reference: `//*[local-name(.)='infInut']`,
      action: 'after',
    },
  })

  return sig.getSignedXml()
}
