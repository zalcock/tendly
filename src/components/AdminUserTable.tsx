interface AdminUser {
  id: string
  email: string
  companyName: string | null
  trialStartedAt: string | null
  role: string
}

interface AdminUserTableProps {
  users: AdminUser[]
}

function computeTrialExpiry(trialStartedAt: string): string {
  return new Date(new Date(trialStartedAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
}

function isTrialActive(trialStartedAt: string | null): boolean {
  if (!trialStartedAt) return false
  return Date.now() < new Date(trialStartedAt).getTime() + 24 * 60 * 60 * 1000
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function AdminUserTable({ users }: AdminUserTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="px-4 py-2 font-medium text-gray-700">Email</th>
            <th className="px-4 py-2 font-medium text-gray-700">Company</th>
            <th className="px-4 py-2 font-medium text-gray-700">Trial Started</th>
            <th className="px-4 py-2 font-medium text-gray-700">Trial Expires</th>
            <th className="px-4 py-2 font-medium text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const active = isTrialActive(user.trialStartedAt)
            return (
              <tr key={user.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-900">{user.email}</td>
                <td className="px-4 py-2 text-gray-600">{user.companyName ?? '—'}</td>
                <td className="px-4 py-2 text-gray-600">
                  {user.trialStartedAt ? formatDate(user.trialStartedAt) : '—'}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {user.trialStartedAt ? formatDate(computeTrialExpiry(user.trialStartedAt)) : '—'}
                </td>
                <td className="px-4 py-2">
                  {active ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      Expired
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
