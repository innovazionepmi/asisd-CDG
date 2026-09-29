export const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const eurPrecise = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
export const int = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })
export const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 1 })

export function formatEur(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return eur.format(v)
}
export function formatInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return int.format(v)
}
export function formatPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return pct.format(v)
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

/** Scostamento percentuale rispetto a un riferimento (budget o anno precedente). */
export function deviationPct(actual: number | null, reference: number | null): number | null {
  if (actual == null || reference == null || reference === 0) return null
  return (actual - reference) / reference
}

export type Trend = 'up' | 'down' | 'flat'

export function trendOf(deviation: number | null, higherIsBetter = true): Trend {
  if (deviation == null || Math.abs(deviation) < 0.005) return 'flat'
  const positive = deviation > 0
  return positive === higherIsBetter ? 'up' : 'down'
}
