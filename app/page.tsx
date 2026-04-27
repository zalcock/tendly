import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tendly — Find Government Contracts That Match Your Business',
  description:
    'Tendly matches your business profile to active SAM.gov solicitations. Find government contracts, filter by set-aside, and never miss a deadline.',
  openGraph: {
    title: 'Tendly — Find Government Contracts That Match Your Business',
    description:
      'Tendly matches your business profile to active SAM.gov solicitations. Find government contracts, filter by set-aside, and never miss a deadline.',
    type: 'website',
  },
}

export default function Home() {
  return (
    <div className="font-sans min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: '#1B365D' }}>
        <span className="text-white text-xl font-bold">Tendly</span>
        <a href="/login" className="text-white hover:underline text-sm">
          Log in
        </a>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 bg-white flex-1">
        <h1 className="text-4xl font-bold mb-6" style={{ color: '#1B365D' }}>
          Find Government Contracts That Match Your Business
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mb-10">
          Tendly uses AI to match your business profile to active SAM.gov solicitations — so you spend less time
          searching and more time winning.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <a
            href="/signup"
            className="px-6 py-3 rounded-md text-white font-semibold text-sm"
            style={{ backgroundColor: '#00D1B2' }}
          >
            Get started free
          </a>
          <a
            href="/login"
            className="px-6 py-3 rounded-md border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50"
          >
            Log in
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12" style={{ color: '#1B365D' }}>
            Everything you need to win government contracts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-2" style={{ color: '#1B365D' }}>
                Smart Matching
              </h3>
              <p className="text-gray-600 text-sm">
                AI matches your NAICS codes to active solicitations so you only see contracts relevant to your business.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-2" style={{ color: '#1B365D' }}>
                Set-Aside Filters
              </h3>
              <p className="text-gray-600 text-sm">
                Filter by 8(a), SDVOSB, HUBZone, WOSB certifications to find contracts you are eligible to win.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-2" style={{ color: '#1B365D' }}>
                Never Miss a Deadline
              </h3>
              <p className="text-gray-600 text-sm">
                Real-time alerts for contracts matching your profile so you always submit before the deadline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-white px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12" style={{ color: '#1B365D' }}>
            Simple, transparent pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Free */}
            <div className="border border-gray-200 rounded-lg p-6 flex flex-col">
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#1B365D' }}>
                Free
              </h3>
              <p className="text-3xl font-bold mb-4" style={{ color: '#1B365D' }}>
                €0
              </p>
              <ul className="text-sm text-gray-600 space-y-2 mb-8 flex-1">
                <li>20 credits</li>
                <li>1 country</li>
                <li>1 team member</li>
              </ul>
              <a
                href="/signup"
                className="block text-center px-4 py-2 rounded-md text-white text-sm font-semibold"
                style={{ backgroundColor: '#00D1B2' }}
              >
                Get started free
              </a>
            </div>

            {/* Professional */}
            <div className="border-2 rounded-lg p-6 flex flex-col" style={{ borderColor: '#00D1B2' }}>
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#1B365D' }}>
                Professional
              </h3>
              <p className="text-3xl font-bold mb-4" style={{ color: '#1B365D' }}>
                €29<span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <ul className="text-sm text-gray-600 space-y-2 mb-8 flex-1">
                <li>200 credits/month</li>
                <li>All countries</li>
                <li>3 team members</li>
              </ul>
              <button
                className="block w-full text-center px-4 py-2 rounded-md text-white text-sm font-semibold"
                style={{ backgroundColor: '#1B365D' }}
              >
                Coming soon
              </button>
            </div>

            {/* Enterprise */}
            <div className="border border-gray-200 rounded-lg p-6 flex flex-col">
              <h3 className="text-lg font-semibold mb-1" style={{ color: '#1B365D' }}>
                Enterprise
              </h3>
              <p className="text-3xl font-bold mb-4" style={{ color: '#1B365D' }}>
                €149<span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <ul className="text-sm text-gray-600 space-y-2 mb-8 flex-1">
                <li>400 credits/month</li>
                <li>All countries</li>
                <li>10 team members</li>
              </ul>
              <button
                className="block w-full text-center px-4 py-2 rounded-md text-white text-sm font-semibold"
                style={{ backgroundColor: '#1B365D' }}
              >
                Coming soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 text-center text-sm text-gray-500 border-t border-gray-200">
        © 2025 Tendly. All rights reserved.
      </footer>
    </div>
  )
}
