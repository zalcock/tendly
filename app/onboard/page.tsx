import OnboardForm from '@/src/components/OnboardForm'

export default function OnboardPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold mb-6">Set up your company profile</h1>
        <OnboardForm />
      </div>
    </div>
  )
}
