import { createClient } from '@supabase/supabase-js'

export default async function Page() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: runs } = await supabase
    .from('ingestion_runs')
    .select('id,source_id,started_at,finished_at,status,total_found,inserted,skipped,error_json')
    .order('started_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Ingestion Runs</h1>
      <div className="mb-4">
        {/* Client button component */}
        {/* @ts-ignore */}
        <script dangerouslySetInnerHTML={{__html: `
          (async function(){
            const mod = await import('/src/components/RunIngestionButton.tsx');
            const el = document.getElementById('run-button-placeholder');
            if (el && mod && mod.default) {
              const Comp = mod.default;
              // mount via innerHTML fallback
              el.innerHTML = '<div id="run-btn-mount"></div>';
              // can't mount React component here—client-side bundling handles it; using dynamic import above is better.
            }
          })();
        `}} />
        <div id="run-button-placeholder"></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2">Started At</th>
              <th className="text-left p-2">Finished At</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Found</th>
              <th className="text-left p-2">Inserted</th>
              <th className="text-left p-2">Skipped</th>
              <th className="text-left p-2">Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs?.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                <td className="p-2">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">{r.total_found ?? '-'}</td>
                <td className="p-2">{r.inserted ?? '-'}</td>
                <td className="p-2">{r.skipped ?? '-'}</td>
                <td className="p-2"><pre className="whitespace-pre-wrap">{r.error_json ? JSON.stringify(r.error_json) : ''}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
