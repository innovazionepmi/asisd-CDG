import { EXCEL_KINDS } from './analyticExcelMap'
import { allMonthsOfYear } from './periods'
import { buildColumns, buildRowDefs, cellFor, compute, higherIsBetter, resolveAfp, valuesForQuarters, type PlColumn, type PlRowDef } from './plStatement'
import type {
  CashflowMonthly,
  Channel,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  KpiTarget,
  ManualColKey,
  ManualValue,
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

// "Dashboard analitica": replica del foglio "Aggregato Trimestrale" dell'Excel
// ASISD, con TUTTE le righe e TUTTE le 22 colonne del foglio:
//   B  Totale AFP            C  Media trim. AFP        E  Totale/media anno
//   F  Scost. tot vs AFP     G  Budget                 H  Scost. tot vs budget
//   per ciascun trimestre:   valore trimestrale | scost. vs media AFP |
//                            scost. vs budget del trimestre | valore progressivo
// Il tipo di ogni cella (valore / non applicabile) e' preso dai colori del foglio
// (analyticExcelMap.ts). La dashboard MOSTRA soltanto: i dati si inseriscono nelle
// pagine dedicate e nel nodo "Inserimento dati" (manual_values).
//
// Fonti, in ordine di priorita':
//  - valori: dati mensili/trimestrali; per le righe senza fonte mensile (C.A.C.,
//    V.M.P., nuclei familiari, valore atteso, produzione da eseguire) i valori
//    trimestrali del nodo Inserimento dati;
//  - AFP: dati reali dell'anno precedente > AFP inserito a mano > derivato (somma
//    dei figli, rapporto fra due righe);
//  - budget: obiettivi mensili (kpi_targets) > budget annuo inserito a mano > derivato.
// Regole (dall'Excel): trimestre = somma dei mesi (conteggi/valuta), media dei mesi
// con dato (percentuali), ultimo mese con dato (crediti); anno = somma o media dei
// trimestri; K = valore - media trimestrale AFP (AFP/4 per le somme, AFP per
// percentuali e valori medi); progressivo = cumulato da inizio anno. Scostamenti
// dell'anno "alla pari": solo sui trimestri con dato.
// Differenze volute dall'Excel (docs/STATUS.md): budget del trimestre dagli obiettivi
// mensili quando esistono; per percentuali e valori medi il budget non si divide per
// 4; "in corso" sempre calcolato (portafoglio + emessi - confermati - persi) con i
// segni corretti; C.A.C./V.M.P. con il margine (MDC%) dello stesso periodo;
// saturazione e prima visita su mesi corretti; crediti = somma di tutte le componenti.

export const COLS = 22
export type ColGroup = 'afp' | 'year' | 'budget' | 'q0' | 'q1' | 'q2' | 'q3'
export const COL_GROUP: ColGroup[] = ['afp', 'afp', 'year', 'year', 'budget', 'budget', ...(['q0', 'q1', 'q2', 'q3'] as ColGroup[]).flatMap((g) => [g, g, g, g])]
const qBase = (q: number) => 6 + q * 4

export type CellFmt = 'count' | 'currency' | 'percent' | 'text'
export type DevKind = 'abs' | 'pp' | 'rel'
export type CellKind = 'calc' | 'na' | 'blank'
export type Tone = 'higher' | 'lower' | 'neutral'
export type RefSource = 'real' | 'targets' | 'manual' | 'derived' | null

export interface SheetCell {
  kind: CellKind
  value: number | null
  text?: string
  fmt: CellFmt
  /** Se valorizzato la cella e' uno scostamento. */
  dev?: DevKind
}

/** Origine dei riferimenti di una riga (serve al nodo Inserimento dati). */
export interface RefInfo {
  value: number | null
  src: RefSource
  /** Il foglio prevede questo riferimento per la riga (cella non grigia). */
  applicable: boolean
}

export interface SheetRow {
  key: string
  label: string
  level: 0 | 1 | 2
  ancestors: string[]
  hasChildren?: boolean
  tone: Tone
  emphasis?: 'total' | 'mdc'
  cells: SheetCell[]
  ref?: { afp: RefInfo; budget: RefInfo; format: 'count' | 'currency' | 'percent'; rowKey?: string; monthlyBudget?: string; manualQ?: boolean; manualYear?: boolean; cfmp?: boolean }
}

export interface HeaderCol {
  label: string
  group: ColGroup
}
export interface SheetHeaders {
  groups: { label: string; span: number; group: ColGroup }[]
  cols: HeaderCol[]
}
export interface SheetSection {
  key: string
  title: string
  description: string
  headers: SheetHeaders
  rows: SheetRow[]
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

export interface SheetInput {
  year: number
  channels: Channel[]
  categories: TreatmentCategory[]
  accounts: PlAccount[]
  current: YearData
  prior: YearData
  targets: KpiTarget[]
  /** Valori del nodo Inserimento dati per l'anno analizzato. */
  manual: ManualValue[]
  /** Target CFMP/saturazione della configurazione studio (budget della riga CFMP/saturazione). */
  cfmpTarget: number | null
  afpBaseline: PlPriorYearBaseline[]
  kpiBaseline: KpiPriorYearBaseline[]
}

type Series = (number | null)[]
type Agg = 'sum' | 'avg' | 'last'
type Fmt = 'count' | 'currency' | 'percent'
type ManualFn = (rowKey: string, col: ManualColKey) => number | null

const nonNull = (v: number | null | undefined): v is number => v != null
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

// ---------- dataset (anno corrente o anno precedente) ----------

interface Calc {
  q: Series
  year: number | null
}
type Store = Map<string, Calc>

interface Ctx {
  d: YearData
  periods: string[]
  st: Store
  /** Valori manuali: solo per l'anno analizzato (null per l'anno precedente). */
  manual: ManualFn | null
  revenueQ: Series
  mdcPctQ: Series
  mdcPctYear: number | null
  cfmp: number | null
}

interface Spec {
  key: string
  label: string
  level: 0 | 1 | 2
  ancestors: string[]
  hasChildren?: boolean
  xl: number
  format: Fmt
  tone: Tone
  agg: Agg
  /** Serie mensile (12 valori, null = nessun dato). */
  monthly?: (d: YearData, periods: string[]) => Series
  /** Serie trimestrale derivata da altre righe (seconda passata). */
  qfn?: (c: Ctx) => Series
  yearFn?: (c: Ctx) => number | null
  /** Valori trimestrali inseriti a mano (q1..q4). */
  manualQ?: boolean
  /** Valore annuale inserito a mano (es. portafoglio di inizio anno). */
  manualYear?: boolean
  /** CFMP: solo valore manuale dell'anno precedente, riportato nella colonna Anno. */
  cfmp?: boolean
  /** Riga "OK / NON OK" calcolata da un'altra riga. */
  statusOf?: string
  budgetKey?: string
  budgetFn?: (targets: KpiTarget[], periods: string[]) => Series
  afpDerive?: (r: Resolver) => number | null
  budgetDerive?: (r: Resolver) => number | null
}

interface Resolver {
  afp: (key: string) => number | null
  budget: (key: string) => number | null
  afpRevenue: number | null
  afpMdcPct: number | null
  budgetRevenue: number | null
}

// ---------- serie mensili ----------

const visitsSeries = (pred: (id: string) => boolean) => (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const rows = d.visits.filter((v) => v.periodMonth === p && pred(v.channelId))
    return rows.length ? sumOf(rows.map((v) => v.visitCount)) : null
  })

type QuoteField = 'issuedCount' | 'issuedValue' | 'confirmedCount' | 'confirmedValue' | 'lostCount' | 'lostValue'
const quotesSeries = (field: QuoteField, pv?: boolean) => (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const rows = d.quotes.filter((q) => q.periodMonth === p && (!pv || q.patientSegment === 'new_patient'))
    return rows.length ? sumOf(rows.map((q) => q[field])) : null
  })

