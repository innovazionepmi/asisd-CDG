import { allMonthsOfYear } from './periods'
import { buildColumns, buildRowDefs, cellFor, higherIsBetter, resolveAfp } from './plStatement'
import type {
  CashflowMonthly,
  Channel,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  KpiTarget,
  MonthlyVisit,
  PlAccount,
  PlPriorYearBaseline,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  SaturationMonthly,
  TreatmentCategory,
} from './types'

// "Dashboard analitica": replica del foglio "Aggregato Trimestrale"
// dell'Excel ASISD. Per ogni KPI: AFP (totale e media trimestrale), Anno
// (totale o media), Budget, e per ogni trimestre valore, scostamento vs
// media AFP, scostamento vs budget e progressivo da inizio anno.
//
// Regole prese dall'Excel:
//  - conteggi/valuta: il trimestre e' la somma dei mesi, l'anno la somma dei
//    trimestri; media trimestrale AFP = AFP / 4; scostamento trimestre vs AFP
//    = valore - AFP/4.
//  - percentuali (e "valore medio"): il trimestre e' la media dei mesi con
//    dato (valore medio = rapporto dei totali del trimestre), l'anno la media
//    dei trimestri; il confronto con l'AFP e' sul valore intero (in pp).
//  - crediti (fotografie di fine mese): il trimestre e' il valore dell'ultimo
//    mese con dato, non la somma.
//  - budget del trimestre: somma (o media) degli obiettivi mensili del
//    trimestre — l'Excel usa budget annuo / 4; con gli obiettivi mensili si
//    ottiene lo stesso criterio delle pagine Traffico/Produzione/Saturazione.
//  - confronto "alla pari" per l'anno in corso: scostamento dell'anno solo
//    sui trimestri con dato (su un anno completo coincide con l'Excel).
//  - Economics: stessa logica della pagina Economics (incidenza sui ricavi,
//    scostamento in pp, ricavi in variazione % sui 12 mesi).

export type DashFormat = 'count' | 'currency' | 'percent'
export type DashTone = 'higher' | 'lower' | 'neutral'
export type DevKind = 'abs' | 'pp' | 'rel'

export interface Dev {
  value: number
  kind: DevKind
}

export interface DashCell {
  value: number | null
  /** Incidenza sui ricavi (solo righe di conto economico). */
  pct: number | null
  dAfp: Dev | null
  dBdgt: Dev | null
  progressive: number | null
}

export interface DashRow {
  key: string
  label: string
  level: 0 | 1 | 2
  format: DashFormat
  tone: DashTone
  emphasis?: boolean
  /** Chiavi delle righe "madre": la riga si nasconde se una di esse e' compressa. */
  ancestors: string[]
  hasChildren?: boolean
  /** Nasconde la % di incidenza (riga Ricavi: sempre 100%). */
  hidePct?: boolean
  /** Righe previsionali: solo T1-T3. */
  forecast?: boolean
  afp: { value: number | null; perQuarter: number | null; pct: number | null }
  budget: number | null
  year: DashCell
  quarters: DashCell[]
}

export interface DashSection {
  key: string
  title: string
  description: string
  rows: DashRow[]
}

export interface YearData {
  visits: MonthlyVisit[]
  quotes: QuotesMonthly[]
  production: ProductionMonthly[]
  titolare: ProductionTitolareMonthly[]
  hygiene: HygieneSessionsMonthly[]
  saturation: SaturationMonthly[]
  cashflow: CashflowMonthly[]
  pl: PlQuarterly[]
}

export interface DashInput {
  year: number
  channels: Channel[]
  categories: TreatmentCategory[]
  accounts: PlAccount[]
  current: YearData
  prior: YearData
  targets: KpiTarget[]
  afpBaseline: PlPriorYearBaseline[]
  kpiBaseline: KpiPriorYearBaseline[]
}

type Agg = 'sum' | 'avg' | 'last'
type Series = (number | null)[]
type SeriesFn = (d: YearData, periods: string[], accounts: PlAccount[], year: number) => Series

