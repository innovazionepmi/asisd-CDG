import { monthKey, quarterKey } from './periods'
import type {
  CashflowMonthly,
  CashflowStatus,
  Channel,
  HygieneSessionsMonthly,
  KpiPriorYearBaseline,
  KpiTarget,
  PlAccount,
  PlQuarterly,
  ProductionMonthly,
  ProductionTitolareMonthly,
  QuotesMonthly,
  SaturationMonthly,
  StudioConfig,
  TreatmentCategory,
  MonthlyVisit,
} from './types'

// Dati di riferimento (mirroring 0004_seed_defaults.sql) + una serie storica
// 2025 presa 1:1 dai numeri reali del file Excel "(ASISD) AV. CoGe -
// Cruscotto (Esempio Completo) - R15 Nov25.xlsx" a scopo di demo, e una
// proiezione 2026 (+9%) per mostrare il confronto anno su anno funzionante
// end-to-end, incluso il fallback sulla baseline AFP per il 2024 (di cui
// non abbiamo dettaglio mensile/trimestrale, solo il totale annuo — esattamente
// come nell'Excel originale).

export const DEFAULT_STUDIO_ID = 'studio-demo'

export const CHANNELS: Channel[] = [
  { id: 'ch-spontanea', name: 'Visite Spontanee', type: 'organic_spontaneous', sortOrder: 1 },
  { id: 'ch-convenzioni', name: 'Visite da Convenzioni', type: 'convenzione', sortOrder: 2 },
  { id: 'ch-ricerche-web', name: 'Visite da Ricerche Web', type: 'ricerca_web', sortOrder: 3 },
  { id: 'ch-campagna-ig', name: 'Campagna Instagram', type: 'marketing_campaign', sortOrder: 4 },
  { id: 'ch-riattivati', name: 'Pazienti Riattivati', type: 'reactivation', sortOrder: 5 },
]

export const TREATMENT_CATEGORIES: TreatmentCategory[] = [
  { id: 'tc-chirurgia', name: 'Chirurgia', sortOrder: 1 },
  { id: 'tc-implantologia', name: 'Implantologia', sortOrder: 2 },
  { id: 'tc-protesi', name: 'Protesi', sortOrder: 3 },
  { id: 'tc-conservativa', name: 'Conservativa', sortOrder: 4 },
  { id: 'tc-endodonzia', name: 'Endodonzia', sortOrder: 5 },
  { id: 'tc-ortodonzia', name: 'Ortodonzia', sortOrder: 6 },
  { id: 'tc-parodontologia', name: 'Parodontologia', sortOrder: 7 },
  { id: 'tc-igiene', name: 'Igiene', sortOrder: 8 },
  { id: 'tc-altro', name: 'Altro', sortOrder: 9 },
]

export const PL_ACCOUNTS: PlAccount[] = [
  { id: 'pl-ricavi', name: 'Ricavi (Compensi professionali)', accountType: 'revenue', sortOrder: 1 },
  { id: 'pl-materiali', name: 'Costi per Materiali di consumo dentale', accountType: 'variable_cost', sortOrder: 10 },
  { id: 'pl-energia', name: 'Costo per Energia e acqua', accountType: 'variable_cost', sortOrder: 11 },
  { id: 'pl-collaboratori', name: 'Costi per Compensi ai Collaboratori', accountType: 'variable_cost', sortOrder: 12 },
  { id: 'pl-titolare', name: 'Costi per Compenso al Titolare come Operatore', accountType: 'variable_cost', sortOrder: 13 },
  { id: 'pl-laboratorio', name: 'Costi per Laboratorio', accountType: 'variable_cost', sortOrder: 14 },
  { id: 'pl-finanziamenti', name: 'Costi per Finanziamenti ai Clienti', accountType: 'variable_cost', sortOrder: 15 },
  { id: 'pl-personale', name: 'Costi Complessivi per Personale', accountType: 'fixed_cost', sortOrder: 20 },
  { id: 'pl-immobili', name: 'Costi per Immobili', accountType: 'fixed_cost', sortOrder: 21 },
  { id: 'pl-attrezzature', name: 'Costi per Attrezzature', accountType: 'fixed_cost', sortOrder: 22 },
  { id: 'pl-gestionali', name: 'Costi Gestionali e Amministrative', accountType: 'fixed_cost', sortOrder: 23 },
  { id: 'pl-marketing', name: 'Costi per Marketing', accountType: 'fixed_cost', sortOrder: 24 },
]