const closeRateSeries = (pv?: boolean) => (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const rows = d.quotes.filter((q) => q.periodMonth === p && (!pv || q.patientSegment === 'new_patient'))
    const issued = sumOf(rows.map((q) => q.issuedCount))
    return rows.length && issued > 0 ? sumOf(rows.map((q) => q.confirmedCount)) / issued : null
  })

const productionSeries = (categoryId?: string) => (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const rows = d.production.filter((r) => r.periodMonth === p && (!categoryId || r.treatmentCategoryId === categoryId))
    return rows.length ? sumOf(rows.map((r) => r.productionValue)) : null
  })

const titolareSeries = (d: YearData, periods: string[]): Series => periods.map((p) => d.titolare.find((r) => r.periodMonth === p)?.productionValue ?? null)

const titolareShareSeries = (d: YearData, periods: string[]): Series => {
  const total = productionSeries()(d, periods)
  const tit = titolareSeries(d, periods)
  return periods.map((_, i) => (total[i] != null && tit[i] != null && (total[i] as number) > 0 ? (tit[i] as number) / (total[i] as number) : null))
}

const hygieneSeries = (d: YearData, periods: string[]): Series => periods.map((p) => d.hygiene.find((r) => r.periodMonth === p)?.sessionCount ?? null)

const saturationSeries = (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const v = d.saturation.find((r) => r.periodMonth === p)?.saturationPct
    return v != null && v > 0 ? v : null
  })

type CashField = 'advancePaymentsValue' | 'plannedReceivables' | 'unplannedReceivables' | 'overdueReceivables' | 'thirdPartyPayerReceivables'
const cashSeries = (field: CashField) => (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const r = d.cashflow.find((c) => c.periodMonth === p)
    return r ? r[field] : null
  })

const advancePctMonthlySeries = (d: YearData, periods: string[]): Series =>
  periods.map((p) => {
    const v = d.cashflow.find((c) => c.periodMonth === p)?.advancePaymentsPct
    return v != null && v > 0 ? v : null
  })

// ---------- budget (obiettivi mensili) ----------

const targetSeries = (key: string) => (targets: KpiTarget[], periods: string[]): Series =>
  periods.map((p) => targets.find((t) => t.periodStart === p && t.metricKey === key)?.targetValue ?? null)

const titolareBudget = (targets: KpiTarget[], periods: string[]): Series => {
  const prod = targetSeries('production.total')(targets, periods)
  const share = targetSeries('production.titolare_share')(targets, periods)
  const stored = targetSeries('production.titolare')(targets, periods)
  return periods.map((_, i) => (prod[i] != null && share[i] != null ? (prod[i] as number) * (share[i] as number) : stored[i]))
}

/** Budget ricavi mensile (foglio CashFlow, riga "Ricavi del periodo - Obiettivo"): serie dei 12 mesi. */
const revenueMonthlyBudget = (targets: KpiTarget[], year: number): Series => targetSeries('economics.revenue_monthly')(targets, allMonthsOfYear(year))

/** Obiettivo trimestrale di conto economico (kpi_targets, grana trimestre): somma dei trimestri presenti. */
const quarterlyTargetTotal = (targets: KpiTarget[], year: number, key: string): number | null => {
  const vals = [1, 4, 7, 10]
    .map((m) => targets.find((t) => t.metricKey === key && t.periodStart === `${year}-${String(m).padStart(2, '0')}-01`)?.targetValue)
    .filter(nonNull)
  return vals.length ? sumOf(vals) : null
}

// ---------- definizione delle righe ----------

interface SectionDef {
  key: string
  title: string
  description: string
  specs: Spec[]
}

function S(o: Partial<Spec> & Pick<Spec, 'key' | 'label' | 'xl' | 'format' | 'tone' | 'agg'>): Spec {
  return { level: 0, ancestors: [], ...o }
}

const sumChildren = (keys: string[], pick: 'afp' | 'budget') => (r: Resolver) => {
  const vals = keys.map((k) => r[pick](k)).filter(nonNull)
  return vals.length ? sumOf(vals) : null
}
const ratioOf = (num: string, den: string, pick: 'afp' | 'budget') => (r: Resolver) => {
  const n = r[pick](num)
  const d = r[pick](den)
  return n != null && d != null && d > 0 ? n / d : null
}