interface KpiSpec {
  key: string
  label: string
  level: 0 | 1 | 2
  format: DashFormat
  tone: DashTone
  agg: Agg
  emphasis?: boolean
  ancestors: string[]
  hasChildren?: boolean
  /** Serie mensile (12 valori, null = nessun dato). */
  monthly?: SeriesFn
  /** Serie gia' trimestrale (4 valori). */
  quarterly?: SeriesFn
  /** Valore derivato dai valori di trimestre di altre due righe. */
  ratio?: { num: string; den: string }
  /** L'anno non ha senso (es. % crediti sul ricavo di trimestre). */
  noYear?: boolean
  budgetKey?: string
  budgetFn?: (targets: KpiTarget[], periods: string[]) => Series
  hidden?: boolean
}

const nonNull = (v: number | null): v is number => v != null
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const meanOf = (xs: number[]) => (xs.length ? sumOf(xs) / xs.length : null)

function aggregate(values: Series, agg: Agg): number | null {
  const vals = values.filter(nonNull)
  if (!vals.length) return null
  if (agg === 'sum') return sumOf(vals)
  if (agg === 'avg') return meanOf(vals)
  return vals[vals.length - 1]
}

const monthIdx = (q: number) => [q * 3, q * 3 + 1, q * 3 + 2]
const quarterOf = (series: Series, q: number, agg: Agg) => aggregate(monthIdx(q).map((i) => series[i]), agg)

// ---------- serie mensili ----------

const visitsSeries =
  (pred: (channelId: string) => boolean): SeriesFn =>
  (d, periods) =>
    periods.map((p) => {
      const rows = d.visits.filter((v) => v.periodMonth === p && pred(v.channelId))
      return rows.length ? sumOf(rows.map((v) => v.visitCount)) : null
    })

const quotesSeries =
  (field: 'issuedCount' | 'issuedValue' | 'confirmedCount' | 'confirmedValue' | 'lostCount' | 'lostValue', segment?: 'new_patient'): SeriesFn =>
  (d, periods) =>
    periods.map((p) => {
      const rows = d.quotes.filter((q) => q.periodMonth === p && (!segment || q.patientSegment === segment))
      return rows.length ? sumOf(rows.map((q) => q[field])) : null
    })

const closeRateSeries =
  (segment?: 'new_patient'): SeriesFn =>
  (d, periods) =>
    periods.map((p) => {
      const rows = d.quotes.filter((q) => q.periodMonth === p && (!segment || q.patientSegment === segment))
      const issued = sumOf(rows.map((q) => q.issuedCount))
      return rows.length && issued > 0 ? sumOf(rows.map((q) => q.confirmedCount)) / issued : null
    })

const productionSeries =
  (categoryId?: string): SeriesFn =>
  (d, periods) =>
    periods.map((p) => {
      const rows = d.production.filter((r) => r.periodMonth === p && (!categoryId || r.treatmentCategoryId === categoryId))
      return rows.length ? sumOf(rows.map((r) => r.productionValue)) : null
    })

const titolareSeries: SeriesFn = (d, periods) => periods.map((p) => d.titolare.find((r) => r.periodMonth === p)?.productionValue ?? null)

const titolareShareSeries: SeriesFn = (d, periods) => {
  const total = productionSeries()(d, periods, [], 0)
  const tit = titolareSeries(d, periods, [], 0)
  return periods.map((_, i) => (total[i] != null && tit[i] != null && (total[i] as number) > 0 ? (tit[i] as number) / (total[i] as number) : null))
}

const hygieneSeries: SeriesFn = (d, periods) => periods.map((p) => d.hygiene.find((r) => r.periodMonth === p)?.sessionCount ?? null)

const saturationSeries: SeriesFn = (d, periods) =>
  periods.map((p) => {
    const v = d.saturation.find((r) => r.periodMonth === p)?.saturationPct
    return v != null && v > 0 ? v : null
  })

const cashflowSeries =
  (field: 'advancePaymentsValue' | 'advancePaymentsPct' | 'plannedReceivables' | 'unplannedReceivables' | 'overdueReceivables' | 'thirdPartyPayerReceivables' | 'credits', nullIfZero = false): SeriesFn =>
  (d, periods) =>
    periods.map((p) => {
      const r = d.cashflow.find((c) => c.periodMonth === p)
      if (!r) return null
      const v = field === 'credits' ? r.plannedReceivables + r.unplannedReceivables + r.overdueReceivables + r.thirdPartyPayerReceivables : r[field]
      return nullIfZero && v <= 0 ? null : v
    })

