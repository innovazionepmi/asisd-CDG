// Helper per periodi mensili/trimestrali. Le date sono sempre 'YYYY-MM-01'
// per restare coerenti con i CHECK (day = 1) dello schema Postgres.

export const MONTH_LABELS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export const MONTH_LABELS_SHORT_IT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
]

export function monthKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}-01`
}

export function quarterKey(year: number, quarter1to4: number): string {
  const month = (quarter1to4 - 1) * 3 + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function quarterLabel(q: number): string {
  return `${q}° trimestre`
}

export function yearOfPeriod(period: string): number {
  return Number(period.slice(0, 4))
}

export function monthOfPeriod(period: string): number {
  return Number(period.slice(5, 7))
}

export function quarterOfPeriod(period: string): number {
  return Math.floor((monthOfPeriod(period) - 1) / 3) + 1
}

export function priorYearPeriod(period: string): string {
  const year = yearOfPeriod(period) - 1
  return `${year}-${period.slice(5)}`
}

export function allMonthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1))
}

export function allQuartersOfYear(year: number): string[] {
  return Array.from({ length: 4 }, (_, i) => quarterKey(year, i + 1))
}