function buildSectionDefs(input: SheetInput): SectionDef[] {
  const { channels, categories } = input
  const nonReactivation = channels.filter((c) => c.type !== 'reactivation').sort((a, b) => a.sortOrder - b.sortOrder)
  const reactivationIds = new Set(channels.filter((c) => c.type === 'reactivation').map((c) => c.id))
  const campaigns = nonReactivation.filter((c) => c.type === 'marketing_campaign')
  const others = nonReactivation.filter((c) => c.type !== 'marketing_campaign')
  const campaignIds = new Set(campaigns.map((c) => c.id))
  const nonReactivationIds = new Set(nonReactivation.map((c) => c.id))
  const topChildren = [...others.map((c) => `ch:${c.id}`), ...(campaigns.length ? ['campaigns'] : [])]

  const traffico: Spec[] = [
    S({
      key: 'new_patients',
      label: 'N° Prime Visite Nuovi Pazienti',
      xl: 6,
      format: 'count',
      tone: 'higher',
      agg: 'sum',
      hasChildren: nonReactivation.length > 0,
      monthly: visitsSeries((id) => nonReactivationIds.has(id)),
      budgetKey: 'traffic.new_patients.total',
      afpDerive: sumChildren(topChildren, 'afp'),
      budgetDerive: sumChildren(topChildren, 'budget'),
    }),
    ...others.map((c) =>
      S({
        key: `ch:${c.id}`,
        label: `Di cui Nr ${c.name}`,
        level: 1,
        ancestors: ['new_patients'],
        xl: 7,
        format: 'count',
        tone: 'higher',
        agg: 'sum',
        monthly: visitsSeries((id) => id === c.id),
      }),
    ),
    ...(campaigns.length
      ? [
          S({
            key: 'campaigns',
            label: 'Nr Visite da Campagne MKTG',
            level: 1,
            ancestors: ['new_patients'],
            xl: 10,
            format: 'count',
            tone: 'higher',
            agg: 'sum',
            hasChildren: true,
            monthly: visitsSeries((id) => campaignIds.has(id)),
            afpDerive: sumChildren(campaigns.map((c) => `ch:${c.id}`), 'afp'),
            budgetDerive: sumChildren(campaigns.map((c) => `ch:${c.id}`), 'budget'),
          }),
          ...campaigns.map((c) =>
            S({
              key: `ch:${c.id}`,
              label: `Di cui Nr ${c.name}`,
              level: 2,
              ancestors: ['new_patients', 'campaigns'],
              xl: 11,
              format: 'count',
              tone: 'higher',
              agg: 'sum',
              monthly: visitsSeries((id) => id === c.id),
            }),
          ),
        ]
      : []),
    S({
      key: 'reactivated',
      label: 'Numero Prime Visite Pazienti Riattiv.',
      xl: 13,
      format: 'count',
      tone: 'higher',
      agg: 'sum',
      monthly: visitsSeries((id) => reactivationIds.has(id)),
      budgetKey: 'traffic.reactivated.total',
    }),
    S({ key: 'families', label: 'N° Pazienti Attivati da Nuclei Famigliari', xl: 14, format: 'count', tone: 'higher', agg: 'sum', manualQ: true }),
    S({ key: 'cac_vmp_status', label: 'C.A.C. / V.M.P.', xl: 15, format: 'percent', tone: 'neutral', agg: 'avg', statusOf: 'cac_vmp' }),
    S({
      key: 'cac_vmp',
      label: 'C.A.C. / V.M.P. calcolo',
      xl: 16,
      format: 'percent',
      tone: 'lower',
      agg: 'avg',
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const cac = c.st.get('cac')?.q[i]
        const vmp = c.st.get('vmp')?.q[i]
        const mdc = c.mdcPctQ[i]
        return cac != null && vmp != null && vmp > 0 && mdc != null ? (cac / vmp) * mdc : null
      }),
      yearFn: (c) => {
        const cac = c.st.get('cac')?.year
        const vmp = c.st.get('vmp')?.year
        return cac != null && vmp != null && vmp > 0 && c.mdcPctYear != null ? (cac / vmp) * c.mdcPctYear : null
      },
      afpDerive: (r) => {
        const cac = r.afp('cac')
        const vmp = r.afp('vmp')
        return cac != null && vmp != null && vmp > 0 && r.afpMdcPct != null ? (cac / vmp) * r.afpMdcPct : null
      },
      budgetDerive: (r) => {
        const cac = r.budget('cac')
        const vmp = r.budget('vmp')
        return cac != null && vmp != null && vmp > 0 && r.afpMdcPct != null ? (cac / vmp) * r.afpMdcPct : null
      },
    }),
    S({ key: 'cac', label: 'C.A.C.', xl: 17, format: 'currency', tone: 'lower', agg: 'avg', manualQ: true }),
    S({ key: 'vmp', label: 'V.M.P.', xl: 18, format: 'currency', tone: 'higher', agg: 'avg', manualQ: true }),
  ]

  const pair = (key: string, xl: number, label: string, pvLabel: string, format: Fmt, tone: Tone, field: QuoteField, extra: Partial<Spec> = {}, pvExtra: Partial<Spec> = {}): Spec[] => [
    S({ key, label, xl, format, tone, agg: 'sum', hasChildren: true, monthly: quotesSeries(field), ...extra }),
    S({ key: `${key}_pv`, label: pvLabel, level: 1, ancestors: [key], xl: xl + 1, format, tone, agg: 'sum', monthly: quotesSeries(field, true), ...pvExtra }),
  ]

  const avgPair = (key: string, xl: number, label: string, pvLabel: string, tone: Tone, valueKey: string, countKey: string): Spec[] => [
    S({
      key,
      label,
      xl,
      format: 'currency',
      tone,
      agg: 'avg',
      hasChildren: true,
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const n = c.st.get(valueKey)?.q[i]
        const d = c.st.get(countKey)?.q[i]
        return n != null && d != null && d > 0 ? n / d : null
      }),
      afpDerive: ratioOf(valueKey, countKey, 'afp'),
      budgetDerive: ratioOf(valueKey, countKey, 'budget'),
    }),
    S({
      key: `${key}_pv`,
      label: pvLabel,
      level: 1,
      ancestors: [key],
      xl: xl + 1,
      format: 'currency',
      tone,
      agg: 'avg',
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const n = c.st.get(`${valueKey}_pv`)?.q[i]
        const d = c.st.get(`${countKey}_pv`)?.q[i]
        return n != null && d != null && d > 0 ? n / d : null
      }),
      afpDerive: ratioOf(`${valueKey}_pv`, `${countKey}_pv`, 'afp'),
      budgetDerive: ratioOf(`${valueKey}_pv`, `${countKey}_pv`, 'budget'),
    }),
  ]

  // in corso = portafoglio di inizio anno + emessi - confermati - persi (cumulato)
  const inProgress = (key: string, xl: number, label: string, pv: boolean, kind: 'count' | 'value'): Spec => {
    const sfx = pv ? '_pv' : ''
    const portfolioKey = kind === 'count' ? `q_portfolio_count${sfx}` : `q_portfolio_value${sfx}`
    const [i0, c0, l0] = kind === 'count' ? ['q_issued_count', 'q_confirmed_count', 'q_lost_count'] : ['q_issued_value', 'q_confirmed_value', 'q_lost_value']
    return S({
      key,
      label,
      level: pv ? 1 : 0,
      ancestors: pv ? [kind === 'count' ? 'q_in_progress_count' : 'q_in_progress_value'] : [],
      xl,
      format: kind === 'count' ? 'count' : 'currency',
      tone: 'neutral',
      agg: 'last',
      hasChildren: !pv,
      qfn: (c) => {
        const portfolio = c.manual ? c.manual(portfolioKey, 'year') : null
        if (portfolio == null) return [null, null, null, null]
        let running = portfolio
        return [0, 1, 2, 3].map((i) => {
          const issued = c.st.get(`${i0}${sfx}`)?.q[i]
          if (issued == null) return null
          running += issued - (c.st.get(`${c0}${sfx}`)?.q[i] ?? 0) - (c.st.get(`${l0}${sfx}`)?.q[i] ?? 0)
          return running
        })
      },
    })
  }

  const preventivi: Spec[] = [
    ...pair('q_issued_count', 22, 'Nr Preventivi Emessi (Generali)', 'Di cui Nr Emessi Prima Visita', 'count', 'higher', 'issuedCount', { budgetKey: 'quotes.issued_count' }, { budgetDerive: (r) => r.budget('new_patients') }),
    ...pair('q_confirmed_count', 24, 'Nr Preventivi Confermati (Generali)', 'Di cui Nr Confermati Prima Visita', 'count', 'higher', 'confirmedCount', { budgetKey: 'quotes.confirmed_count' }, {
      budgetDerive: (r) => {
        const base = r.budget('q_issued_count_pv')
        const rate = r.budget('q_close_rate_pv')
        return base != null && rate != null ? base * rate : null
      },
    }),
    ...pair('q_lost_count', 26, 'Nr  Preventivi Persi (Generali)', 'Di cui Nr Persi Prima Visita', 'count', 'lower', 'lostCount'),
    inProgress('q_in_progress_count', 28, 'Nr Preventivi in Corso (Generali)', false, 'count'),
    inProgress('q_in_progress_count_pv', 29, 'Di cui Nr Preventivi in corso Prima Visita', true, 'count'),
    S({ key: 'q_portfolio_count', label: 'Nr Portafoglio Preventivi Inizio Anno', xl: 30, format: 'count', tone: 'neutral', agg: 'last', manualYear: true }),
    S({ key: 'q_portfolio_count_pv', label: 'Di cui Nr Portafoglio Preventivi Inizio Anno P. Visita', xl: 31, format: 'count', tone: 'neutral', agg: 'last', manualYear: true }),
    ...pair('q_issued_value', 32, '€ Preventivi Emessi (Generali)', 'Di cui € Emessi Prima Visita', 'currency', 'higher', 'issuedValue', { budgetKey: 'quotes.issued_value' }, { budgetKey: 'quotes.issued_value_pv' }),
    ...pair('q_confirmed_value', 34, '€ Preventivi Confermati (Generali)', 'Di cui € Confermati Prima Visita', 'currency', 'higher', 'confirmedValue', { budgetKey: 'quotes.confirmed_value' }, { budgetKey: 'quotes.confirmed_value_pv' }),
    ...pair('q_lost_value', 36, '€ Preventivi Persi (Generali)', 'Di cui € Persi Prima Visita', 'currency', 'lower', 'lostValue'),
    inProgress('q_in_progress_value', 38, '€ Preventivi in Corso (Generali)', false, 'value'),
    inProgress('q_in_progress_value_pv', 39, 'Di cui € Preventivi in corso Prima Visita', true, 'value'),
    S({ key: 'q_portfolio_value', label: '€ Portafoglio Preventivi Inizio Anno', xl: 40, format: 'currency', tone: 'neutral', agg: 'last', manualYear: true }),
    S({ key: 'q_portfolio_value_pv', label: 'Di cui € Portafoglio Preventivi Inizio Anno P. Visita', xl: 41, format: 'currency', tone: 'neutral', agg: 'last', manualYear: true }),
    S({ key: 'q_expected_value', label: '€ Valore atteso da Preventivi in Corso', xl: 42, format: 'currency', tone: 'neutral', agg: 'last', manualQ: true }),
    ...avgPair('q_avg_issued', 43, '€ Medio Preventivi Emessi (Generali)', 'Di cui € Medio Prev. Emessi P. Visita', 'higher', 'q_issued_value', 'q_issued_count'),
    ...avgPair('q_avg_confirmed', 45, '€ Medio Preventivi Confermati (Generali)', 'Di cui € Medio Prev. Confermati P. Visita', 'higher', 'q_confirmed_value', 'q_confirmed_count'),
    ...avgPair('q_avg_lost', 47, '€ Medio Preventivi Persi (Generali)', 'Di cui € Medio Preventivi Persi P. Visita', 'lower', 'q_lost_value', 'q_lost_count'),
    S({
      key: 'q_close_rate',
      label: '% Chiusura Preventivi (Generali)',
      xl: 49,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      hasChildren: true,
      monthly: closeRateSeries(),
      budgetKey: 'quotes.close_rate',
    }),
    S({ key: 'q_close_rate_pv', label: 'Di cui % Chiusura Prev P. Visita', level: 1, ancestors: ['q_close_rate'], xl: 50, format: 'percent', tone: 'higher', agg: 'avg', monthly: closeRateSeries(true) }),
  ]

  const produzione: Spec[] = [
    S({
      key: 'production_total',
      label: 'Valore Produzione Eseguita',
      xl: 53,
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
        S({
          key: `cat:${c.id}`,
          label: `Di cui € Produzione Eseguita di ${c.name}`,
          level: 1,
          ancestors: ['production_total'],
          xl: 54,
          format: 'currency',
          tone: 'higher',
          agg: 'sum',
          monthly: productionSeries(c.id),
        }),
      ),
    S({ key: 'titolare', label: 'Valore Produzione Titolare', xl: 63, format: 'currency', tone: 'neutral', agg: 'sum', monthly: titolareSeries, budgetFn: titolareBudget }),
    S({
      key: 'titolare_share',
      label: 'Percentuale di produzione Titolare %',
      xl: 64,
      format: 'percent',
      tone: 'neutral',
      agg: 'avg',
      monthly: titolareShareSeries,
      budgetKey: 'production.titolare_share',
      afpDerive: ratioOf('titolare', 'production_total', 'afp'),
    }),
    S({
      key: 'production_forecast',
      label: 'Valore Produzione Eseguita Proiezione Fine Anno',
      xl: 65,
      format: 'currency',
      tone: 'neutral',
      agg: 'last',
      qfn: (c) => {
        const prod = c.st.get('production_total')
        let running = 0
        return [0, 1, 2, 3].map((i) => {
          const v = prod?.q[i]
          if (v == null) return null
          running += v
          return i < 3 ? (running * 4) / (i + 1) : null
        })
      },
    }),
    S({ key: 'hygiene', label: 'Nr Prestazioni di Igiene', xl: 66, format: 'count', tone: 'higher', agg: 'sum', monthly: hygieneSeries, budgetKey: 'production.hygiene_sessions' }),
    S({ key: 'production_to_execute', label: 'Valore Produzione da Eseguire', xl: 67, format: 'currency', tone: 'neutral', agg: 'last', manualQ: true }),
    S({ key: 'production_portfolio', label: 'Di cui € Portafoglio Produzione Inizio Anno', level: 1, ancestors: ['production_to_execute'], xl: 68, format: 'currency', tone: 'neutral', agg: 'last', manualYear: true }),
    S({
      key: 'cfmp_sat',
      label: 'CFMP/saturazione',
      xl: 69,
      format: 'percent',
      tone: 'neutral',
      agg: 'avg',
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const sat = c.st.get('saturation')?.q[i]
        return c.cfmp != null && sat != null && sat > 0 ? c.cfmp / sat : null
      }),
      afpDerive: (r) => {
        const sat = r.afp('saturation')
        const cfmp = r.afp('cfmp')
        return cfmp != null && sat != null && sat > 0 ? cfmp / sat : null
      },
      budgetDerive: () => input.cfmpTarget,
    }),
    S({ key: 'saturation', label: '% Saturazione Progressiva', xl: 70, format: 'percent', tone: 'higher', agg: 'avg', monthly: saturationSeries, budgetKey: 'production.saturation_pct' }),
    S({ key: 'cfmp', label: 'CFMP', xl: 71, format: 'percent', tone: 'neutral', agg: 'last', cfmp: true }),
  ]

  const creditComp = (key: string, xl: number, label: string, pctLabel: string, field: CashField, tone: Tone, budgetKey?: string): Spec[] => [
    S({ key, label, level: 1, ancestors: ['credits'], xl, format: 'currency', tone, agg: 'last', monthly: cashSeries(field), budgetKey }),
    S({
      key: `${key}_pct`,
      label: pctLabel,
      level: 1,
      ancestors: ['credits'],
      xl: xl + 1,
      format: 'percent',
      tone,
      agg: 'avg',
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const v = c.st.get(key)?.q[i]
        const rev = c.revenueQ[i]
        return v != null && rev != null && rev > 0 ? v / rev : null
      }),
      budgetDerive: (r) => {
        const b = r.budget(key)
        return b != null && r.budgetRevenue != null && r.budgetRevenue > 0 ? b / r.budgetRevenue : null
      },
    }),
  ]

  const cashflow: Spec[] = [
    S({ key: 'advance_value', label: 'Valore Incassi Anticipati', xl: 74, format: 'currency', tone: 'higher', agg: 'sum', monthly: cashSeries('advancePaymentsValue'), budgetKey: 'cashflow.advance_payments' }),
    S({
      key: 'advance_pct',
      label: '% Incassi Anticipati',
      xl: 75,
      format: 'percent',
      tone: 'higher',
      agg: 'avg',
      // come nell'Excel: incassi anticipati / ricavi del trimestre; se il conto economico del
      // trimestre non c'e', il valore % inserito a mano mese per mese (media del trimestre)
      qfn: (c) => {
        const monthly = advancePctMonthlySeries(c.d, c.periods)
        return [0, 1, 2, 3].map((i) => {
          const v = c.st.get('advance_value')?.q[i]
          const rev = c.revenueQ[i]
          return v != null && rev != null && rev > 0 ? v / rev : quarterOf(monthly, i, 'avg')
        })
      },
      budgetKey: 'cashflow.advance_payments_pct',
      afpDerive: (r) => {
        const v = r.afp('advance_value')
        return v != null && r.afpRevenue != null && r.afpRevenue > 0 ? v / r.afpRevenue : null
      },
      budgetDerive: (r) => {
        const b = r.budget('advance_value')
        return b != null && r.budgetRevenue != null && r.budgetRevenue > 0 ? b / r.budgetRevenue : null
      },
    }),
    S({
      key: 'credits',
      label: 'Valore Crediti',
      xl: 76,
      format: 'currency',
      tone: 'neutral',
      agg: 'last',
      hasChildren: true,
      qfn: (c) => [0, 1, 2, 3].map((i) => {
        const parts = ['credit_planned', 'credit_unplanned', 'credit_overdue', 'credit_third'].map((k) => c.st.get(k)?.q[i]).filter(nonNull)
        return parts.length ? sumOf(parts) : null
      }),
      budgetDerive: sumChildren(['credit_planned', 'credit_unplanned', 'credit_overdue', 'credit_third'], 'budget'),
    }),
    ...creditComp('credit_planned', 77, 'Di cui € Crediti Pianificati', '% Crediti Pianificati', 'plannedReceivables', 'neutral'),
    ...creditComp('credit_unplanned', 79, 'Di cui € Crediti NON - Pianificati', '% Crediti NON - Pianificati', 'unplannedReceivables', 'neutral'),
    ...creditComp('credit_overdue', 81, 'Di cui € Crediti Scaduti', '% Crediti Scaduti', 'overdueReceivables', 'lower', 'cashflow.credits_overdue'),
    ...creditComp('credit_third', 83, 'Di cui € Terzo Pagante', '% Terzo Pagante', 'thirdPartyPayerReceivables', 'neutral'),
    S({ key: 'credit_portfolio', label: 'Di cui € Portafoglio Crediti Inizio Anno', level: 1, ancestors: ['credits'], xl: 85, format: 'currency', tone: 'neutral', agg: 'last', manualYear: true }),
  ]

  return [
    { key: 'traffico', title: 'Saturazione: traffico', description: 'Prime visite per canale, riattivati, nuclei familiari, C.A.C. / V.M.P.', specs: traffico },
    { key: 'preventivi', title: 'Customer experience: preventivi generali', description: 'Emessi, confermati, persi, in corso, valori, valori medi e % di chiusura', specs: preventivi },
    { key: 'produzione', title: 'Saturazione: produzione', description: 'Produzione per tipologia, quota titolare, proiezione, igiene, CFMP e saturazione', specs: produzione },
    { key: 'cashflow', title: 'Cashflow', description: 'Incassi anticipati e crediti', specs: cashflow },
  ]
}

