import { redirect } from 'next/navigation'

export default function Home() {
  // redirect to admin ingestion page as default landing for dev/admin
  redirect('/admin/ingestion')
  return null
}
