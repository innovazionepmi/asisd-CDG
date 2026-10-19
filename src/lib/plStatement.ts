import { quarterKey } from './periods'
import type { KpiPriorYearBaseline, PlAccount, PlPriorYearBaseline, PlQuarterly } from './types'

// Logica del foglio "Co.Ge Trimestrale" dell'Excel ASISD. Il dato salvato e'
// sempre il delta del singolo trimestre (pl_quarterly); le tre viste del
// foglio sono tutte derivate da li:
//  - cumulato da inizio anno (T1, T1+T2, T1+T2+T3, anno intero)
//  - per trimestre (il delta stesso)
//  - previsione a fine anno: proiezione lineare del cumulato
//    (dal 1° trim x4, dal 2° x2, dal 3° x4/3) — stessa formula dell'Excel.
// La colonna AFP e' l'anno precedente, voce per voce.

export type PlRowKind = 'revenue' | 'variable' | 'variable_total' | 'mdc' | 'fixed' | 'fixed_total' | 'mol'

export interface PlRowDef {
  key: string
  label: string
  kind: PlRowKind
  accountId?: string
}

export type AccountValues = Record<string, number>

export interface PlComputed {
  byAccount: AccountValues
  revenue: number
  variable: number
  fixed: number
  mdc: number
  mol: number
}

export type PlColumnKind = 'afp' | 'cumulative' | 'quarter' | 'forecast'

export interface PlColumn {
  id: string
  kind: PlColumnKind
  title: string
  subtitle: string
  /** Falso quando il periodo non ha ancora dati (colonna mostrata vuota). */
  available: boolean
  /** Periodo di 12 mesi (cumulato a fine anno, previsioni): ha senso confrontare i ricavi con l'AFP. */
  fullYear: boolean
  computed: PlComputed | null
  /** Per l'AFP "solo totali" (riserva Ricavi/MOL): le altre righe restano sconosciute. */
  knownKinds: PlRowKind[] | null
}

export interface PlCell {
  value: number | null
  /** Incidenza sul ricavo del periodo (0-1). */
  pct: number | null
  /** Scostamento vs AFP: relativo (ricavi, anno pieno) o in punti percentuali di incidenza. */
  delta: number | null
  deltaKind: 'relative' | 'pp' | null
}

export type AfpSource = 'real' | 'baseline' | 'totals' | 'none'

export interface ResolvedAfp {
  source: AfpSource
  column: PlColumn | null
}

export function buildRowDefs(accounts: PlAccount[]): PlRowDef[] {
  const sorted = [...accounts].sort((a, b) => a.sortOrder - b.sortOrder)
  const rows: PlRowDef[] = []
  for (const a of sorted.filter((x) => x.accountType === 'revenue')) {
    rows.push({ key: a.id, label: a.name, kind: 'revenue', accountId: a.id })
  }
  for (const a of sorted.filter((x) => x.accountType === 'variable_cost')) {
    rows.push({ key: a.id, label: a.name, kind: 'variable', accountId: a.id })
  }
  rows.push({ key: 'variable_total', label: 'Costi variabili — totale', kind: 'variable_total' })
  rows.push({ key: 'mdc', label: 'MDC', kind: 'mdc' })
  for (const a of sorted.filter((x) => x.accountType === 'fixed_cost')) {
    rows.push({ key: a.id, label: a.name, kind: 'fixed', accountId: a.id })
  }
  rows.push({ key: 'fixed_total', label: 'Costi fissi — totale', kind: 'fixed_total' })
  rows.push({ key: 'mol', label: 'MOL', kind: 'mol' })
  return rows
}

export function higherIsBetter(kind: PlRowKind): boolean {
  return kind === 'revenue' || kind === 'mdc' || kind === 'mol'
}

export function compute(values: AccountValues, accounts: PlAccount[]): PlComputed {
  const total = (type: PlAccount['accountType']) =>
    accounts.filter((a) => a.accountType === type).reduce((acc, a) => acc + (values[a.id] ?? 0), 0)
  const revenue = total('revenue')
  const variable = total('variable_cost')
  const fixed = total('fixed_cost')
  return { byAccount: values, revenue, variable, fixed, mdc: revenue - variable, mol: revenue - variable - fixed }
}

function addInto(target: AccountValues, rows: PlQuarterly[]) {
  for (const r of rows) target[r.accountId] = (target[r.accountId] ?? 0) + r.amount
}

function valuesForQuarters(pl: PlQuarterly[], year: number, from: number, to: number): AccountValues {
  const periods = new Set<string>()
  for (let q = from; q <= to; q++) periods.add(quarterKey(year, q))
  const out: AccountValues = {}
  addInto(out, pl.filter((r) => periods.has(r.periodQuarter)))
  return out
}

function scale(values: AccountValues, factor: number): AccountValues {
  const out: AccountValues = {}
  for (const [k, v] of Object.entries(values)) out[k] = v * factor
  return out
}

/** Ultimo trimestre (1-4) con almeno un importo diverso da zero; 0 se non c'e' nulla. */
export function lastQuarterWithData(pl: PlQuarterly[], year: number): number {
  for (let q = 4; q >= 1; q--) {
    const key = quarterKey(year, q)
    if (pl.some((r) => r.periodQuarter === key && r.amount !== 0)) return q
  }
  return 0
}

const QUARTER_START = ['01/01', '01/04', '01/07', '01/10']
const QUARTER_END = ['31/03', '30/06', '30/09', '31/12']