// ---------- calcolo dei dataset ----------

function plQuarterMetrics(d: YearData, year: number, accounts: PlAccount[]) {
  const revenueQ: Series = []
  const mdcPctQ: Series = []
  for (let q = 1; q <= 4; q++) {
    const key = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
    const hasData = d.pl.some((r) => r.periodQuarter === key && r.amount !== 0)
    const c = compute(valuesForQuarters(d.pl, year, q, q), accounts)
    revenueQ.push(hasData && c.revenue > 0 ? c.revenue : null)
    mdcPctQ.push(hasData && c.revenue > 0 ? c.mdc / c.revenue : null)
  }
  let last = 0
  for (let q = 4; q >= 1; q--) {
    if (revenueQ[q - 1] != null) {
      last = q
      break
    }
  }
  const ytd = last ? compute(valuesForQuarters(d.pl, year, 1, last), accounts) : null
  return { revenueQ, mdcPctQ, mdcPctYear: ytd && ytd.revenue > 0 ? ytd.mdc / ytd.revenue : null }
}

function runDataset(specs: Spec[], d: YearData, year: number, accounts: PlAccount[], manual: ManualFn | null): Store {
  const periods = allMonthsOfYear(year)
  const st: Store = new Map()
  const ctx: Ctx = { d, periods, st, manual, ...plQuarterMetrics(d, year, accounts), cfmp: manual ? manual('cfmp', 'afp') : null }
  const finish = (spec: Spec, q: Series) => st.set(spec.key, { q, year: spec.yearFn ? spec.yearFn(ctx) : aggregate(q, spec.agg) })

  for (const spec of specs.filter((s) => !s.qfn)) {
    if (spec.monthly) {
      const monthly = spec.monthly(d, periods)
      finish(spec, [0, 1, 2, 3].map((i) => quarterOf(monthly, i, spec.agg)))
    } else if (spec.manualQ) {
      finish(spec, [1, 2, 3, 4].map((n) => (manual ? manual(spec.key, `q${n}` as ManualColKey) : null)))
    } else if (spec.manualYear) {
      st.set(spec.key, { q: [null, null, null, null], year: manual ? manual(spec.key, 'year') : null })
    } else if (spec.cfmp) {
      st.set(spec.key, { q: [null, null, null, null], year: ctx.cfmp })
    } else {
      st.set(spec.key, { q: [null, null, null, null], year: null })
    }
  }
  for (const spec of specs.filter((s) => s.qfn)) finish(spec, (spec.qfn as (c: Ctx) => Series)(ctx))
  return st
}