/** Ricavi del singolo trimestre (delta in pl_quarterly): serve da denominatore delle % crediti. */
const quarterRevenueSeries: SeriesFn = (d, _periods, accounts, year) => {
  const revenueIds = new Set(accounts.filter((a) => a.accountType === 'revenue').map((a) => a.id))
  return [1, 2, 3, 4].map((q) => {
    const key = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
    const rows = d.pl.filter((r) => r.periodQuarter === key && revenueIds.has(r.accountId))
    const total = sumOf(rows.map((r) => r.amount))
    return rows.length && total !== 0 ? total : null
  })
}

// ---------- budget (obiettivi mensili) ----------

const targetSeries = (key: string) => (targets: KpiTarget[], periods: string[]): Series =>
  periods.map((p) => targets.find((t) => t.periodStart === p && t.metricKey === key)?.targetValue ?? null)

/** Obiettivo produzione titolare: derivato (produzione x % titolare) come nell'Excel, altrimenti il valore inserito a mano. */
const titolareBudget = (targets: KpiTarget[], periods: string[]): Series => {
  const prod = targetSeries('production.total')(targets, periods)
  const share = targetSeries('production.titolare_share')(targets, periods)
  const stored = targetSeries('production.titolare')(targets, periods)
  return periods.map((_, i) => (prod[i] != null && share[i] != null ? (prod[i] as number) * (share[i] as number) : stored[i]))
}

// ---------- definizione righe ----------

function kpi(spec: Omit<KpiSpec, 'ancestors'> & { ancestors?: string[] }): KpiSpec {
  return { ancestors: [], ...spec }
}

interface SectionDef {
  key: string
  title: string
  description: string
  specs: KpiSpec[]
  /** righe di conto economico (sezione Economics) */
  pl?: boolean
  /** riga previsionale: proiezione di fine anno della produzione */
  forecastAfter?: string
}

