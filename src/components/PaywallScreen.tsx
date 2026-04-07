export default function PaywallScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Your 24-hour pilot has ended.</h1>
        <p className="text-gray-600">
          You&apos;ve seen what Tendly can do. Ready to keep going?
        </p>
        <a
          href="mailto:hello@tendly.co"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Contact us for full access
        </a>
      </div>
    </div>
  )
}
