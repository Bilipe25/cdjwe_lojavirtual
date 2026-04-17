import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

function redact(value) {
  if (!value) return value
  if (String(value).length <= 6) return value
  return `${String(value).slice(0, 3)}***${String(value).slice(-3)}`
}

function pickRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows
    .slice()
    .sort((a, b) => {
      const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime()
      const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime()
      return bUpdated - aUpdated
    })[0]
}

function extractBlock(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match?.[0] ?? null
}

function extractTagFromBlock(block, tagName) {
  if (!block) return null
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match?.[1] ?? null
}

async function main() {
  const orderId = process.argv[2]
  if (!orderId) {
    console.error('Uso: node scripts/debug-fiscal-emission.mjs <order-id>')
    process.exit(1)
  }

  const envPath = path.resolve(process.cwd(), '.env.local')
  const env = loadEnvFile(envPath)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const orderResult = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (orderResult.error || !orderResult.data) {
    throw orderResult.error || new Error('Pedido nao encontrado')
  }

  const storeId = orderResult.data.store_id

  const [profilesResult, environmentResult, settingsResult, docsResult, eventsResult, storeResult, storeFiscalResult] = await Promise.all([
    supabase
      .from('company_fiscal_profile')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('company_fiscal_environment')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('system_settings')
      .select('*')
      .order('created_at', { ascending: true }),
    supabase
      .from('fiscal_documents')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    supabase
      .from('fiscal_events_log')
      .select('*')
      .eq('order_id', orderId)
      .order('executed_at', { ascending: false })
      .limit(5),
    supabase
      .from('stores')
      .select('*, store_addresses(*)')
      .eq('id', storeId)
      .maybeSingle(),
    supabase
      .from('store_fiscal_data')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle(),
  ])

  if (profilesResult.error) throw profilesResult.error
  if (environmentResult.error) throw environmentResult.error
  if (settingsResult.error) throw settingsResult.error
  if (docsResult.error) throw docsResult.error
  if (eventsResult.error) throw eventsResult.error
  if (storeResult.error) throw storeResult.error
  if (storeFiscalResult.error) throw storeFiscalResult.error

  const profiles = profilesResult.data || []
  const environments = environmentResult.data || []
  const settingsRows = settingsResult.data || []
  const docs = docsResult.data || []
  const events = eventsResult.data || []
  const store = storeResult.data || null
  const storeFiscalData = storeFiscalResult.data || null

  const latestProfile = pickRow(profiles)
  const latestEnvironment = pickRow(environments)
  const latestSettings = pickRow(settingsRows)
  const latestDoc = docs[0] || null
  const storeAddresses = Array.isArray(store?.store_addresses) ? store.store_addresses : []
  const fiscalAddress = storeFiscalData?.fiscal_address_id
    ? storeAddresses.find((address) => address.id === storeFiscalData.fiscal_address_id) || null
    : null
  const mainAddress = storeAddresses.find((address) => address.is_main === true) || storeAddresses[0] || null
  const resolvedStoreAddress = fiscalAddress || mainAddress

  const report = {
    orderId,
    storeId,
    profileCount: profiles.length,
    environmentCount: environments.length,
    settingsCount: settingsRows.length,
    latestProfile: latestProfile
      ? {
          id: latestProfile.id,
          created_at: latestProfile.created_at,
          updated_at: latestProfile.updated_at,
          razao_social: latestProfile.razao_social,
          cnpj: redact(latestProfile.cnpj),
          fiscal_address: latestProfile.fiscal_address,
          fiscal_number: latestProfile.fiscal_number,
          fiscal_neighborhood: latestProfile.fiscal_neighborhood,
          fiscal_city: latestProfile.fiscal_city,
          fiscal_state: latestProfile.fiscal_state,
          fiscal_zip_code: latestProfile.fiscal_zip_code,
          fiscal_municipality_code_ibge: latestProfile.fiscal_municipality_code_ibge,
        }
      : null,
    latestEnvironment: latestEnvironment
      ? {
          id: latestEnvironment.id,
          created_at: latestEnvironment.created_at,
          updated_at: latestEnvironment.updated_at,
          ambiente: latestEnvironment.ambiente,
          serie_padrao_nfe: latestEnvironment.serie_padrao_nfe,
          proximo_numero_nfe: latestEnvironment.proximo_numero_nfe,
          tipo_emissao: latestEnvironment.tipo_emissao,
          emissao_ativa: latestEnvironment.emissao_ativa,
        }
      : null,
    latestSystemSettings: latestSettings
      ? {
          id: latestSettings.id,
          created_at: latestSettings.created_at,
          updated_at: latestSettings.updated_at,
          razao_social: latestSettings.razao_social,
          cnpj: redact(latestSettings.cnpj),
          address: latestSettings.address,
          city: latestSettings.city,
          state: latestSettings.state,
          zip_code: latestSettings.zip_code,
        }
      : null,
    latestFiscalDocument: latestDoc
      ? {
          id: latestDoc.id,
          created_at: latestDoc.created_at,
          document_status: latestDoc.document_status,
          numero_nf: latestDoc.numero_nf,
          serie: latestDoc.serie,
          codigo_status: latestDoc.codigo_status,
          motivo_status: latestDoc.motivo_status,
          xml_envio_path: latestDoc.xml_envio_path,
          xml_retorno_path: latestDoc.xml_retorno_path,
          xml_processado_path: latestDoc.xml_processado_path,
        }
      : null,
    order: {
      number: orderResult.data.order_number,
      store_id: orderResult.data.store_id,
      customer_id: orderResult.data.customer_id,
      shipping_address: orderResult.data.shipping_address,
    },
    store: store
      ? {
          id: store.id,
          name: store.name || store.company_name || store.store_name,
          state: store.state,
          city: store.city,
          zip_code: store.zip_code,
          document_type: store.document_type,
          document_number: redact(store.document_number || store.cnpj),
          state_registration: store.state_registration,
        }
      : null,
    storeFiscalData: storeFiscalData
      ? {
          id: storeFiscalData.id,
          fiscal_address_id: storeFiscalData.fiscal_address_id,
          document_type: storeFiscalData.document_type,
          document_number: redact(storeFiscalData.document_number),
          person_type: storeFiscalData.person_type,
          taxpayer_indicator: storeFiscalData.taxpayer_indicator,
          state_registration: storeFiscalData.state_registration,
          fiscal_email: storeFiscalData.fiscal_email,
        }
      : null,
    resolvedStoreAddress,
    allStoreAddresses: storeAddresses,
    recentEventMessages: events.map((event) => ({
      executed_at: event.executed_at,
      event_type: event.event_type,
      event_status: event.event_status,
      sefaz_status_code: event.sefaz_status_code,
      sefaz_message: event.sefaz_message,
      error_message: event.error_message,
    })),
  }

  console.log('=== FISCAL DEBUG REPORT ===')
  console.log(JSON.stringify(report, null, 2))

  if (!latestDoc?.xml_envio_path) {
    console.log('\nSem xml_envio_path na ultima tentativa.')
    return
  }

  const download = await supabase.storage.from('fiscal-xml').download(latestDoc.xml_envio_path)
  if (download.error || !download.data) {
    console.log('\nFalha ao baixar XML de envio:', download.error?.message || 'sem detalhes')
    return
  }

  const xml = Buffer.from(await download.data.arrayBuffer()).toString('utf8')
  const enderEmit = extractBlock(xml, 'enderEmit')
  const enderDest = extractBlock(xml, 'enderDest')
  const emitBlock = extractBlock(xml, 'emit')
  const impostoBlock = extractBlock(xml, 'imposto')
  const ipiBlock = extractBlock(xml, 'IPI')
  const pisBlock = extractBlock(xml, 'PIS')
  const cofinsBlock = extractBlock(xml, 'COFINS')

  console.log('\n=== XML CHECK ===')
  console.log(JSON.stringify({
    xLgr_emit: extractTagFromBlock(enderEmit, 'xLgr'),
    nro_emit: extractTagFromBlock(enderEmit, 'nro'),
    xBairro_emit: extractTagFromBlock(enderEmit, 'xBairro'),
    xMun_emit: extractTagFromBlock(enderEmit, 'xMun'),
    UF_emit: extractTagFromBlock(enderEmit, 'UF'),
    enderEmit,
    emitBlock,
    enderDest,
    impostoBlock,
    ipiBlock,
    pisBlock,
    cofinsBlock,
  }, null, 2))
}

main().catch((error) => {
  console.error('DEBUG FAILED')
  console.error(error)
  process.exit(1)
})
