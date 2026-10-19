import type {
  CashflowMonthly,
  Channel,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  KpiTarget,
  ManualColKey,
  ManualValue,
  PlAccount,
  PlPriorYearBaseline,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  SaturationMonthly,
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
  upsertStudioConfig(config: StudioConfig): Promise<void>

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

  getSaturationMonthly(year: number): Promise<SaturationMonthly[]>
  upsertSaturationMonthly(row: SaturationMonthly): Promise<void>

  getPlQuarterly(year: number): Promise<PlQuarterly[]>
  upsertPlQuarterly(row: PlQuarterly): Promise<void>

  getCashflowMonthly(year: number): Promise<CashflowMonthly[]>
  upsertCashflowMonthly(row: CashflowMonthly): Promise<void>

// Nodo "Inserimento dati": AFP, budget annuo e valori trimestrali/annuali senza fonte mensile.
  getManualValues(year: number): Promise<ManualValue[]>
  upsertManualValue(row: ManualValue): Promise<void>
  deleteManualValue(year: number, rowKey: string, colKey: ManualColKey): Promise<void>

  getPlPriorYearBaseline(year: number): Promise<PlPriorYearBaseline[]>
  upsertPlPriorYearBaseline(row: PlPriorYearBaseline): Promise<void>

  getKpiPriorYearBaseline(year: number): Promise<KpiPriorYearBaseline[]>
  upsertKpiPriorYearBaseline(row: KpiPriorYearBaseline): Promise<void>

  // Tutti i target di un anno (mensili o trimestrali, qualunque metric_key);
  // le pagine filtrano per il metricKey che gli interessa.
  getKpiTargets(year: number): Promise<KpiTarget[]>
  upsertKpiTarget(row: KpiTarget): Promise<void>
  deleteKpiTarget(metricKey: string, periodStart: string): Promise<void>
}