export type PlViewMode = 'cumulative' | 'quarter' | 'forecast'

export function buildColumns(mode: PlViewMode, pl: PlQuarterly[], accounts: PlAccount[], year: number): PlColumn[] {
  const last = lastQuarterWithData(pl, year)
  const quarters = mode === 'forecast' ? [1, 2, 3] : [1, 2, 3, 4]
  return quarters.map((q): PlColumn => {
    const available = q <= last
    if (mode === 'cumulative') {
      return {
        id: `cum-${q}`,
        kind: 'cumulative',
        title: `Al ${QUARTER_END[q - 1]}`,
        subtitle: 'Da inizio anno',
        available,
        fullYear: q === 4,
        computed: available ? compute(valuesForQuarters(pl, year, 1, q), accounts) : null,
        knownKinds: null,
      }
    }
    if (mode === 'quarter') {
      return {
        id: `q-${q}`,
        kind: 'quarter',
        title: `${q}° trimestre`,
        subtitle: `${QUARTER_START[q - 1]} – ${QUARTER_END[q - 1]}`,
        available,
        fullYear: false,
        computed: available ? compute(valuesForQuarters(pl, year, q, q), accounts) : null,
        knownKinds: null,
      }
    }
    return {
      id: `fc-${q}`,
      kind: 'forecast',
      title: `Dal ${q}° trimestre`,
      subtitle: 'Previsione a fine anno',
      available,
      fullYear: true,
      computed: available ? compute(scale(valuesForQuarters(pl, year, 1, q), 4 / q), accounts) : null,
      knownKinds: null,
    }
  })
}

/**
 * Colonna AFP: prima i dati trimestrali reali dell'anno precedente, poi i
 * valori per voce inseriti a mano, infine (riserva storica) i soli totali
 * Ricavi/MOL di kpi_prior_year_baseline.
 */
export function resolveAfp(args: {
  year: number
  accounts: PlAccount[]
  priorPl: PlQuarterly[]
  afpBaseline: PlPriorYearBaseline[]
  kpiBaseline: KpiPriorYearBaseline[]
}): ResolvedAfp {
  const { year, accounts, priorPl, afpBaseline, kpiBaseline } = args
  const base = {
    id: 'afp',
    kind: 'afp' as const,
    title: `AFP ${year - 1}`,
    subtitle: 'Anno fiscale precedente',
    available: true,
    fullYear: true,
  }

  if (priorPl.length > 0) {
    const values: AccountValues = {}
    addInto(values, priorPl)
    return { source: 'real', column: { ...base, computed: compute(values, accounts), knownKinds: null } }
  }

  if (afpBaseline.length > 0) {
    const values: AccountValues = {}
    for (const b of afpBaseline) values[b.accountId] = b.annualValue
    return { source: 'baseline', column: { ...base, computed: compute(values, accounts), knownKinds: null } }
  }

  const rev = kpiBaseline.find((b) => b.metricKey === 'economics.revenue')?.annualValue ?? null
  const mol = kpiBaseline.find((b) => b.metricKey === 'economics.mol')?.annualValue ?? null
  if (rev != null || mol != null) {
    const known: PlRowKind[] = []
    if (rev != null) known.push('revenue')
    if (mol != null) known.push('mol')
    const computed: PlComputed = { byAccount: {}, revenue: rev ?? 0, variable: 0, fixed: 0, mdc: 0, mol: mol ?? 0 }
    return { source: 'totals', column: { ...base, computed, knownKinds: known } }
  }

  return { source: 'none', column: null }
}

function rowValue(def: PlRowDef, col: PlColumn): number | null {
  const c = col.computed
  if (!c) return null
  if (col.knownKinds && !col.knownKinds.includes(def.kind)) return null
  switch (def.kind) {
    case 'revenue':
    case 'variable':
    case 'fixed':
      return c.byAccount[def.accountId as string] ?? 0
    case 'variable_total':
      return c.variable
    case 'fixed_total':
      return c.fixed
    case 'mdc':
      return c.mdc
    case 'mol':
      return c.mol
  }
}

function revenueOf(col: PlColumn): number | null {
  if (!col.computed) return null
  if (col.knownKinds && !col.knownKinds.includes('revenue')) return null
  return col.computed.revenue > 0 ? col.computed.revenue : null
}

export function cellFor(def: PlRowDef, col: PlColumn, afp: PlColumn | null): PlCell {
  const value = rowValue(def, col)
  const rev = revenueOf(col)
  const pct = value != null && rev != null ? value / rev : null
  if (col.kind === 'afp' || value == null || !afp) return { value, pct, delta: null, deltaKind: null }

  if (def.kind === 'revenue') {
    const afpRev = revenueOf(afp)
    if (col.fullYear && afpRev != null) return { value, pct, delta: (value - afpRev) / afpRev, deltaKind: 'relative' }
    return { value, pct, delta: null, deltaKind: null }
  }

  const afpValue = rowValue(def, afp)
  const afpRev = revenueOf(afp)
  if (pct != null && afpValue != null && afpRev != null) {
    return { value, pct, delta: pct - afpValue / afpRev, deltaKind: 'pp' }
  }
  return { value, pct, delta: null, deltaKind: null }
}

/** Valore AFP "inserito a mano" -> totali da riscrivere in kpi_prior_year_baseline. */
export function afpTotals(values: AccountValues, accounts: PlAccount[]): { revenue: number; mol: number } {
  const c = compute(values, accounts)
  return { revenue: c.revenue, mol: c.mol }
}
