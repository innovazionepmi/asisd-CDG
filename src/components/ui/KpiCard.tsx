import clsx from 'clsx'
import type { Trend } from '../../lib/calc'
import { formatPct } from '../../lib/calc'

const TREND_STYLE: Record<Trend, { text: string; bg: string; arrow: string }> = {
  up: { text: 'text-emerald-700', bg: 'bg-emerald-50', arrow: '▲' },
  down: { text: 'text-rose-700', bg: 'bg-rose-50', arrow: '▼' },
  flat: { text: 'text-slate-500', bg: 'bg-slate-100', arrow: '—' },
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {deviation != null && style && (
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', style.bg, style.text)}>
            {style.arrow} {formatPct(Math.abs(deviation))}
          </span>
        )}
        {deviationLabel && <span className="text-xs text-slate-400">{deviationLabel}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