// ---------- celle ----------

const blank = (fmt: CellFmt = 'count'): SheetCell => ({ kind: 'blank', value: null, fmt })
const na = (fmt: CellFmt = 'count'): SheetCell => ({ kind: 'na', value: null, fmt })

function devCell(value: number | null, ref: number | null, fmt: Fmt): SheetCell {
  return { kind: 'calc', value: value != null && ref != null ? value - ref : null, fmt, dev: fmt === 'percent' ? 'pp' : 'abs' }
}

function kpiRows(
  specs: Spec[],
  cur: Store,
  prior: Store,
  input: SheetInput,
  manual: ManualFn,
  afpPl: { revenue: number | null; mdcPct: number | null },
  budgetRevenue: number | null,
): SheetRow[] {
  const periods = allMonthsOfYear(input.year)
  const byKey = new Map(specs.map((s) => [s.key, s]))
  const afpMemo = new Map<string, { value: number | null; src: RefSource }>()
  const budgetMemo = new Map<string, { value: number | null; src: RefSource; monthly: Series | null }>()

  const resolver: Resolver = {
    afp: (k) => afpOf(k).value,
    budget: (k) => budgetOf(k).value,
    afpRevenue: afpPl.revenue,
    afpMdcPct: afpPl.mdcPct,
    budgetRevenue,
  }
  // AFP: dato reale dell'anno precedente > valore inserito a mano > derivato
  function afpOf(key: string): { value: number | null; src: RefSource } {
    const hit = afpMemo.get(key)
    if (hit) return hit
    afpMemo.set(key, { value: null, src: null }) // protezione da cicli
    const spec = byKey.get(key)
    let res: { value: number | null; src: RefSource } = { value: null, src: null }
    const real = spec && !spec.cfmp && !spec.manualQ && !spec.manualYear ? (prior.get(key)?.year ?? null) : null
    if (real != null) res = { value: real, src: 'real' }
    else if (spec) {
      const man = manual(key, 'afp')
      if (man != null) res = { value: man, src: 'manual' }
      else {
        const der = spec.afpDerive ? spec.afpDerive(resolver) : null
        if (der != null) res = { value: der, src: 'derived' }
      }
    }
    afpMemo.set(key, res)
    return res
  }
  // Budget: obiettivi mensili > budget annuo inserito a mano > derivato
  function budgetOf(key: string): { value: number | null; src: RefSource; monthly: Series | null } {
    const hit = budgetMemo.get(key)
    if (hit) return hit
    budgetMemo.set(key, { value: null, src: null, monthly: null })
    const spec = byKey.get(key)
    let res: { value: number | null; src: RefSource; monthly: Series | null } = { value: null, src: null, monthly: null }
    if (spec) {
      const monthly = spec.budgetFn ? spec.budgetFn(input.targets, periods) : spec.budgetKey ? targetSeries(spec.budgetKey)(input.targets, periods) : null
      if (monthly && monthly.some(nonNull)) {
        res = { value: aggregate([0, 1, 2, 3].map((i) => quarterOf(monthly, i, spec.agg)), spec.agg), src: 'targets', monthly }
      } else {
        const man = manual(key, 'budget')
        if (man != null) res = { value: man, src: 'manual', monthly: null }
        else {
          const der = spec.budgetDerive ? spec.budgetDerive(resolver) : null
          if (der != null) res = { value: der, src: 'derived', monthly: null }
        }
      }
    }
    budgetMemo.set(key, res)
    return res
  }

  const rows = specs.map((spec): SheetRow => {
    const mask = EXCEL_KINDS[spec.xl] ?? ''.padEnd(COLS, '.')
    const c = cur.get(spec.key) as Calc
    const isSum = spec.agg === 'sum'
    const fmt = spec.format
    const afp = afpOf(spec.key)
    const bud = budgetOf(spec.key)

    const qBudget = (i: number): number | null => {
      if (bud.monthly) return quarterOf(bud.monthly, i, spec.agg)
      if (bud.value == null) return null
      return isSum ? bud.value / 4 : bud.value
    }
    const withData = [0, 1, 2, 3].filter((i) => c.q[i] != null)
    const afpPerQ = afp.value != null ? (isSum ? afp.value / 4 : afp.value) : null
    const afpRef = afp.value == null ? null : isSum ? (afp.value / 4) * withData.length : afp.value
    const bParts = withData.map(qBudget).filter(nonNull)
    const budgetRef = !bParts.length ? null : isSum ? sumOf(bParts) : meanOf(bParts)

    const cells: SheetCell[] = []
    // la maschera del foglio decide se la cella e' applicabile (grigia = non applicabile)
    const put = (i: number, cell: SheetCell) => {
      cells[i] = mask[i] === 'x' ? na(cell.fmt) : mask[i] === '.' ? blank(cell.fmt) : cell
    }
    const val = (value: number | null): SheetCell => ({ kind: 'calc', value, fmt })

    put(0, val(afp.value))
    put(1, val(isSum && afp.value != null ? afp.value / 4 : null))
    put(2, val(c.year))
    put(3, devCell(c.year, afpRef, fmt))
    put(4, val(bud.value))
    put(5, devCell(c.year, budgetRef, fmt))

    let running: number | null = null
    for (let i = 0; i < 4; i++) {
      const base = qBase(i)
      const v = c.q[i]
      if (isSum && v != null) running = (running ?? 0) + v
      put(base, val(v))
      put(base + 1, devCell(v, afpPerQ, fmt))
      put(base + 2, devCell(v, qBudget(i), fmt))
      put(base + 3, val(isSum && v != null ? running : null))
    }
    return {
      key: spec.key,
      label: spec.label,
      level: spec.level,
      ancestors: spec.ancestors,
      hasChildren: spec.hasChildren,
      tone: spec.tone,
      cells,
      ref: {
        afp: { value: afp.value, src: afp.src, applicable: mask[0] !== 'x' },
        budget: { value: bud.value, src: bud.src, applicable: mask[4] !== 'x' },
        format: fmt,
        monthlyBudget: spec.budgetFn ? 'derived' : spec.budgetKey,
        manualQ: spec.manualQ,
        manualYear: spec.manualYear,
        cfmp: spec.cfmp,
      },
    }
  })

  // riga stato "OK / NON OK" (C.A.C. / V.M.P.): dalla riga di calcolo (<= 100% = OK)
  for (const spec of specs.filter((s) => s.statusOf)) {
    const src = rows.find((r) => r.key === spec.statusOf)
    const row = rows.find((r) => r.key === spec.key)
    if (!src || !row) continue
    const mask = EXCEL_KINDS[spec.xl] ?? ''.padEnd(COLS, '.')
    const idxs = new Set([0, 2, ...[0, 1, 2, 3].map(qBase)])
    row.cells = row.cells.map((_, i) => {
      if (mask[i] === 'x') return na('text')
      if (!idxs.has(i)) return blank('text')
      const v = src.cells[i].value
      return { kind: 'calc', value: null, text: v == null ? undefined : v <= 1 ? 'OK' : 'NON OK', fmt: 'text' }
    })
  }
  return rows
}

