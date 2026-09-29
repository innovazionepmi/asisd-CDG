import type {
  CashflowMonthly,
  Channel,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  PlAccount,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  StudioConfig,
  TreatmentCategory,
  MonthlyVisit,
} from './types'

// Astrazione sopra le tabelle Supabase (supabase/migrations/0001_schema.sql).
// Due implementazioni: localFixtureProvider (demo/dev, persiste su
// localStorage) e supabaseProvider (produzione, via @supabase/supabase-js).
// Le pagine dell'app parlano solo con questa interfaccia.
export interface DataProvider {
  getStudioConfig(year: number): Promise<StudioConfig | null>

  listChannels(): Promise<Channel[]>
  listTreatmentCategories(): Promise<TreatmentCategory[]>
  listPlAccounts(): Promise<PlAccount[]>

  getMonthlyVisits(year: number): Promise<MonthlyVisit[]>
  upsertMonthlyVisit(row: MonthlyVisit): Promise<void>

  getQuotesMonthly(year: number): Promise<QuotesMonthly[]>
  upsertQuotesMonthly(row: QuotesMonthly): Promise<void>

  getProductionMonthly(year: number): Promise<ProductionMonthly[]>
  upsertProductionMonthly(row: ProductionMonthly): Promise<void>
  getProductionTitolareMonthly(year: number): Promise<ProductionTitolareMonthly[]>
  upsertProductionTitolareMonthly(row: ProductionTitolareMonthly): Promise<void>
  getHygieneSessionsMonthly(year: number): Promise<HygieneSessionsMonthly[]>
  upsertHygieneSessionsMonthly(row: HygieneSessionsMonthly): Promise<void>

  getPlQuarterly(year: number): Promise<PlQuarterly[]>
  upsertPlQuarterly(row: PlQuarterly): Promise<void>

  getCashflowMonthly(year: number): Promise<CashflowMonthly[]>
  upsertCashflowMonthly(row: CashflowMonthly): Promise<void>

  getKpiPriorYearBaseline(year: number): Promise<KpiPriorYearBaseline[]>
  upsertKpiPriorYearBaseline(row: KpiPriorYearBaseline): Promise<void>
}
