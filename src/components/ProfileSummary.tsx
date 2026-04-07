interface ProfileSummaryProps {
  companyName: string
  certifications: string[]
}

export default function ProfileSummary({ companyName, certifications }: ProfileSummaryProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900">{companyName}</h2>
      <div className="flex flex-wrap gap-1.5">
        {certifications.length > 0 ? (
          certifications.map((cert) => (
            <span
              key={cert}
              className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
            >
              {cert}
            </span>
          ))
        ) : (
          <span className="text-sm text-gray-400">No certifications</span>
        )}
      </div>
    </div>
  )
}
