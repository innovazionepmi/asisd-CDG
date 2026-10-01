import type { DataProvider } from './dataProvider'
import { supabase } from './supabaseClient'
import type {
  CashflowMonthly,
  CashflowStatus,
  Channel,
  ChannelType,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  KpiTarget,
  PlAccount,
  PlAccountType,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  PatientSegment,
  SaturationMonthly,
  StudioConfig,
  TreatmentCategory,
  MonthlyVisit,
} from './types'

// Provider di produzione: parla direttamente con le tabelle create in
// supabase/migrations/*.sql via @supabase/supabase-js. Stessa interfaccia
// di localFixtureProvider.ts.
//
// Lo studio corrente non è più letto da una variabile d'ambiente fissa:
// viene risolto per l'utente loggato (prima riga di studio_members) da
// StudioContext (src/lib/studio/StudioContext.tsx) e comunicato qui via
// setCurrentStudioId(). v1: un utente vede un solo studio (il primo
// trovato), nessuno studio-switcher per chi appartiene a più studi.

let currentStudioId: string | null = null

export function setCurrentStudioId(id: string | null) {
  currentStudioId = id
}

function requireClient() {
  if (!supabase) throw new Error('Supabase non configurato: impostare VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

function requireStudioId(): string {
  if (!currentStudioId) throw new Error('Nessuno studio associato alla sessione corrente.')
  return currentStudioId
}

export const supabaseProvider: DataProvider = {
  async getStudioConfig(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('studio_configs')
      .select('year, num_chairs, theoretical_opening_minutes, cfmp_target')
      .eq('studio_id', studioId)
      .eq('year', year)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const config: StudioConfig = {
      year: data.year,
      numChairs: data.num_chairs,
      theoreticalOpeningMinutes: data.theoretical_opening_minutes,
      cfmpTarget: data.cfmp_target,
    }
    return config
  },

  async listChannels() {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('acquisition_channels')
      .select('id, name, type, sort_order')
      .or(`studio_id.eq.${studioId},studio_id.is.null`)
      .order('sort_order')
    if (error) throw error
    return (data ?? []).map(
      (r): Channel => ({ id: r.id, name: r.name, type: r.type as ChannelType, sortOrder: r.sort_order }),
    )
  },

  async listTreatmentCategories() {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('treatment_categories')
      .select('id, name, sort_order')
      .or(`studio_id.eq.${studioId},studio_id.is.null`)
      .order('sort_order')
    if (error) throw error
    return (data ?? []).map((r): TreatmentCategory => ({ id: r.id, name: r.name, sortOrder: r.sort_order }))
  },

  async listPlAccounts() {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('pl_accounts')
      .select('id, name, account_type, sort_order')
      .or(`studio_id.eq.${studioId},studio_id.is.null`)
      .order('sort_order')
    if (error) throw error
    return (data ?? []).map(
      (r): PlAccount => ({ id: r.id, name: r.name, accountType: r.account_type as PlAccountType, sortOrder: r.sort_order }),
    )
  },

  async getMonthlyVisits(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('monthly_visits')
      .select('period_month, channel_id, visit_count')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map((r): MonthlyVisit => ({ periodMonth: r.period_month, channelId: r.channel_id, visitCount: r.visit_count }))
  },
  async upsertMonthlyVisit(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db
      .from('monthly_visits')
      .upsert(
        { studio_id: studioId, period_month: row.periodMonth, channel_id: row.channelId, visit_count: row.visitCount },
        { onConflict: 'studio_id,period_month,channel_id' },
      )
    if (error) throw error
  },

  async getQuotesMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('quotes_monthly')
      .select('period_month, patient_segment, issued_count, issued_value, confirmed_count, confirmed_value, lost_count, lost_value')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map(
      (r): QuotesMonthly => ({
        periodMonth: r.period_month,
        patientSegment: r.patient_segment as PatientSegment,
        issuedCount: r.issued_count,
        issuedValue: r.issued_value,
        confirmedCount: r.confirmed_count,
        confirmedValue: r.confirmed_value,
        lostCount: r.lost_count,
        lostValue: r.lost_value,
      }),
    )
  },
  async upsertQuotesMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db.from('quotes_monthly').upsert(
      {
        studio_id: studioId,
        period_month: row.periodMonth,
        patient_segment: row.patientSegment,
        issued_count: row.issuedCount,
        issued_value: row.issuedValue,
        confirmed_count: row.confirmedCount,
        confirmed_value: row.confirmedValue,
        lost_count: row.lostCount,
        lost_value: row.lostValue,
      },
      { onConflict: 'studio_id,period_month,patient_segment' },
    )
    if (error) throw error
  },

  async getProductionMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('production_monthly')
      .select('period_month, treatment_category_id, production_value')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map(
      (r): ProductionMonthly => ({ periodMonth: r.period_month, treatmentCategoryId: r.treatment_category_id, productionValue: r.production_value }),
    )
  },
  async upsertProductionMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db.from('production_monthly').upsert(
      { studio_id: studioId, period_month: row.periodMonth, treatment_category_id: row.treatmentCategoryId, production_value: row.productionValue },
      { onConflict: 'studio_id,period_month,treatment_category_id' },
    )
    if (error) throw error
  },

  async getProductionTitolareMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('production_titolare_monthly')
      .select('period_month, production_value')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map((r): ProductionTitolareMonthly => ({ periodMonth: r.period_month, productionValue: r.production_value }))
  },
  async upsertProductionTitolareMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db
      .from('production_titolare_monthly')
      .upsert({ studio_id: studioId, period_month: row.periodMonth, production_value: row.productionValue }, { onConflict: 'studio_id,period_month' })
    if (error) throw error
  },

  async getHygieneSessionsMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('hygiene_sessions_monthly')
      .select('period_month, session_count')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map((r): HygieneSessionsMonthly => ({ periodMonth: r.period_month, sessionCount: r.session_count }))
  },
  async upsertHygieneSessionsMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db
      .from('hygiene_sessions_monthly')
      .upsert({ studio_id: studioId, period_month: row.periodMonth, session_count: row.sessionCount }, { onConflict: 'studio_id,period_month' })
    if (error) throw error
  },

  async getSaturationMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('saturation_monthly')
      .select('period_month, saturation_pct')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map((r): SaturationMonthly => ({ periodMonth: r.period_month, saturationPct: r.saturation_pct }))
  },
  async upsertSaturationMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db
      .from('saturation_monthly')
      .upsert({ studio_id: studioId, period_month: row.periodMonth, saturation_pct: row.saturationPct }, { onConflict: 'studio_id,period_month' })
    if (error) throw error
  },

  async getPlQuarterly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('pl_quarterly')
      .select('period_quarter, account_id, amount')
      .eq('studio_id', studioId)
      .gte('period_quarter', `${year}-01-01`)
      .lte('period_quarter', `${year}-10-01`)
    if (error) throw error
    return (data ?? []).map((r): PlQuarterly => ({ periodQuarter: r.period_quarter, accountId: r.account_id, amount: r.amount }))
  },
  async upsertPlQuarterly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db
      .from('pl_quarterly')
      .upsert(
        { studio_id: studioId, period_quarter: row.periodQuarter, account_id: row.accountId, amount: row.amount },
        { onConflict: 'studio_id,period_quarter,account_id' },
      )
    if (error) throw error
  },

  async getCashflowMonthly(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('cashflow_monthly')
      .select('period_month, status, advance_payments_value, advance_payments_pct, planned_receivables, unplanned_receivables, overdue_receivables, third_party_payer_receivables')
      .eq('studio_id', studioId)
      .gte('period_month', `${year}-01-01`)
      .lte('period_month', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map(
      (r): CashflowMonthly => ({
        periodMonth: r.period_month,
        status: r.status as CashflowStatus | null,
        advancePaymentsValue: r.advance_payments_value,
        advancePaymentsPct: r.advance_payments_pct,
        plannedReceivables: r.planned_receivables,
        unplannedReceivables: r.unplanned_receivables,
        overdueReceivables: r.overdue_receivables,
        thirdPartyPayerReceivables: r.third_party_payer_receivables,
      }),
    )
  },
  async upsertCashflowMonthly(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db.from('cashflow_monthly').upsert(
      {
        studio_id: studioId,
        period_month: row.periodMonth,
        status: row.status,
        advance_payments_value: row.advancePaymentsValue,
        advance_payments_pct: row.advancePaymentsPct,
        planned_receivables: row.plannedReceivables,
        unplanned_receivables: row.unplannedReceivables,
        overdue_receivables: row.overdueReceivables,
        third_party_payer_receivables: row.thirdPartyPayerReceivables,
      },
      { onConflict: 'studio_id,period_month' },
    )
    if (error) throw error
  },

  async getKpiPriorYearBaseline(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('kpi_prior_year_baseline')
      .select('fiscal_year, metric_key, annual_value')
      .eq('studio_id', studioId)
      .eq('fiscal_year', year)
    if (error) throw error
    return (data ?? []).map((r): KpiPriorYearBaseline => ({ fiscalYear: r.fiscal_year, metricKey: r.metric_key, annualValue: r.annual_value }))
  },
  async upsertKpiPriorYearBaseline(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db.from('kpi_prior_year_baseline').upsert(
      { studio_id: studioId, fiscal_year: row.fiscalYear, metric_key: row.metricKey, annual_value: row.annualValue },
      { onConflict: 'studio_id,fiscal_year,metric_key' },
    )
    if (error) throw error
  },

  async getKpiTargets(year) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { data, error } = await db
      .from('kpi_targets')
      .select('period_start, metric_key, target_value')
      .eq('studio_id', studioId)
      .gte('period_start', `${year}-01-01`)
      .lte('period_start', `${year}-12-01`)
    if (error) throw error
    return (data ?? []).map((r): KpiTarget => ({ periodStart: r.period_start, metricKey: r.metric_key, targetValue: r.target_value }))
  },
  async upsertKpiTarget(row) {
    const db = requireClient()
    const studioId = requireStudioId()
    const { error } = await db.from('kpi_targets').upsert(
      { studio_id: studioId, period_start: row.periodStart, metric_key: row.metricKey, target_value: row.targetValue },
      { onConflict: 'studio_id,period_start,metric_key' },
    )
    if (error) throw error
  },
}
