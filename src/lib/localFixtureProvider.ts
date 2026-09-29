import type { DataProvider } from './dataProvider'
import {
  CHANNELS,
  FIXTURES_BY_YEAR,
  KPI_PRIOR_YEAR_BASELINE,
  PL_ACCOUNTS,
  STUDIO_CONFIGS,
  TREATMENT_CATEGORIES,
  type FixtureBundle,
} from './fixtureData'
import type {
  CashflowMonthly,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  MonthlyVisit,
} from './types'

// Provider di demo/sviluppo: seed realistico (fixtureData.ts) persistito su
// localStorage, cosi' le modifiche fatte nelle schermate di data-entry
// sopravvivono al reload senza bisogno di un database vero. Stessa
// interfaccia di supabaseProvider.ts: scambiabili senza toccare le pagine.

const STORAGE_PREFIX = 'asisd-cdg:'

function loadTable<T>(key: string, seed: T[]): T[] {
  const raw = localStorage.getItem(STORAGE_PREFIX + key)
  if (raw) {
    try {
      return JSON.parse(raw) as T[]
    } catch {
      // ignora storage corrotto, ripristina il seed
    }
  }
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(seed))
  return seed
}

function saveTable<T>(key: string, rows: T[]) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(rows))
}

function upsertBy<T>(rows: T[], row: T, matches: (a: T) => boolean): T[] {
  const idx = rows.findIndex(matches)
  if (idx === -1) return [...rows, row]
  const next = rows.slice()
  next[idx] = row
  return next
}

function seedFor<T>(pick: (bundle: FixtureBundle) => T[]): T[] {
  return Object.values(FIXTURES_BY_YEAR).flatMap(pick)
}

let monthlyVisits: MonthlyVisit[] | null = null
let quotesMonthly: QuotesMonthly[] | null = null
let productionMonthly: ProductionMonthly[] | null = null
let productionTitolareMonthly: ProductionTitolareMonthly[] | null = null
let hygieneSessionsMonthly: HygieneSessionsMonthly[] | null = null
let plQuarterly: PlQuarterly[] | null = null
let cashflowMonthly: CashflowMonthly[] | null = null
let kpiPriorYearBaseline: KpiPriorYearBaseline[] | null = null

function byYear<T extends { periodMonth: string } | { periodQuarter: string }>(rows: T[], year: number): T[] {
  return rows.filter((r) => {
    const period = 'periodMonth' in r ? r.periodMonth : r.periodQuarter
    return period.startsWith(String(year))
  })
}

