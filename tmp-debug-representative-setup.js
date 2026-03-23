const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envPath = path.join(process.cwd(), '.env.local')
const envText = fs.readFileSync(envPath, 'utf8')
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue
  const idx = line.indexOf('=')
  if (idx < 0) continue
  const k = line.slice(0, idx).trim()
  const v = line.slice(idx + 1).trim()
  if (!process.env[k]) process.env[k] = v
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('missing env', { hasUrl: !!url, hasKey: !!key })
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function run() {
  const repRes = await supabase.from('profiles').select('id,full_name,role').eq('role','representative').limit(1)
  if (repRes.error) {
    console.error('rep error', repRes.error)
    process.exit(1)
  }
  const rep = repRes.data?.[0]
  if (!rep) {
    console.log('no representative found')
    return
  }
  console.log('representative', rep)

  const q1 = await supabase
    .from('representative_customer_access_rules')
    .select(`
      store_id,
      decision,
      reason,
      created_at,
      updated_at,
      store:stores!representative_customer_access_rules_store_id_fkey(
        id,
        company_name,
        trade_name,
        customer_code,
        city,
        state,
        representative_id
      )
    `)
    .eq('representative_id', rep.id)
    .order('updated_at', { ascending: false })
  console.log('rules err', q1.error)

  const q2 = await supabase
    .from('representative_customer_access_audit_logs')
    .select(`
      id,
      event_type,
      entity_type,
      store_id,
      before_state,
      after_state,
      notes,
      created_at,
      changed_by_profile:profiles!representative_customer_access_audit_logs_changed_by_profile_id_fkey(
        id,
        full_name,
        email
      ),
      store:stores!representative_customer_access_audit_logs_store_id_fkey(
        id,
        company_name,
        trade_name,
        customer_code
      )
    `)
    .eq('representative_id', rep.id)
    .order('created_at', { ascending: false })
    .limit(20)
  console.log('audit err', q2.error)

  const q3 = await supabase
    .from('stores')
    .select(`
      id,
      company_name,
      trade_name,
      customer_code,
      city,
      state,
      representative_id,
      representative:profiles!stores_representative_id_fkey(id, full_name)
    `)
    .eq('is_active', true)
    .is('representative_id', null)
    .limit(5)
  console.log('candidate err', q3.error)
}

run().catch((e)=>{console.error(e);process.exit(1)})
