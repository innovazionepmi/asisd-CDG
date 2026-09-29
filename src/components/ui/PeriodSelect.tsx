import { MONTH_LABELS_IT, quarterLabel } from '../../lib/periods'

export function YearSelect({ year, onChange, years }: { year: number; onChange: (y: number) => void; years: number[] }) {
  return (
    <select
      value={year}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}

export function MonthSelect({ month, onChange }: { month: number; onChange: (m: number) => void }) {
  return (
    <select
      value={month}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
    >
      {MONTH_LABELS_IT.map((label, i) => (
        <option key={label} value={i + 1}>
          {label}
        </option>
      ))}
    </select>
  )
}

export function QuarterSelect({ quarter, onChange }: { quarter: number; onChange: (q: number) => void }) {
  return (
    <select
      value={quarter}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
    >
      {[1, 2, 3, 4].map((q) => (
        <option key={q} value={q}>
          {quarterLabel(q)}
        </option>
      ))}
    </select>
  )
}