export const localFixtureProvider: DataProvider = {
  async getStudioConfig(year) {
    return STUDIO_CONFIGS[year] ?? null
  },

  async listChannels() {
    return CHANNELS
  },
  async listTreatmentCategories() {
    return TREATMENT_CATEGORIES
  },
  async listPlAccounts() {
    return PL_ACCOUNTS
  },

  async getMonthlyVisits(year) {
    monthlyVisits ??= loadTable('monthlyVisits', seedFor((b) => b.monthlyVisits))
    return byYear(monthlyVisits, year)
  },
  async upsertMonthlyVisit(row) {
    monthlyVisits ??= loadTable('monthlyVisits', seedFor((b) => b.monthlyVisits))
    monthlyVisits = upsertBy(monthlyVisits, row, (r) => r.periodMonth === row.periodMonth && r.channelId === row.channelId)
    saveTable('monthlyVisits', monthlyVisits)
  },

  async getQuotesMonthly(year) {
    quotesMonthly ??= loadTable('quotesMonthly', seedFor((b) => b.quotesMonthly))
    return byYear(quotesMonthly, year)
  },
  async upsertQuotesMonthly(row) {
    quotesMonthly ??= loadTable('quotesMonthly', seedFor((b) => b.quotesMonthly))
    quotesMonthly = upsertBy(quotesMonthly, row, (r) => r.periodMonth === row.periodMonth && r.patientSegment === row.patientSegment)
    saveTable('quotesMonthly', quotesMonthly)
  },

  async getProductionMonthly(year) {
    productionMonthly ??= loadTable('productionMonthly', seedFor((b) => b.productionMonthly))
    return byYear(productionMonthly, year)
  },
  async upsertProductionMonthly(row) {
    productionMonthly ??= loadTable('productionMonthly', seedFor((b) => b.productionMonthly))
    productionMonthly = upsertBy(
      productionMonthly,
      row,
      (r) => r.periodMonth === row.periodMonth && r.treatmentCategoryId === row.treatmentCategoryId,
    )
    saveTable('productionMonthly', productionMonthly)
  },

  async getProductionTitolareMonthly(year) {
    productionTitolareMonthly ??= loadTable('productionTitolareMonthly', seedFor((b) => b.productionTitolareMonthly))
    return byYear(productionTitolareMonthly, year)
  },
  async upsertProductionTitolareMonthly(row) {
    productionTitolareMonthly ??= loadTable('productionTitolareMonthly', seedFor((b) => b.productionTitolareMonthly))
    productionTitolareMonthly = upsertBy(productionTitolareMonthly, row, (r) => r.periodMonth === row.periodMonth)
    saveTable('productionTitolareMonthly', productionTitolareMonthly)
  },

  async getHygieneSessionsMonthly(year) {
    hygieneSessionsMonthly ??= loadTable('hygieneSessionsMonthly', seedFor((b) => b.hygieneSessionsMonthly))
    return byYear(hygieneSessionsMonthly, year)
  },
  async upsertHygieneSessionsMonthly(row) {
    hygieneSessionsMonthly ??= loadTable('hygieneSessionsMonthly', seedFor((b) => b.hygieneSessionsMonthly))
    hygieneSessionsMonthly = upsertBy(hygieneSessionsMonthly, row, (r) => r.periodMonth === row.periodMonth)
    saveTable('hygieneSessionsMonthly', hygieneSessionsMonthly)
  },

  async getPlQuarterly(year) {
    plQuarterly ??= loadTable('plQuarterly', seedFor((b) => b.plQuarterly))
    return byYear(plQuarterly, year)
  },
  async upsertPlQuarterly(row) {
    plQuarterly ??= loadTable('plQuarterly', seedFor((b) => b.plQuarterly))
    plQuarterly = upsertBy(plQuarterly, row, (r) => r.periodQuarter === row.periodQuarter && r.accountId === row.accountId)
    saveTable('plQuarterly', plQuarterly)
  },

  async getCashflowMonthly(year) {
    cashflowMonthly ??= loadTable('cashflowMonthly', seedFor((b) => b.cashflowMonthly))
    return byYear(cashflowMonthly, year)
  },
  async upsertCashflowMonthly(row) {
    cashflowMonthly ??= loadTable('cashflowMonthly', seedFor((b) => b.cashflowMonthly))
    cashflowMonthly = upsertBy(cashflowMonthly, row, (r) => r.periodMonth === row.periodMonth)
    saveTable('cashflowMonthly', cashflowMonthly)
  },

  async getKpiPriorYearBaseline(year) {
    kpiPriorYearBaseline ??= loadTable('kpiPriorYearBaseline', KPI_PRIOR_YEAR_BASELINE)
    return kpiPriorYearBaseline.filter((b) => b.fiscalYear === year)
  },
  async upsertKpiPriorYearBaseline(row) {
    kpiPriorYearBaseline ??= loadTable('kpiPriorYearBaseline', KPI_PRIOR_YEAR_BASELINE)
    kpiPriorYearBaseline = upsertBy(kpiPriorYearBaseline, row, (r) => r.fiscalYear === row.fiscalYear && r.metricKey === row.metricKey)
    saveTable('kpiPriorYearBaseline', kpiPriorYearBaseline)
  },
}
