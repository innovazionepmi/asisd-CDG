import type { ReactNode } from 'react'

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-card border border-stone-300 bg-white p-5 shadow-card-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-navy-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-stone-600">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
