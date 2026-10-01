// Tipi allineati 1:1 allo schema Supabase in supabase/migrations/0001_schema.sql.
// periodMonth / periodQuarter sono sempre stringhe 'YYYY-MM-01'.

export type ChannelType =
  | 'organic_spontaneous'
  | 'convenzione'
  | 'ricerca_web'
  | 'marketing_campaign'
  | 'reactivation'
  | 'other'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  sortOrder: number
}

export interface MonthlyVisit {
  periodMonth: string
  channelId: string
  visitCount: number
}

export type PatientSegment = 'new_patient' | 'returning_patient'

export interface QuotesMonthly {
  periodMonth: string
  patientSegment: PatientSegment
  issuedCount: number
  issuedValue: number
  confirmedCount: number
  confirmedValue: number
  lostCount: number
  lostValue: number
}

export interface TreatmentCategory {
  id: string
  name: string
  sortOrder: number
}

export interface ProductionMonthly {
  periodMonth: string
  treatmentCategoryId: string
  productionValue: number
}

export interface ProductionTitolareMonthly {
  periodMonth: string
  productionValue: number
}

export interface HygieneSessionsMonthly {
  periodMonth: string
  sessionCount: number
}

export type PlAccountType = 'revenue' | 'variable_cost' | 'fixed_cost'

export interface PlAccount {
  id: string
  name: string
  accountType: PlAccountType
  sortOrder: number
}

export interface PlQuarterly {
  periodQuarter: string
  accountId: string
  amount: number
}

export type CashflowStatus = 'positivo' | 'negativo' | 'pareggio'

export interface CashflowMonthly {
  periodMonth: string
  status: CashflowStatus | null
  advancePaymentsValue: number
  advancePaymentsPct: number
  plannedReceivables: number
  unplannedReceivables: number
  overdueReceivables: number
  thirdPartyPayerReceivables: number
}

export interface KpiPriorYearBaseline {
  fiscalYear: number
  metricKey: string
  annualValue: number
}

export interface StudioConfig {
  year: number
  numChairs: number
  theoreticalOpeningMinutes: number | null
  cfmpTarget: number | null
}

export interface SaturationMonthly {
  periodMonth: string
  saturationPct: number
}

// metricKey identifica il KPI (vedi metric_catalog); periodStart e' il
// primo giorno del mese o del trimestre a seconda di metric_catalog.grain.
export interface KpiTarget {
  periodStart: string
  metricKey: string
  targetValue: number
}