// ---------- conto economico ----------

type PlBlock = 'cumulative' | 'quarter' | 'forecast'
const maskRowFor = (start: number, kind: PlRowDef['kind']) =>
  start + (kind === 'revenue' ? 0 : kind === 'variable' ? 1 : kind === 'variable_total' ? 7 : kind === 'mdc' ? 8 : kind === 'fixed' ? 9 : kind === 'fixed_total' ? 14 : 15)

const plBudgetKey = (def: PlRowDef) => (def.kind === 'revenue' ? 'pl:revenue' : def.kind === 'mol' ? 'pl:mol' : null)

function plRows(input: SheetInput, block: PlBlock, manual: ManualFn): SheetRow[] {
  const { accounts, year } = input
  const afp = resolveAfp({ year, accounts, priorPl: input.prior.pl, afpBaseline: input.afpBaseline, kpiBaseline: input.kpiBaseline })
  const cols = buildColumns(block, input.current.pl, accounts, year)
  const cumCols = buildColumns('cumulative', input.current.pl, accounts, year)
  const lastCum = [...cumCols].reverse().find((c) => c.available) ?? null
  const nQuarters = cumCols.filter((c) => c.available).length
  const start = block === 'cumulative' ? 90 : block === 'quarter' ? 109 : 128
  const defs = buildRowDefs(accounts)
  const costKinds = new Set(['variable', 'fixed', 'variable_total', 'fixed_total'])

  // ricavi: budget MENSILE (annuo = somma dei mesi, cumulato esatto per trimestre);
  // ricavi e MOL: obiettivi trimestrali (kpi_targets) > valore inserito a mano
  const revMonthly = revenueMonthlyBudget(input.targets, year)
  const hasRevMonthly = revMonthly.some(nonNull)
  const revMonthsUpTo = (n: number) => sumOf(revMonthly.slice(0, n).filter(nonNull))
  const budgetFor = (def: PlRowDef): number | null => {
    const key = plBudgetKey(def)
    if (!key) return null
    if (def.kind === 'revenue' && hasRevMonthly) return revMonthsUpTo(12)
    const fromTargets = quarterlyTargetTotal(input.targets, year, def.kind === 'revenue' ? 'economics.revenue' : 'economics.mol')
    return fromTargets ?? manual(key, 'budget')
  }
  const rel = (v: number | null, ref: number | null): SheetCell => ({
    kind: 'calc',
    value: v != null && ref != null && ref !== 0 ? (v - ref) / ref : null,
    fmt: 'currency',
    dev: 'rel',
  })

  return defs.map((def): SheetRow => {
    const mask = EXCEL_KINDS[maskRowFor(start, def.kind)] ?? ''.padEnd(COLS, '.')
    const cells: SheetCell[] = Array.from({ length: COLS }, () => blank('currency'))
    const set = (i: number, cell: SheetCell) => {
      cells[i] = mask[i] === 'x' ? na(cell.fmt) : cell
    }
    const budget = budgetFor(def)

    const afpCell = afp.column ? cellFor(def, afp.column, null) : null
    set(0, { kind: 'calc', value: afpCell?.value ?? null, fmt: 'currency' })
    set(1, { kind: 'calc', value: afpCell?.pct ?? null, fmt: 'percent' })

    if (block === 'cumulative') {
      const yearCell = lastCum ? cellFor(def, lastCum, afp.column) : null
      const fullYear = nQuarters === 4
      set(2, { kind: 'calc', value: yearCell?.value ?? null, fmt: 'currency' })
      set(3, rel(fullYear ? (yearCell?.value ?? null) : null, afpCell?.value ?? null))
      set(4, { kind: 'calc', value: budget, fmt: 'currency' })
      set(5, rel(yearCell?.value ?? null, def.kind === 'revenue' && hasRevMonthly ? revMonthsUpTo(nQuarters * 3) : budget != null ? (budget * nQuarters) / 4 : null))
    }

    for (let i = 0; i < 4; i++) {
      const base = qBase(i)
      const col: PlColumn | undefined = cols[i]
      if (!col) {
        for (let k = 0; k < 4; k++) cells[base + k] = blank('currency')
        continue
      }
      const cell = cellFor(def, col, afp.column)
      set(base, { kind: 'calc', value: col.available ? cell.value : null, fmt: 'currency' })
      set(base + 1, { kind: 'calc', value: col.available ? cell.pct : null, fmt: 'percent' })
      const monthlyRev = def.kind === 'revenue' && hasRevMonthly
      const quarterBudget = monthlyRev
        ? block === 'cumulative'
          ? revMonthsUpTo((i + 1) * 3)
          : revMonthsUpTo((i + 1) * 3) - revMonthsUpTo(i * 3)
        : budget != null
          ? block === 'cumulative'
            ? (budget * (i + 1)) / 4
            : budget / 4
          : null
      if (def.kind === 'revenue' && block === 'cumulative' && quarterBudget != null) {
        set(base + 2, rel(col.available ? cell.value : null, quarterBudget))
      } else {
        set(base + 2, { kind: 'calc', value: col.available && cell.delta != null ? cell.delta : null, fmt: 'percent', dev: cell.deltaKind === 'relative' ? 'rel' : 'pp' })
      }
      if (block !== 'forecast') set(base + 3, { kind: 'calc', value: def.kind === 'revenue' ? quarterBudget : null, fmt: 'currency' })
    }

    const plKeyForRef = plBudgetKey(def)
    return {
      key: `${block}:${def.key}`,
      label: def.label,
      level: def.kind === 'variable' || def.kind === 'fixed' ? 1 : 0,
      ancestors: def.kind === 'variable' ? [`${block}:variable_total`] : def.kind === 'fixed' ? [`${block}:fixed_total`] : [],
      hasChildren: def.kind === 'variable_total' || def.kind === 'fixed_total',
      tone: higherIsBetter(def.kind) ? 'higher' : costKinds.has(def.kind) ? 'lower' : 'neutral',
      emphasis: def.kind === 'mdc' || def.kind === 'mol' ? 'mdc' : def.kind === 'revenue' ? 'total' : undefined,
      cells,
      ref:
        block === 'cumulative' && plKeyForRef
          ? {
              afp: { value: afpCell?.value ?? null, src: afp.source === 'none' ? null : afp.source === 'real' ? 'real' : 'manual', applicable: false },
              budget: {
                value: budget,
                src: (def.kind === 'revenue' && hasRevMonthly) || quarterlyTargetTotal(input.targets, year, def.kind === 'revenue' ? 'economics.revenue' : 'economics.mol') != null ? 'targets' : budget != null ? 'manual' : null,
                applicable: true,
              },
              monthlyBudget: def.kind === 'revenue' ? 'economics.revenue_monthly' : undefined,
              format: 'currency',
              rowKey: plKeyForRef,
            }
          : undefined,
    }
  })
}

