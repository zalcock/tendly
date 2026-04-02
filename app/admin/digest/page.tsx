import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js'

const RunDigestButton = dynamic(() => import('../../../src/components/RunDigestButton'), { ssr: false })

export default async function Page() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: runs } = await supabase.from('digest_runs').select('*').order('started_at', { ascending: false }).limit(50)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Digest Runs</h1>
      <div className="mb-4">
        <RunDigestButton />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              <th>started_at</th>
              <th>finished_at</th>
              <th>status</th>
              <th>total_users</th>
              <th>emails_sent</th>
            </tr>
          </thead>
          <tbody>
            {runs?.map((r: any) => (
              <tr key={r.id}>
                <td>{r.started_at}</td>
                <td>{r.finished_at}</td>
                <td>{r.status}</td>
                <td>{r.total_users}</td>
                <td>{r.emails_sent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