function buildSectionDefs(input: DashInput): SectionDef[] {
  const { channels, categories } = input
  const nonReactivation = channels.filter((c) => c.type !== 'reactivation').sort((a, b) => a.sortOrder - b.sortOrder)
  const reactivationIds = new Set(channels.filter((c) => c.type === 'reactivation').map((c) => c.id))
  const campaigns = nonReactivation.filter((c) => c.type === 'marketing_campaign')
  const others = nonReactivation.filter((c) => c.type !== 'marketing_campaign')
  const campaignIds = new Set(campaigns.map((c) => c.id))
  const nonReactivationIds = new Set(nonReactivation.map((c) => c.id))

  const traffico: KpiSpec[] = [
    kpi({
      key: 'new_patients',
      label: 'N° prime visite nuovi pazienti',
      level: 0,
      format: 'count',
      tone: 'higher',
      agg: 'sum',
      hasChildren: nonReactivation.length > 0,
      monthly: visitsSeries((id) => nonReactivationIds.has(id)),
      budgetKey: 'traffic.new_patients.total',
    }),
    ...others.map((c) =>
      kpi({
        key: `ch:${c.id}`,
        label: `di cui ${c.name}`,
        level: 1,
        format: 'count',
        tone: 'higher',
        agg: 'sum',
        ancestors: ['new_patients'],
        monthly: visitsSeries((id) => id === c.id),
      }),
    ),
    ...(campaigns.length
      ? [
          kpi({
            key: 'campaigns',
            label: 'di cui visite da campagne marketing',
            level: 1,
            format: 'count',
            tone: 'higher',
            agg: 'sum',
            ancestors: ['new_patients'],
            hasChildren: true,
            monthly: visitsSeries((id) => campaignIds.has(id)),
          }),
          ...campaigns.map((c) =>
            kpi({
              key: `ch:${c.id}`,
              label: c.name,
              level: 2,
              format: 'count',
              tone: 'higher',
              agg: 'sum',
              ancestors: ['new_patients', 'campaigns'],
              monthly: visitsSeries((id) => id === c.id),
            }),
          ),
        ]
      : []),
    kpi({
      key: 'reactivated',
      label: 'N° prime visite pazienti riattivati',
      level: 0,
      format: 'count',
      tone: 'higher',
      agg: 'sum',
      monthly: visitsSeries((id) => reactivationIds.has(id)),
      budgetKey: 'traffic.reactivated.total',
    }),
  ]

  const pair = (
    key: string,
    label: string,
    pvLabel: string,
    format: DashFormat,
    tone: DashTone,
    field: Parameters<typeof quotesSeries>[0],
  ): KpiSpec[] => [
    kpi({ key, label, level: 0, format, tone, agg: 'sum', hasChildren: true, monthly: quotesSeries(field) }),
    kpi({ key: `${key}_pv`, label: pvLabel, level: 1, format, tone, agg: 'sum', ancestors: [key], monthly: quotesSeries(field, 'new_patient') }),
  ]

  const avgPair = (key: string, label: string, pvLabel: string, tone: DashTone, valueKey: string, countKey: string): KpiSpec[] => [
    kpi({ key, label, level: 0, format: 'currency', tone, agg: 'avg', hasChildren: true, ratio: { num: valueKey, den: countKey } }),
    kpi({ key: `${key}_pv`, label: pvLabel, level: 1, format: 'currency', tone, agg: 'avg', ancestors: [key], ratio: { num: `${valueKey}_pv`, den: `${countKey}_pv` } }),
  ]

  const preventivi: KpiSpec[] = [
    ...pair('q_issued_count', 'N° preventivi emessi (generali)', 'di cui emessi prima visita', 'count', 'higher', 'issuedCount'),
    ...pair('q_confirmed_count', 'N° preventivi confermati (generali)', 'di cui confermati prima visita', 'count', 'higher', 'confirmedCount'),
    ...pair('q_lost_count', 'N° preventivi persi (generali)', 'di cui persi prima visita', 'count', 'lower', 'lostCount'),
    ...pair('q_issued_value', '€ preventivi emessi (generali)', 'di cui € emessi prima visita', 'currency', 'higher', 'issuedValue'),
    ...pair('q_confirmed_value', '€ preventivi confermati (generali)', 'di cui € confermati prima visita', 'currency', 'higher', 'confirmedValue'),
    ...pair('q_lost_value', '€ preventivi persi (generali)', 'di cui € persi prima visita', 'currency', 'lower', 'lostValue'),
    ...avgPair('q_avg_issued', '€ medio preventivi emessi (generali)', 'di cui € medio emessi prima visita', 'higher', 'q_issued_value', 'q_issued_count'),
    ...avgPair('q_avg_confirmed', '€ medio preventivi confermati (generali)', 'di cui € medio confermati prima visita', 'higher', 'q_confirmed_value', 'q_confirmed_count'),
    ...avgPair('q_avg_lost', '€ medio preventivi persi (generali)', 'di cui € medio persi prima visita', 'lower', 'q_lost_value', 'q_lost_count'),
    kpi({
      key: 'q_close_rate',
      label: '% chiusura preventivi (generali)',
      level: 0,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      hasChildren: true,
      monthly: closeRateSeries(),
      budgetKey: 'quotes.close_rate',
    }),
    kpi({
      key: 'q_close_rate_pv',
      label: 'di cui % chiusura prima visita',
      level: 1,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      ancestors: ['q_close_rate'],
      monthly: closeRateSeries('new_patient'),
    }),
  ]

  const produzione: KpiSpec[] = [
    kpi({
      key: 'production_total',
      label: 'Valore produzione eseguita',
      level: 0,
      format: 'currency',
      tone: 'higher',
      agg: 'sum',
      hasChildren: categories.length > 0,
      monthly: productionSeries(),
      budgetKey: 'production.total',
    }),
    ...categories
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) =>
        kpi({
          key: `cat:${c.id}`,
          label: `di cui ${c.name}`,
          level: 1,
          format: 'currency',
          tone: 'higher',
          agg: 'sum',
          ancestors: ['production_total'],
          monthly: productionSeries(c.id),
        }),
      ),
    kpi({ key: 'titolare', label: 'Valore produzione titolare', level: 0, format: 'currency', tone: 'neutral', agg: 'sum', monthly: titolareSeries, budgetFn: titolareBudget }),
    kpi({
      key: 'titolare_share',
      label: '% produzione titolare',
      level: 0,
      format: 'percent',
      tone: 'neutral',
      agg: 'avg',
      monthly: titolareShareSeries,
      budgetKey: 'production.titolare_share',
    }),
    kpi({
      key: 'hygiene',
      label: 'N° prestazioni di igiene',
      level: 0,
      format: 'count',
      tone: 'higher',
      agg: 'sum',
      monthly: hygieneSeries,
      budgetKey: 'production.hygiene_sessions',
    }),
    kpi({
      key: 'saturation',
      label: '% saturazione progressiva',
      level: 0,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      monthly: saturationSeries,
      budgetKey: 'production.saturation_pct',
    }),
  ]

  const credit = (key: string, label: string, field: Parameters<typeof cashflowSeries>[0], tone: DashTone): KpiSpec[] => [
    kpi({ key, label, level: 1, format: 'currency', tone, agg: 'last', ancestors: ['credits'], monthly: cashflowSeries(field) }),
    kpi({
      key: `${key}_pct`,
      label: `% ${label.replace(/^di cui € /, '')}`,
      level: 1,
      format: 'percent',
      tone,
      agg: 'avg',
      ancestors: ['credits'],
      noYear: true,
      ratio: { num: key, den: '_revenue' },
    }),
  ]

  const cashflow: KpiSpec[] = [
    kpi({
      key: 'advance_value',
      label: 'Valore incassi anticipati',
      level: 0,
      format: 'currency',
      tone: 'higher',
      agg: 'sum',
      monthly: cashflowSeries('advancePaymentsValue'),
      budgetKey: 'cashflow.advance_payments',
    }),
    kpi({
      key: 'advance_pct',
      label: '% incassi anticipati',
      level: 0,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      monthly: cashflowSeries('advancePaymentsPct', true),
      budgetKey: 'cashflow.advance_payments_pct',
    }),
    kpi({ key: 'credits', label: 'Valore crediti', level: 0, format: 'currency', tone: 'neutral', agg: 'last', hasChildren: true, monthly: cashflowSeries('credits') }),
    ...credit('credit_planned', 'di cui € crediti pianificati', 'plannedReceivables', 'neutral'),
    ...credit('credit_unplanned', 'di cui € crediti non pianificati', 'unplannedReceivables', 'neutral'),
    ...credit('credit_overdue', 'di cui € crediti scaduti', 'overdueReceivables', 'lower'),
    ...credit('credit_third', 'di cui € terzo pagante', 'thirdPartyPayerReceivables', 'neutral'),
    kpi({ key: '_revenue', label: 'Ricavi del trimestre', level: 0, format: 'currency', tone: 'neutral', agg: 'sum', hidden: true, quarterly: quarterRevenueSeries }),
  ]

  return [
    { key: 'traffico', title: 'Saturazione: traffico', description: 'Prime visite per canale e pazienti riattivati', specs: traffico },
    { key: 'preventivi', title: 'Customer experience: preventivi', description: 'Emessi, confermati, persi, valori medi e % di chiusura', specs: preventivi },
    {
      key: 'produzione',
      title: 'Saturazione: produzione',
      description: 'Produzione eseguita per tipologia, quota del titolare, igiene e saturazione',
      specs: produzione,
      forecastAfter: 'titolare_share',
    },
    { key: 'cashflow', title: 'Cashflow', description: 'Incassi anticipati e crediti (fotografia di fine periodo)', specs: cashflow },
    { key: 'economics', title: 'Economics: conto economico', description: 'Ricavi, costi, MDC e MOL: incidenza sui ricavi e scostamento in punti percentuali', specs: [], pl: true },
  ]
}

