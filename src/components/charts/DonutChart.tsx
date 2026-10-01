import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { PALETTE } from '../../lib/colors'
import { formatEur, formatInt } from '../../lib/calc'

export interface DonutDatum {
  name: string
  value: number
}

export function DonutChart({ data, unit = 'currency', height = 260 }: { data: DonutDatum[]; unit?: 'currency' | 'count'; height?: number }) {
  const format = unit === 'currency' ? formatEur : formatInt
  const filtered = data.filter((d) => d.value > 0)
  if (filtered.length === 0) {
    return <EmptyState height={height} />
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
          {filtered.map((entry, i) => (
            <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} stroke="white" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => format(Number(value))} />
        <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function EmptyState({ height = 260 }: { height?: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center text-sm text-stone-500">
      Nessun dato per il periodo selezionato
    </div>
  )
}
