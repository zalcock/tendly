const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

async function main(){
  const envPath = path.resolve(process.cwd(), '.env.local')
  if(!fs.existsSync(envPath)){
    console.error('.env.local not found')
    process.exit(1)
  }
  const env = fs.readFileSync(envPath,'utf8').split(/\r?\n/).reduce((acc,line)=>{const [k,...rest]=line.split('='); if(!k) return acc; acc[k]=rest.join('='); return acc}, {})
  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
  const CRON_SECRET = env.CRON_SECRET || ''
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){ console.error('Missing Supabase config'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const userId = 'f023e195-66b6-473a-9058-0ad97921aad6'
  const companyId = '00000000-0000-0000-0000-000000000002'

  console.log('Upserting profile', userId)
  let { data, error } = await supabase.from('profiles').upsert([{ id: userId, name: 'Test User' }], { onConflict: 'id' })
  if(error){ console.error('Profile upsert error', error); }
  else { console.log('Profile upserted') }

  console.log('Upserting company for user', userId)
  const company = {
    id: companyId,
    owner_id: userId,
    name: 'Acme Co',
    naics_codes: ['238220'],
    socio_economic_certs: ['WOSB'],
    target_geographies: ['Texas'],
    capability_keywords: ['hvac','maintenance']
  }
  ;({ data, error } = await supabase.from('companies').upsert([company], { onConflict: 'id' }))
  if(error){ console.error('Company upsert error', error); }
  else { console.log('Company upserted') }

  console.log('Triggering ingestion (mock=true)')
  try{
    const resp = await (await fetch('http://localhost:3000/api/ingest/sam?mock=true', { headers: { Authorization: `Bearer ${CRON_SECRET}` } })).json()
    console.log('Ingestion response', resp)
  }catch(e){ console.error('Ingestion call failed', e) }

  // wait
  await new Promise(r=>setTimeout(r,1500))

  console.log('Querying match_scores')
  ;({ data, error } = await supabase.from('match_scores').select('company_id, opportunity_id, score, reasons_json').order('score',{ascending:false}).limit(10))
  if(error){ console.error('match_scores query error', error) }
  else { console.log('match_scores:', JSON.stringify(data, null, 2)) }
}

main().catch(e=>{ console.error(e); process.exit(1) })