// ---------- calcolo ----------

interface RowCalc {
  q: Series
  year: number | null
}

function calcSpec(spec: KpiSpec, d: YearData, periods: string[], accounts: PlAccount[], year: number, store: Map<string, RowCalc>): RowCalc {
  let q: Series
  if (spec.ratio) {
    const num = store.get(spec.ratio.num)
    const den = store.get(spec.ratio.den)
    q = [0, 1, 2, 3].map((i) => {
      const n = num?.q[i]
      const dn = den?.q[i]
      return n != null && dn != null && dn > 0 ? n / dn : null
    })
  } else if (spec.quarterly) {
    q = spec.quarterly(d, periods, accounts, year)
  } else {
    const monthly = (spec.monthly as SeriesFn)(d, periods, accounts, year)
    q = [0, 1, 2, 3].map((i) => quarterOf(monthly, i, spec.agg))
  }
  return { q, year: spec.noYear ? null : aggregate(q, spec.agg) }
}

function runSpecs(specs: KpiSpec[], d: YearData, year: number, accounts: PlAccount[]): Map<string, RowCalc> {
  const periods = allMonthsOfYear(year)
  const store = new Map<string, RowCalc>()
  for (const spec of specs.filter((s) => !s.ratio)) store.set(spec.key, calcSpec(spec, d, periods, accounts, year, store))
  for (const spec of specs.filter((s) => s.ratio)) store.set(spec.key, calcSpec(spec, d, periods, accounts, year, store))
  return store
}