export const STUDIO_CONFIGS: Record<number, StudioConfig> = {
  2025: { year: 2025, numChairs: 3, theoreticalOpeningMinutes: 331500, cfmpTarget: 1 },
  2026: { year: 2026, numChairs: 3, theoreticalOpeningMinutes: 331500, cfmpTarget: 1 },
}

// Baseline AFP 2024: solo il totale annuo, come nella colonna "Totale AFP"
// dell'Excel — dimostra il fallback quando non c'e' storico dettagliato.
export const KPI_PRIOR_YEAR_BASELINE: KpiPriorYearBaseline[] = [
  { fiscalYear: 2024, metricKey: 'economics.revenue', annualValue: 1_391_143 },
  { fiscalYear: 2024, metricKey: 'economics.mol', annualValue: 233_585 },
]

function grow(values: number[], factor: number): number[] {
  return values.map((v) => Math.round(v * factor * 100) / 100)
}

function monthlySeries(year: number, values: number[], build: (period: string, v: number) => void) {
  values.forEach((v, i) => build(monthKey(year, i + 1), v))
}

function quarterlySeries(year: number, values: number[], build: (period: string, v: number) => void) {
  values.forEach((v, i) => build(quarterKey(year, i + 1), v))
}

// ---------- 2025: numeri reali dal file Excel ----------

const NEW_PATIENTS_2025 = [35, 70, 70, 54, 47, 62, 61, 48, 66, 72, 52, 38]
const REACTIVATED_2025 = [1, 1, 5, 3, 1, 0, 5, 3, 7, 10, 10, 10]
const HYGIENE_SESSIONS_2025 = [85, 116, 139, 135, 124, 109, 154, 26, 188, 180, 155, 180]
const PRODUCTION_TOTAL_2025 = [59716, 133932, 198138, 144040, 162190, 149300, 139508, 91405, 144413, 201452, 138450, 127000]
const PRODUCTION_TITOLARE_2025 = [28860, 104937, 144036, 96129, 116911, 96000, 82240, 74118, 97226, 146299, 77137, 57900]
const SATURATION_PCT_2025 = [0.5115, 0.7199, 0.7269, 0.7293, 0.7177, 0.7057, 0.7704, 0.2948, 0.7934, 0.8242, 0.732, 0.6634]

// Obiettivi mensili ("Obiettivo") presi 1:1 dal foglio Saturazione.
const NEW_PATIENTS_TARGET_2025 = [35, 35, 35, 38, 38, 38, 50, 50, 50, 50, 50, 50]
const REACTIVATED_TARGET_2025 = [2, 2, 2, 9.824726135, 9.824726135, 9.824726135, 9.209805335, 9.209805335, 9.209805335, 8.849315068, 8.849315068, 8.849315068]
const PRODUCTION_TARGET_2025 = [140000, 168000, 168000, 168000, 168000, 172000, 160000, 50000, 170000, 180000, 180000, 180000]
const PRODUCTION_TITOLARE_TARGET_2025 = [84000, 100800, 100800, 97440, 97440, 99760, 88000, 27500, 93500, 95400, 95400, 95400]
const TITOLARE_SHARE_TARGET_2025 = [0.6, 0.6, 0.6, 0.58, 0.58, 0.58, 0.55, 0.55, 0.55, 0.53, 0.53, 0.53]
const HYGIENE_TARGET_2025 = [133.3333333, 133.3333333, 133.3333333, 140, 140, 160, 170, 40, 180, 180, 193, 193]
const SATURATION_TARGET_2025 = [0.5, 0.55, 0.55, 0.6, 0.6, 0.65, 0.65, 0.7, 0.7, 0.7, 0.75, 0.75]

const QUOTES_NEW_ISSUED_COUNT_2025 = [37, 70, 71, 61, 41, 64, 59, 50, 63, 64, 54, 34]
const QUOTES_NEW_ISSUED_VALUE_2025 = [163723, 414724, 346130, 261094, 178184, 357180, 267925, 259356, 297410, 297419, 277088, 164522]
const QUOTES_NEW_CONFIRMED_COUNT_2025 = [29, 40, 46, 37, 26, 40, 41, 29, 37, 53, 30, 18]
const QUOTES_NEW_CONFIRMED_VALUE_2025 = [103353, 194289, 156176, 94479, 82306, 142860, 115905, 103132, 155638, 116069, 70680, 43681]

