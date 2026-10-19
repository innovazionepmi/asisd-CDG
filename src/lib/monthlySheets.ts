import { allMonthsOfYear } from './periods'
import { buildBlock, buildSaturationSheet, type SheetBlock } from './saturationSheet'
import type { CashflowMonthly, Channel, HygieneSessionsMonthly, KpiTarget, ManualValue, MonthlyVisit, ProductionMonthly, ProductionTitolareMonthly, QuotesMonthly, TreatmentCategory } from './types'

// Tabelle "dati completi" con i mesi nelle colonne, come i fogli Excel ASISD:
//  - Traffico e Produzione: foglio "Saturazione"
//  - Preventivi: foglio "Customer Experience"
//  - Cashflow: foglio "CashFlow"
// Per ogni KPI: valore, obiettivo e scostamento su obiettivo, con colonna Anno.
// Le righe in piu' rispetto al foglio (dettaglio per canale / tipologia, preventivi
// generali, crediti) non hanno obiettivo e mostrano solo il valore.

type Series = (number | null)[]

const sumOf = (v: number[]) => v.reduce((a, b) => a + b, 0)
const nonNull = (v: number | null): v is number => v != null

const targetSeries = (targets: KpiTarget[], key: string, periods: string[]): Series =>
  periods.map((p) => targets.find((t) => t.periodStart === p && t.metricKey === key)?.targetValue ?? null)

const noTargets = (periods: string[]): Series => periods.map(() => null)

/** Rapporto numeratore/denominatore mese per mese (solo dove il denominatore e' > 0) e sul totale dell'anno. */
function ratio(num: Series, den: Series): { months: Series; total: number | null } {
  const months = num.map((n, i) => (n != null && den[i] != null && (den[i] as number) > 0 ? n / (den[i] as number) : null))
  const n = sumOf(num.filter(nonNull))
  const d = sumOf(den.filter(nonNull))
  return { months, total: d > 0 ? n / d : null }
}

// ---------- Traffico ----------

export function trafficBlocks(input: { year: number; channels: Channel[]; visits: MonthlyVisit[]; targets: KpiTarget[] }): SheetBlock[] {
  const periods = allMonthsOfYear(input.year)
  const sheet = buildSaturationSheet({ year: input.year, channels: input.channels, visits: input.visits, saturation: [], production: [], titolare: [], hygiene: [], targets: input.targets })
  const main = sheet.filter((b) => b.key === 'new_patients' || b.key === 'reactivated')
  const perChannel = input.channels
    .filter((c) => c.type !== 'reactivation')
    .map((ch) =>
      buildBlock(
        `ch:${ch.id}`,
        `Visite: ${ch.name}`,
        'count',
        'sum',
        true,
        periods.map((p) => input.visits.find((v) => v.periodMonth === p && v.channelId === ch.id)?.visitCount ?? null),
        noTargets(periods),
        { noTarget: true },
      ),
    )
  return [...main, ...perChannel]
}

// ---------- Produzione ----------

export function productionBlocks(input: {
  year: number
  categories: TreatmentCategory[]
  production: ProductionMonthly[]
  titolare: ProductionTitolareMonthly[]
  hygiene: HygieneSessionsMonthly[]
  targets: KpiTarget[]
}): SheetBlock[] {
  const periods = allMonthsOfYear(input.year)
  const sheet = buildSaturationSheet({
    year: input.year,
    channels: [],
    visits: [],
    saturation: [],
    production: input.production,
    titolare: input.titolare,
    hygiene: input.hygiene,
    targets: input.targets,
  })
  const main = sheet.filter((b) => ['production', 'titolare', 'titolare_share', 'hygiene'].includes(b.key))
  const perCategory = input.categories.map((cat) =>
    buildBlock(
      `cat:${cat.id}`,
      `Produzione: ${cat.name}`,
      'currency',
      'sum',
      true,
      periods.map((p) => input.production.find((r) => r.periodMonth === p && r.treatmentCategoryId === cat.id)?.productionValue ?? null),
      noTargets(periods),
      { noTarget: true },
    ),
  )
  return [...main, ...perCategory]
}