// ---------- intestazioni ----------

const QUARTER_TITLES = ['PRIMO', 'SECONDO', 'TERZO', 'QUARTO']
const END = ['31/03', '30/06', '30/09', '31/12']
const START = ['01/01', '01/04', '01/07', '01/10']
const Q_GROUPS: ColGroup[] = ['q0', 'q1', 'q2', 'q3']

function kpiHeaders(): SheetHeaders {
  const cols: HeaderCol[] = [
    { label: 'Totale AFP', group: 'afp' },
    { label: 'Media Trim. AFP', group: 'afp' },
    { label: 'Totale o Media Anno', group: 'year' },
    { label: 'Scostamento tot vs AFP', group: 'year' },
    { label: 'BUDGET (BDGT)', group: 'budget' },
    { label: 'Scostamento tot vs BDGT', group: 'budget' },
  ]
  const groups: SheetHeaders['groups'] = [
    { label: 'AFP', span: 2, group: 'afp' },
    { label: 'Anno', span: 2, group: 'year' },
    { label: 'Budget', span: 2, group: 'budget' },
  ]
  Q_GROUPS.forEach((g, i) => {
    groups.push({ label: `ANALISI AL ${QUARTER_TITLES[i]} TRIMESTRE`, span: 4, group: g })
    cols.push(
      { label: 'Valore Trimestrale', group: g },
      { label: 'Scostamento Trim vs Media AFP', group: g },
      { label: 'Scostamento Trim. vs BDGT', group: g },
      { label: 'Valore Progressivo', group: g },
    )
  })
  return { groups, cols }
}

