const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const [k, ...rest] = line.split('=')
  if (!k) return acc
  acc[k] = rest.join('=').trim()
  return acc
}, {})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase URL or service role key in .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const profileId = '00000000-0000-0000-0000-000000000001'
  const companyId = '00000000-0000-0000-0000-000000000002'

  console.log('Inserting test profile...')
  let { data, error } = await supabase
    .from('profiles')
    .upsert([{ id: profileId, name: 'Test User' }], { onConflict: 'id' })

  if (error) console.error('Profile upsert error', error)
  else console.log('Profile upserted')

  console.log('Inserting test company...')
  const company = {
    id: companyId,
    owner_id: profileId,
    name: 'Acme Co',
    naics_codes: ['238220'],
    socio_economic_certs: ['WOSB'],
    target_geographies: ['Texas'],
    capability_keywords: ['hvac','maintenance']
  }

  ;({ data, error } = await supabase
    .from('companies')
    .upsert([company], { onConflict: 'id' }))

  if (error) console.error('Company upsert error', error)
  else console.log('Company upserted')

  // Give DB a moment
  await new Promise(r => setTimeout(r, 1000))

  // Call ingestion endpoint to trigger matching
  console.log('Triggering ingestion (mock=true)...')
  try {
    const resp = await (await fetch('http://localhost:3000/api/ingest/sam?mock=true', {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` }
    })).json()
    console.log('Ingestion response:', resp)
  } catch (e) {
    console.error('Ingestion call failed', e)
  }

  // Wait a bit for matching to complete
  await new Promise(r => setTimeout(r, 2000))

  console.log('Querying match_scores...')
  ;({ data, error } = await supabase
    .from('match_scores')
    .select('company_id, opportunity_id, score, reasons_json')
    .limit(10))

  if (error) console.error('match_scores query error', error)
  else console.log('match_scores:', data)
}

main().catch(e => { console.error(e); process.exit(1) })