// ---------- Preventivi ----------

export function quotesBlocks(input: { year: number; quotes: QuotesMonthly[]; targets: KpiTarget[]; manual: ManualValue[] }): SheetBlock[] {
  const P = allMonthsOfYear(input.year)
  const target = (key: string) => targetSeries(input.targets, key, P)
  const manualBudget = (rowKey: string) => input.manual.find((m) => m.rowKey === rowKey && m.colKey === 'budget')?.value ?? null
  const flat = (v: number | null): Series => P.map(() => v)

  const perMonth = (pred: (q: QuotesMonthly) => boolean) => P.map((p) => input.quotes.filter((q) => q.periodMonth === p && pred(q)))
  const field = (rows: QuotesMonthly[][], f: (q: QuotesMonthly) => number): Series => rows.map((rs) => (rs.length ? sumOf(rs.map(f)) : null))
  const pvRows = perMonth((q) => q.patientSegment === 'new_patient')
  const allRows = perMonth(() => true)

  const issuedPv = field(pvRows, (q) => q.issuedCount)
  const issuedValuePv = field(pvRows, (q) => q.issuedValue)
  const confirmedPv = field(pvRows, (q) => q.confirmedCount)
  const confirmedValuePv = field(pvRows, (q) => q.confirmedValue)
  const issuedAll = field(allRows, (q) => q.issuedCount)
  const confirmedAll = field(allRows, (q) => q.confirmedCount)

  // obiettivi dei nuovi pazienti (come nel foglio): preventivi emessi = obiettivo nuovi pazienti;
  // confermati = emessi x % chiusura obiettivo (mensile, altrimenti il valore annuo manuale)
  const issuedPvTarget = target('traffic.new_patients.total')
  const monthlyCloseRatePv = target('quotes.close_rate_pv')
  const closeRatePvTarget = monthlyCloseRatePv.some(nonNull) ? monthlyCloseRatePv : flat(manualBudget('q_close_rate_pv'))
  const confirmedPvTarget = issuedPvTarget.map((t, i) => (t != null && closeRatePvTarget[i] != null ? t * (closeRatePvTarget[i] as number) : null))

  const avgIssuedPv = ratio(issuedValuePv, issuedPv)
  const avgConfirmedPv = ratio(confirmedValuePv, confirmedPv)
  const closePv = ratio(confirmedPv, issuedPv)
  const closeAll = ratio(confirmedAll, issuedAll)

  const withTotal = (key: string, label: string, format: 'count' | 'currency' | 'percent', actuals: Series, targets: Series, total: number | null) =>
    buildBlock(key, label, format, 'avg', true, actuals, targets, { totalActual: total })

  return [
    buildBlock('qpv_issued_count', 'Numero preventivi emessi (solo nuovi pazienti)', 'count', 'sum', true, issuedPv, issuedPvTarget),
    buildBlock('qpv_issued_value', 'Valore preventivi emessi (solo nuovi pazienti)', 'currency', 'sum', true, issuedValuePv, target('quotes.issued_value_pv')),
    withTotal('qpv_avg_issued', 'Valore medio prev. emessi (solo nuovi pazienti)', 'currency', avgIssuedPv.months, flat(manualBudget('q_avg_issued_pv')), avgIssuedPv.total),
    buildBlock('qpv_confirmed_count', 'Numero preventivi confermati (solo nuovi pazienti)', 'count', 'sum', true, confirmedPv, confirmedPvTarget),
    buildBlock('qpv_confirmed_value', 'Valore preventivi confermati (solo nuovi pazienti)', 'currency', 'sum', true, confirmedValuePv, target('quotes.confirmed_value_pv')),
    withTotal('qpv_avg_confirmed', 'Valore medio prev. confermati (solo nuovi pazienti)', 'currency', avgConfirmedPv.months, flat(manualBudget('q_avg_confirmed_pv')), avgConfirmedPv.total),
    withTotal('qpv_close_rate', 'Percentuale di chiusura (solo nuovi pazienti)', 'percent', closePv.months, closeRatePvTarget, closePv.total),
    withTotal('q_close_rate', 'Percentuale di chiusura (generale)', 'percent', closeAll.months, target('quotes.close_rate'), closeAll.total),
    buildBlock('q_issued_count', 'Numero preventivi emessi (generali)', 'count', 'sum', true, issuedAll, target('quotes.issued_count')),
    buildBlock('q_issued_value', 'Valore preventivi emessi (generali)', 'currency', 'sum', true, field(allRows, (q) => q.issuedValue), target('quotes.issued_value')),
    buildBlock('q_confirmed_count', 'Numero preventivi confermati (generali)', 'count', 'sum', true, confirmedAll, target('quotes.confirmed_count')),
    buildBlock('q_confirmed_value', 'Valore preventivi confermati (generali)', 'currency', 'sum', true, field(allRows, (q) => q.confirmedValue), target('quotes.confirmed_value')),
    buildBlock('q_lost_count', 'Numero preventivi persi (generali)', 'count', 'sum', true, field(allRows, (q) => q.lostCount), noTargets(P), { noTarget: true }),
    buildBlock('q_lost_value', 'Valore preventivi persi (generali)', 'currency', 'sum', true, field(allRows, (q) => q.lostValue), noTargets(P), { noTarget: true }),
  ]
}