function plHeaders(block: PlBlock): SheetHeaders {
  const cols: HeaderCol[] = [
    { label: 'Euro', group: 'afp' },
    { label: '%', group: 'afp' },
    { label: 'Totale Anno', group: 'year' },
    { label: 'Scostamento vs AFP', group: 'year' },
    { label: 'BUDGET', group: 'budget' },
    { label: 'Scostamento Progressivo vs BDGT', group: 'budget' },
  ]
  const groups: SheetHeaders['groups'] = [
    { label: 'AFP', span: 2, group: 'afp' },
    { label: 'Anno', span: 2, group: 'year' },
    { label: 'Budget', span: 2, group: 'budget' },
  ]
  Q_GROUPS.forEach((g, i) => {
    if (block === 'forecast' && i === 3) return
    const title = block === 'forecast' ? `Previsione a Fine Anno dal ${i + 1}° Trimestre` : block === 'cumulative' ? `DAL 01/01 AL ${END[i]}` : `DAL ${START[i]} AL ${END[i]}`
    groups.push({ label: title, span: 4, group: g })
    const budgetLabel = block === 'cumulative' ? `Budget ${END[i]}` : `Budget ${['I°', 'II°', 'III°', 'IV°'][i]} Trim.`
    cols.push(
      { label: 'Euro', group: g },
      { label: '%', group: g },
      { label: 'Scostamento vs. AFP', group: g },
      { label: block === 'forecast' ? 'n.d.' : budgetLabel, group: g },
    )
  })
  return { groups, cols }
}

// ---------- assemblaggio ----------

export function buildAnalyticSheet(input: SheetInput): SheetSection[] {
  const map = new Map<string, number>()
  for (const m of input.manual) map.set(`${m.rowKey}|${m.colKey}`, m.value)
  const manual: ManualFn = (rowKey, col) => map.get(`${rowKey}|${col}`) ?? null

  const defs = buildSectionDefs(input)
  const afpPlColumn = resolveAfp({ year: input.year, accounts: input.accounts, priorPl: input.prior.pl, afpBaseline: input.afpBaseline, kpiBaseline: input.kpiBaseline }).column
  const known = (kind: 'revenue' | 'mdc') =>
    afpPlColumn && afpPlColumn.computed && (!afpPlColumn.knownKinds || afpPlColumn.knownKinds.includes(kind)) ? afpPlColumn.computed : null
  const afpRev = known('revenue')
  const afpMdc = known('mdc')
  const afpPl = {
    revenue: afpRev && afpRev.revenue > 0 ? afpRev.revenue : null,
    mdcPct: afpMdc && afpMdc.revenue > 0 ? afpMdc.mdc / afpMdc.revenue : null,
  }
  const revMonths = revenueMonthlyBudget(input.targets, input.year).filter(nonNull)
  const budgetRevenue = revMonths.length ? sumOf(revMonths) : (quarterlyTargetTotal(input.targets, input.year, 'economics.revenue') ?? manual('pl:revenue', 'budget'))

  const allSpecs = defs.flatMap((d) => d.specs)
  const curStore = runDataset(allSpecs, input.current, input.year, input.accounts, manual)
  const priorStore = runDataset(allSpecs, input.prior, input.year - 1, input.accounts, null)

  const out: SheetSection[] = defs.map((def) => ({
    key: def.key,
    title: def.title,
    description: def.description,
    headers: kpiHeaders(),
    rows: kpiRows(def.specs, curStore, priorStore, input, manual, afpPl, budgetRevenue),
  }))
  out.push({
    key: 'economics',
    title: 'Economics: conto economico (cumulato dal 01/01)',
    description: 'Dati da inizio anno alla fine di ciascun trimestre, con budget',
    headers: plHeaders('cumulative'),
    rows: plRows(input, 'cumulative', manual),
  })
  out.push({ key: 'economics-quarter', title: 'Economics: conto economico a trimestre', description: 'Dati del singolo trimestre', headers: plHeaders('quarter'), rows: plRows(input, 'quarter', manual) })
  out.push({
    key: 'economics-forecast',
    title: 'Economics: previsionale',
    description: 'Previsione a fine anno dai dati cumulati (x4, x2, x4/3)',
    headers: plHeaders('forecast'),
    rows: plRows(input, 'forecast', manual),
  })
  return out
}
