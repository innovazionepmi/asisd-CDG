import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PALETTE } from '../../lib/colors'
import { formatEur, formatInt, formatPct } from '../../lib/calc'

export interface TrendSeries {
  key: string
  label: string
  color?: string
  dashed?: boolean
}

export function TrendLineChart({
  data,
  series,
  unit = 'currency',
  height = 260,
}: {
  data: Record<string, number | string | null>[]
  series: TrendSeries[]
  unit?: 'currency' | 'count' | 'percent'
  height?: number
}) {
  const format = unit === 'currency' ? formatEur : unit === 'percent' ? formatPct : formatInt
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d5d2ca" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#8a867c' }} axisLine={{ stroke: '#d5d2ca' }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#8a867c' }}
          axisLine={false}
          tickLine={false}
          width={unit === 'currency' ? 56 : 40}
          tickFormatter={(v) => (unit === 'currency' ? `${Math.round(v / 1000)}k` : unit === 'percent' ? `${Math.round(v * 100)}%` : String(v))}
        />
        <Tooltip formatter={(value) => format(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            dot={{ r: 2.5 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