const devOf = (value: number | null, ref: number | null, format: DashFormat): Dev | null =>
  value != null && ref != null ? { value: value - ref, kind: format === 'percent' ? 'pp' : 'abs' } : null

function kpiRow(spec: KpiSpec, cur: RowCalc, prior: RowCalc | undefined, targets: KpiTarget[], periods: string[]): DashRow {
  const budgetMonthly: Series = spec.budgetFn ? spec.budgetFn(targets, periods) : spec.budgetKey ? targetSeries(spec.budgetKey)(targets, periods) : []
  const hasBudget = budgetMonthly.some(nonNull)
  const quarterBudget = (i: number): number | null => (hasBudget ? quarterOf(budgetMonthly, i, spec.agg) : null)
  const annualBudget = hasBudget ? aggregate([0, 1, 2, 3].map(quarterBudget), spec.agg) : null

  const afpYear = prior?.year ?? null
  const isSum = spec.agg === 'sum'
  const afpPerQuarter = afpYear != null ? (isSum ? afpYear / 4 : afpYear) : null

  let running: number | null = null
  const quarters: DashCell[] = [0, 1, 2, 3].map((i) => {
    const value = cur.q[i]
    if (isSum && value != null) running = (running ?? 0) + value
    const qb = quarterBudget(i)
    return {
      value,
      pct: null,
      dAfp: devOf(value, afpPerQuarter, spec.format),
      dBdgt: devOf(value, qb, spec.format),
      progressive: isSum && value != null ? running : null,
    }
  })

  // anno: confronto alla pari sui soli trimestri con dato
  const withData = [0, 1, 2, 3].filter((i) => cur.q[i] != null)
  const afpRef = afpYear == null ? null : isSum ? (afpYear / 4) * withData.length : afpYear
  const budgetParts = withData.map(quarterBudget).filter(nonNull)
  const budgetRef = !budgetParts.length ? null : isSum ? sumOf(budgetParts) : meanOf(budgetParts)

  return {
    key: spec.key,
    label: spec.label,
    level: spec.level,
    format: spec.format,
    tone: spec.tone,
    emphasis: spec.emphasis,
    ancestors: spec.ancestors,
    hasChildren: spec.hasChildren,
    afp: { value: afpYear, perQuarter: isSum && afpYear != null ? afpYear / 4 : null, pct: null },
    budget: annualBudget,
    year: { value: cur.year, pct: null, dAfp: devOf(cur.year, afpRef, spec.format), dBdgt: devOf(cur.year, budgetRef, spec.format), progressive: null },
    quarters,
  }
}