// ---------- Cashflow ----------

export function cashflowBlocks(input: { year: number; rows: CashflowMonthly[]; targets: KpiTarget[] }): SheetBlock[] {
  const P = allMonthsOfYear(input.year)
  const target = (key: string) => targetSeries(input.targets, key, P)
  const rowOf = (p: string) => input.rows.find((r) => r.periodMonth === p)
  const series = (f: (r: CashflowMonthly) => number | null): Series => P.map((p) => {
    const r = rowOf(p)
    return r ? f(r) : null
  })
  const positive = (v: number) => (v > 0 ? v : null)

  const statusBlock: SheetBlock = {
    key: 'status',
    label: 'Situazione cashflow',
    format: 'count',
    totalMode: 'avg',
    judged: false,
    kind: 'status',
    statuses: P.map((p) => rowOf(p)?.status ?? null),
    months: P.map(() => ({ actual: null, target: null, deviation: null })),
    total: { actual: null, target: null, deviation: null },
  }

  return [
    statusBlock,
    buildBlock('advance_value', 'Valore incassi anticipati', 'currency', 'sum', true, series((r) => r.advancePaymentsValue), target('cashflow.advance_payments')),
    buildBlock('advance_pct', 'Percentuale incassi anticipati (sul totale)', 'percent', 'avg', true, series((r) => positive(r.advancePaymentsPct)), target('cashflow.advance_payments_pct')),
    buildBlock('overdue', 'Crediti scaduti (progressivo)', 'currency', 'avg', false, series((r) => r.overdueReceivables), target('cashflow.credits_overdue')),
    buildBlock('revenue', 'Ricavi del periodo', 'currency', 'sum', true, P.map(() => null), target('economics.revenue_monthly')),
    buildBlock('planned', 'Crediti pianificati', 'currency', 'avg', false, series((r) => r.plannedReceivables), noTargets(P), { noTarget: true }),
    buildBlock('unplanned', 'Crediti non pianificati', 'currency', 'avg', false, series((r) => r.unplannedReceivables), noTargets(P), { noTarget: true }),
    buildBlock('third', 'Crediti terzo pagante', 'currency', 'avg', false, series((r) => r.thirdPartyPayerReceivables), noTargets(P), { noTarget: true }),
  ]
}