// "generali" (tutti i pazienti) nell'Excel esistono solo a livello trimestrale:
// qui la quota "returning" e' il residuo generali-meno-prima_visita, spalmato
// sui 3 mesi del trimestre — semplificazione di demo, e' l'assunzione aperta
// segnalata in docs/data-model.md.
const QUOTES_RETURNING_ISSUED_COUNT_2025 = [71, 71, 71, 66, 66, 66, 53, 53, 54, 63, 63, 64]
const QUOTES_RETURNING_CONFIRMED_COUNT_2025 = [61, 60, 61, 51, 51, 51, 36, 36, 37, 48, 48, 49]

const CASHFLOW_ADVANCE_2025 = [7400, 17291, 18795, 8600, 2260, 41345, 57890, 45880, 55437, 102000, 44897, 107609]
const CASHFLOW_STATUS_2025: CashflowStatus[] = [
  'positivo', 'positivo', 'positivo', 'positivo', 'positivo', 'positivo',
  'positivo', 'negativo', 'negativo', 'positivo', 'pareggio', 'pareggio',
]
const OVERDUE_RECEIVABLES_2025 = [180000, 180000, 180000, 180000, 180000, 177206, 184000, 175000, 200000, 191000, 198000, 193000]
// % Incassi Anticipati: valore inserito a mano (coerente con riga 8 dell'Excel).
const ADVANCE_PAYMENTS_PCT_2025 = [
  0.05392564091, 0.1036655555, 0.09394071164, 0.06677640774, 0.01406688618, 0.2641734874,
  0.3356097674, 0.348454814, 0.3443612759, 0.421744484, 0.3007831604, 0.4476123542,
]
const ADVANCE_PAYMENTS_TARGET_2025 = [0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
// % Chiusura preventivi generale (Customer Experience, riga 26).
const CLOSE_RATE_TARGET_2025 = [0.69, 0.69, 0.69, 0.71, 0.71, 0.71, 0.73, 0.73, 0.73, 0.73, 0.73, 0.73]

// Conto economico trimestrale: delta reali per trimestre (Co.Ge Trimestrale).
const PL_QUARTERLY_2025: Record<string, number[]> = {
  'pl-ricavi': [503670, 445954, 470670, 626127],
  'pl-materiali': [42888, 81424, 14255, 55757],
  'pl-energia': [6376, 1221, 3631, 3175],
  'pl-collaboratori': [55496, 59693, 55193, 70476],
  'pl-titolare': [78346.2, 92700, 81090.8, 84401],
  'pl-laboratorio': [47911, 54695, 41115, 53052],
  'pl-finanziamenti': [4103, 3486, 7990, 9494],
  'pl-personale': [48882, 41016, 52735, 42655],
  'pl-immobili': [6419, 2621, 18227.31, 19738.69],
  'pl-attrezzature': [6652, 6639, 6639, 12113],
  'pl-gestionali': [34348, 30307, 21993.11, 37339.89],
  'pl-marketing': [26416, 30035, 23864, 62389],
}

// Ripartizione produzione per categoria trattamento (ratio annue reali).
const PRODUCTION_CATEGORY_SHARE: Record<string, number> = {
  'tc-chirurgia': 0.0377,
  'tc-implantologia': 0.346,
  'tc-protesi': 0.3877,
  'tc-conservativa': 0.0799,
  'tc-endodonzia': 0.0226,
  'tc-ortodonzia': 0.0526,
  'tc-parodontologia': 0.02,
  'tc-igiene': 0.0362,
  'tc-altro': 0.0173,
}

const CHANNEL_SHARE_OF_NEW_PATIENTS: Record<string, number> = {
  'ch-spontanea': 0.676,
  'ch-convenzioni': 0.324,
  'ch-ricerche-web': 0,
  'ch-campagna-ig': 0.129, // aggiuntivo rispetto al totale "prime visite" (canale mktg dedicato)
}

export interface FixtureBundle {
  monthlyVisits: MonthlyVisit[]
  quotesMonthly: QuotesMonthly[]
  productionMonthly: ProductionMonthly[]
  productionTitolareMonthly: ProductionTitolareMonthly[]
  hygieneSessionsMonthly: HygieneSessionsMonthly[]
  saturationMonthly: SaturationMonthly[]
  plQuarterly: PlQuarterly[]
  cashflowMonthly: CashflowMonthly[]
}

function buildYear(year: number, growthFactor: number): FixtureBundle {
  const newPatients = grow(NEW_PATIENTS_2025, growthFactor)
  const reactivated = grow(REACTIVATED_2025, growthFactor)
  const hygiene = grow(HYGIENE_SESSIONS_2025, growthFactor)
  const productionTotal = grow(PRODUCTION_TOTAL_2025, growthFactor)
  const productionTitolare = grow(PRODUCTION_TITOLARE_2025, growthFactor)
  const quotesNewIssuedCount = grow(QUOTES_NEW_ISSUED_COUNT_2025, growthFactor)
  const quotesNewIssuedValue = grow(QUOTES_NEW_ISSUED_VALUE_2025, growthFactor)
  const quotesNewConfirmedCount = grow(QUOTES_NEW_CONFIRMED_COUNT_2025, growthFactor)
  const quotesNewConfirmedValue = grow(QUOTES_NEW_CONFIRMED_VALUE_2025, growthFactor)
  const quotesReturningIssuedCount = grow(QUOTES_RETURNING_ISSUED_COUNT_2025, growthFactor)
  const quotesReturningConfirmedCount = grow(QUOTES_RETURNING_CONFIRMED_COUNT_2025, growthFactor)
  const cashflowAdvance = grow(CASHFLOW_ADVANCE_2025, growthFactor)
  const overdueReceivables = grow(OVERDUE_RECEIVABLES_2025, growthFactor)

  const monthlyVisits: MonthlyVisit[] = []
  monthlySeries(year, newPatients, (period, total) => {
    monthlyVisits.push({ periodMonth: period, channelId: 'ch-spontanea', visitCount: Math.round(total * CHANNEL_SHARE_OF_NEW_PATIENTS['ch-spontanea']) })
    monthlyVisits.push({ periodMonth: period, channelId: 'ch-convenzioni', visitCount: Math.round(total * CHANNEL_SHARE_OF_NEW_PATIENTS['ch-convenzioni']) })
    monthlyVisits.push({ periodMonth: period, channelId: 'ch-ricerche-web', visitCount: 0 })
  })
  monthlySeries(year, reactivated, (period, v) => {
    monthlyVisits.push({ periodMonth: period, channelId: 'ch-riattivati', visitCount: Math.round(v) })
  })
  // campagna attiva solo negli ultimi 4 mesi, a dimostrare la dimensione dinamica
  newPatients.slice(-4).forEach((total, i) => {
    const period = monthKey(year, 9 + i)
    monthlyVisits.push({ periodMonth: period, channelId: 'ch-campagna-ig', visitCount: Math.round(total * 0.15) })
  })

  const quotesMonthly: QuotesMonthly[] = []
  monthlySeries(year, quotesNewIssuedCount, (period, v) => {
    const idx = monthIndex(period)
    quotesMonthly.push({
      periodMonth: period,
      patientSegment: 'new_patient',
      issuedCount: Math.round(v),
      issuedValue: quotesNewIssuedValue[idx],
      confirmedCount: Math.round(quotesNewConfirmedCount[idx]),
      confirmedValue: quotesNewConfirmedValue[idx],
      lostCount: Math.max(0, Math.round(v - quotesNewConfirmedCount[idx] - 2)),
      lostValue: Math.round((quotesNewIssuedValue[idx] - quotesNewConfirmedValue[idx]) * 0.55),
    })
    quotesMonthly.push({
      periodMonth: period,
      patientSegment: 'returning_patient',
      issuedCount: Math.round(quotesReturningIssuedCount[idx]),
      issuedValue: Math.round(quotesReturningIssuedCount[idx] * 2100),
      confirmedCount: Math.round(quotesReturningConfirmedCount[idx]),
      confirmedValue: Math.round(quotesReturningConfirmedCount[idx] * 1950),
      lostCount: Math.max(0, Math.round(quotesReturningIssuedCount[idx] - quotesReturningConfirmedCount[idx] - 1)),
      lostValue: Math.round((quotesReturningIssuedCount[idx] - quotesReturningConfirmedCount[idx]) * 1600),
    })
  })

  const productionMonthly: ProductionMonthly[] = []
  monthlySeries(year, productionTotal, (period, total) => {
    for (const cat of TREATMENT_CATEGORIES) {
      productionMonthly.push({
        periodMonth: period,
        treatmentCategoryId: cat.id,
        productionValue: Math.round(total * PRODUCTION_CATEGORY_SHARE[cat.id] * 100) / 100,
      })
    }
  })

  const productionTitolareMonthly: ProductionTitolareMonthly[] = []
  monthlySeries(year, productionTitolare, (period, v) => {
    productionTitolareMonthly.push({ periodMonth: period, productionValue: v })
  })

  const hygieneSessionsMonthly: HygieneSessionsMonthly[] = []
  monthlySeries(year, hygiene, (period, v) => {
    hygieneSessionsMonthly.push({ periodMonth: period, sessionCount: Math.round(v) })
  })

  // Percentuale: non ha senso "crescerla" con lo stesso fattore dei ricavi,
  // resta uguale tra gli anni demo.
  const saturationMonthly: SaturationMonthly[] = []
  monthlySeries(year, SATURATION_PCT_2025, (period, v) => {
    saturationMonthly.push({ periodMonth: period, saturationPct: v })
  })

  const plQuarterly: PlQuarterly[] = []
  for (const account of PL_ACCOUNTS) {
    const base = PL_QUARTERLY_2025[account.id]
    if (!base) continue
    quarterlySeries(year, grow(base, growthFactor), (period, amount) => {
      plQuarterly.push({ periodQuarter: period, accountId: account.id, amount })
    })
  }

  const cashflowMonthly: CashflowMonthly[] = []
  monthlySeries(year, cashflowAdvance, (period, advance) => {
    const idx = monthIndex(period)
    cashflowMonthly.push({
      periodMonth: period,
      status: CASHFLOW_STATUS_2025[idx],
      advancePaymentsValue: advance,
      advancePaymentsPct: ADVANCE_PAYMENTS_PCT_2025[idx],
      plannedReceivables: 12500,
      unplannedReceivables: 0,
      overdueReceivables: overdueReceivables[idx],
      thirdPartyPayerReceivables: 3750,
    })
  })

  return {
    monthlyVisits,
    quotesMonthly,
    productionMonthly,
    productionTitolareMonthly,
    hygieneSessionsMonthly,
    saturationMonthly,
    plQuarterly,
    cashflowMonthly,
  }
}

function monthIndex(period: string): number {
  return Number(period.slice(5, 7)) - 1
}

export const FIXTURES_BY_YEAR: Record<number, FixtureBundle> = {
  2025: buildYear(2025, 1),
  2026: buildYear(2026, 1.09),
}

// Obiettivi mensili (kpi_targets) per entrambi gli anni demo. I target in
// valuta/conteggio crescono come gli attuali (+9% nel 2026, stessa logica
// di buildYear); i target percentuali restano invariati tra gli anni.
function buildTargets(year: number, growthFactor: number): KpiTarget[] {
  const targets: KpiTarget[] = []
  const push = (metricKey: string, values: number[]) => {
    values.forEach((v, i) => targets.push({ periodStart: monthKey(year, i + 1), metricKey, targetValue: v }))
  }
  push('traffic.new_patients.total', grow(NEW_PATIENTS_TARGET_2025, growthFactor))
  push('traffic.reactivated.total', grow(REACTIVATED_TARGET_2025, growthFactor))
  push('production.total', grow(PRODUCTION_TARGET_2025, growthFactor))
  push('production.titolare', grow(PRODUCTION_TITOLARE_TARGET_2025, growthFactor))
  push('production.hygiene_sessions', grow(HYGIENE_TARGET_2025, growthFactor))
  push('production.titolare_share', TITOLARE_SHARE_TARGET_2025)
  push('production.saturation_pct', SATURATION_TARGET_2025)
  push('cashflow.advance_payments_pct', ADVANCE_PAYMENTS_TARGET_2025)
  push('quotes.close_rate', CLOSE_RATE_TARGET_2025)
  return targets
}

export const KPI_TARGETS: KpiTarget[] = [...buildTargets(2025, 1), ...buildTargets(2026, 1.09)]
