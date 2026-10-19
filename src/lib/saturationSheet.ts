import { allMonthsOfYear } from './periods'
import type {
  Channel,
  HygieneSessionsMonthly,
  KpiTarget,
  MonthlyVisit,
  ProductionMonthly,
  ProductionTitolareMonthly,
  SaturationMonthly,
} from './types'

// Logica del foglio "Saturazione" ("Lunedi' della Saturazione") dell'Excel
// ASISD: per ogni KPI mensile tre righe (valore, obiettivo, scostamento su
// obiettivo) e una colonna TOTALE.
//  - TOTALE valore: somma dei mesi (conteggi/valuta) oppure media dei mesi
//    con dato (percentuali).
//  - TOTALE obiettivo: somma (o media) dei 12 obiettivi dell'anno intero.
//  - Scostamento mensile = valore - obiettivo, calcolato solo se il mese ha
//    un dato (>0), come IF(valore>0, ..., "-") dell'Excel.
//  - TOTALE scostamento: confronto "alla pari" sui soli mesi con dato
//    (somma degli scostamenti mensili; per le percentuali media dei valori
//    meno media degli obiettivi degli stessi mesi). Su un anno completo
//    coincide con l'Excel; su un anno in corso non confronta i mesi
//    inseriti con un obiettivo di anno intero.
//  - Obiettivo produzione titolare: nell'Excel e' derivato (obiettivo
//    produzione x obiettivo % titolare); se uno dei due manca si usa il
//    valore inserito a mano (production.titolare).

export type SheetFormat = 'count' | 'currency' | 'percent'

export interface SheetMonth {
  actual: number | null
  target: number | null
  deviation: number | null
}

export interface SheetBlock {
  key: string
  label: string
  format: SheetFormat
  totalMode: 'sum' | 'avg'
  /** Falso quando non e' ovvio se sopra obiettivo sia meglio o peggio (quota del titolare): scostamento in neutro. */
  judged: boolean
  months: SheetMonth[]
  total: SheetMonth
}

export interface SheetInput {
  year: number
  channels: Channel[]
  visits: MonthlyVisit[]
  saturation: SaturationMonthly[]
  production: ProductionMonthly[]
  titolare: ProductionTitolareMonthly[]
  hygiene: HygieneSessionsMonthly[]
  targets: KpiTarget[]
}

const sumOf = (values: number[]) => values.reduce((a, b) => a + b, 0)
const mean = (values: number[]) => (values.length ? sumOf(values) / values.length : null)

function buildBlock(
  key: string,
  label: string,
  format: SheetFormat,
  totalMode: 'sum' | 'avg',
  judged: boolean,
  actuals: (number | null)[],
  targets: (number | null)[],
): SheetBlock {
  const months: SheetMonth[] = actuals.map((actual, i) => {
    const target = targets[i]
    const deviation = actual != null && actual > 0 && target != null ? actual - target : null
    return { actual, target, deviation }
  })

  const withData = months.filter((m) => m.actual != null && m.actual > 0)
  const allActuals = months.map((m) => m.actual).filter((v): v is number => v != null)
  const allTargets = months.map((m) => m.target).filter((v): v is number => v != null)
  const devs = months.map((m) => m.deviation).filter((v): v is number => v != null)

  let total: SheetMonth
  if (totalMode === 'sum') {
    total = {
      actual: allActuals.length ? sumOf(allActuals) : null,
      target: allTargets.length ? sumOf(allTargets) : null,
      deviation: devs.length ? sumOf(devs) : null,
    }
  } else {
    const avgActual = mean(withData.map((m) => m.actual as number))
    const comparable = withData.filter((m) => m.target != null)
    const avgActualComparable = mean(comparable.map((m) => m.actual as number))
    const avgTargetComparable = mean(comparable.map((m) => m.target as number))
    total = {
      actual: avgActual,
      target: mean(allTargets),
      deviation: avgActualComparable != null && avgTargetComparable != null ? avgActualComparable - avgTargetComparable : null,
    }
  }
  return { key, label, format, totalMode, judged, months, total }
}

export function buildSaturationSheet(input: SheetInput): SheetBlock[] {
  const periods = allMonthsOfYear(input.year)
  const reactivationIds = new Set(input.channels.filter((c) => c.type === 'reactivation').map((c) => c.id))

  const perMonth = <T>(rows: T[], period: string, getPeriod: (r: T) => string) => rows.filter((r) => getPeriod(r) === period)

  const newPatients = periods.map((p) => {
    const rows = perMonth(input.visits, p, (r) => r.periodMonth).filter((r) => !reactivationIds.has(r.channelId))
    return rows.length ? sumOf(rows.map((r) => r.visitCount)) : null
  })
  const reactivated = periods.map((p) => {
    const rows = perMonth(input.visits, p, (r) => r.periodMonth).filter((r) => reactivationIds.has(r.channelId))
    return rows.length ? sumOf(rows.map((r) => r.visitCount)) : null
  })
  const saturation = periods.map((p) => input.saturation.find((r) => r.periodMonth === p)?.saturationPct ?? null)
  const production = periods.map((p) => {
    const rows = perMonth(input.production, p, (r) => r.periodMonth)
    return rows.length ? sumOf(rows.map((r) => r.productionValue)) : null
  })
  const titolare = periods.map((p) => input.titolare.find((r) => r.periodMonth === p)?.productionValue ?? null)
  const titolareShare = periods.map((_, i) => {
    const prod = production[i]
    const tit = titolare[i]
    return prod != null && tit != null && prod > 0 ? tit / prod : null
  })
  const hygiene = periods.map((p) => input.hygiene.find((r) => r.periodMonth === p)?.sessionCount ?? null)

  const target = (key: string) => periods.map((p) => input.targets.find((t) => t.periodStart === p && t.metricKey === key)?.targetValue ?? null)

  const productionTarget = target('production.total')
  const shareTarget = target('production.titolare_share')
  const storedTitolareTarget = target('production.titolare')
  const titolareTarget = periods.map((_, i) => {
    const prodT = productionTarget[i]
    const shareT = shareTarget[i]
    return prodT != null && shareT != null ? prodT * shareT : storedTitolareTarget[i]
  })

  return [
    buildBlock('new_patients', 'Prime visite nuovi pazienti', 'count', 'sum', true, newPatients, target('traffic.new_patients.total')),
    buildBlock('reactivated', 'Prime visite pazienti riattivati', 'count', 'sum', true, reactivated, target('traffic.reactivated.total')),
    buildBlock('saturation', '% Saturazione (progressiva)', 'percent', 'avg', true, saturation, target('production.saturation_pct')),
    buildBlock('production', 'Valore produzione eseguita', 'currency', 'sum', true, production, productionTarget),
    buildBlock('titolare', 'Valore produzione titolare', 'currency', 'sum', false, titolare, titolareTarget),
    buildBlock('titolare_share', '% Produzione titolare', 'percent', 'avg', false, titolareShare, shareTarget),
    buildBlock('hygiene', 'Numero sedute di igiene', 'count', 'sum', true, hygiene, target('production.hygiene_sessions')),
  ]
}
