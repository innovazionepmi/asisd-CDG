import clsx from 'clsx'
import type { Trend } from '../../lib/calc'
import { formatPct } from '../../lib/calc'

const TREND_STYLE: Record<Trend, { text: string; bg: string; arrow: string }> = {
  up: { text: 'text-success-600', bg: 'bg-success-100', arrow: '▲' },
  down: { text: 'text-danger-600', bg: 'bg-danger-100', arrow: '▼' },
  flat: { text: 'text-stone-600', bg: 'bg-stone-100', arrow: '—' },
}

export function KpiCard({
  label,
  value,
  deviation,
  deviationLabel,
  trend,
  hint,
}: {
  label: string
  value: string
  deviation?: number | null
  deviationLabel?: string
  trend?: Trend
  hint?: string
}) {
  const style = trend ? TREND_STYLE[trend] : null
  return (
    <div className="rounded-card border border-stone-300 bg-white p-4 shadow-card-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-navy-900">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {deviation != null && style && (
          <span className={clsx('inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs font-semibold', style.bg, style.text)}>
            {style.arrow} {formatPct(Math.abs(deviation))}
          </span>
        )}
        {deviationLabel && <span className="text-xs text-stone-500">{deviationLabel}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  )
}