function plRows(input: DashInput): DashRow[] {
  const { accounts, year } = input
  const afp = resolveAfp({ year, accounts, priorPl: input.prior.pl, afpBaseline: input.afpBaseline, kpiBaseline: input.kpiBaseline })
  const quarterCols = buildColumns('quarter', input.current.pl, accounts, year)
  const cumCols = buildColumns('cumulative', input.current.pl, accounts, year)
  const lastCum = [...cumCols].reverse().find((c) => c.available) ?? null
  const defs = buildRowDefs(accounts)

  const toDev = (cell: ReturnType<typeof cellFor>): Dev | null =>
    cell.delta == null || cell.deltaKind == null ? null : { value: cell.delta, kind: cell.deltaKind === 'relative' ? 'rel' : 'pp' }

  const costKinds = new Set(['variable', 'fixed', 'variable_total', 'fixed_total'])
  const ancestorsOf = (def: (typeof defs)[number]): string[] => {
    if (def.kind === 'variable') return ['variable_total']
    if (def.kind === 'fixed') return ['fixed_total']
    return []
  }

  return defs.map((def): DashRow => {
    const afpCell = afp.column ? cellFor(def, afp.column, null) : null
    const quarters: DashCell[] = quarterCols.map((col, i) => {
      const cell = cellFor(def, col, afp.column)
      const cum = cellFor(def, cumCols[i], afp.column)
      return { value: cell.value, pct: cell.pct, dAfp: toDev(cell), dBdgt: null, progressive: cum.value }
    })
    const yearCell = lastCum ? cellFor(def, lastCum, afp.column) : null
    const isTotal = def.kind === 'variable_total' || def.kind === 'fixed_total'
    return {
      key: `pl:${def.key}`,
      label: def.label,
      level: def.kind === 'variable' || def.kind === 'fixed' ? 1 : 0,
      format: 'currency',
      tone: higherIsBetter(def.kind) ? 'higher' : costKinds.has(def.kind) ? 'lower' : 'neutral',
      emphasis: def.kind === 'mdc' || def.kind === 'mol' || def.kind === 'revenue',
      ancestors: ancestorsOf(def).map((a) => `pl:${a}`),
      hasChildren: isTotal,
      hidePct: def.kind === 'revenue',
      afp: { value: afpCell?.value ?? null, perQuarter: null, pct: afpCell?.pct ?? null },
      budget: null,
      year: {
        value: yearCell?.value ?? null,
        pct: yearCell?.pct ?? null,
        dAfp: yearCell ? toDev(yearCell) : null,
        dBdgt: null,
        progressive: null,
      },
      quarters,
    }
  })
}

export function buildAnalyticDashboard(input: DashInput): DashSection[] {
  const defs = buildSectionDefs(input)
  const periods = allMonthsOfYear(input.year)
  const out: DashSection[] = []

  for (const def of defs) {
    if (def.pl) {
      out.push({ key: def.key, title: def.title, description: def.description, rows: plRows(input) })
      continue
    }
    const curStore = runSpecs(def.specs, input.current, input.year, input.accounts)
    const priorStore = runSpecs(def.specs, input.prior, input.year - 1, input.accounts)
    const rows: DashRow[] = []
    for (const spec of def.specs) {
      if (spec.hidden) continue
      rows.push(kpiRow(spec, curStore.get(spec.key) as RowCalc, priorStore.get(spec.key), input.targets, periods))
      if (def.forecastAfter === spec.key) {
        const prod = curStore.get('production_total')
        let running = 0
        const quarters: DashCell[] = [0, 1, 2, 3].map((i) => {
          const v = prod?.q[i] ?? null
          if (v == null) return { value: null, pct: null, dAfp: null, dBdgt: null, progressive: null }
          running += v
          return { value: i < 3 ? (running * 4) / (i + 1) : null, pct: null, dAfp: null, dBdgt: null, progressive: null }
        })
        rows.push({
          key: 'production_forecast',
          label: 'Valore produzione eseguita — proiezione a fine anno',
          level: 0,
          format: 'currency',
          tone: 'neutral',
          ancestors: [],
          forecast: true,
          afp: { value: null, perQuarter: null, pct: null },
          budget: null,
          year: { value: null, pct: null, dAfp: null, dBdgt: null, progressive: null },
          quarters,
        })
      }
    }
    out.push({ key: def.key, title: def.title, description: def.description, rows })
  }
  return out
}
