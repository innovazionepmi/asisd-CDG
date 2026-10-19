import { useEffect, useMemo, useState } from 'react'
import { AnalyticSheetTable } from '../components/analytics/AnalyticSheetTable'
import { PageHeader } from '../components/layout/PageHeader'
import { YearSelect } from '../components/ui/PeriodSelect'
import { SectionCard } from '../components/ui/SectionCard'
import { buildAnalyticSheet, type YearData } from '../lib/analyticSheet'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { Channel, KpiPriorYearBaseline, KpiTarget, PlAccount, PlPriorYearBaseline, TreatmentCategory } from '../lib/types'

async function loadYear(year: number): Promise<YearData> {
  const [visits, quotes, production, titolare, hygiene, saturation, cashflow, pl] = await Promise.all([
    dataProvider.getMonthlyVisits(year),
    dataProvider.getQuotesMonthly(year),
    dataProvider.getProductionMonthly(year),
    dataProvider.getProductionTitolareMonthly(year),
    dataProvider.getHygieneSessionsMonthly(year),
    dataProvider.getSaturationMonthly(year),
    dataProvider.getCashflowMonthly(year),
    dataProvider.getPlQuarterly(year),
  ])
  return { visits, quotes, production, titolare, hygiene, saturation, cashflow, pl }
}

interface Loaded {
  channels: Channel[]
  categories: TreatmentCategory[]
  accounts: PlAccount[]
  targets: KpiTarget[]
  cfmpTarget: number | null
  kpiBaseline: KpiPriorYearBaseline[]
  afpBaseline: PlPriorYearBaseline[]
  current: YearData
  prior: YearData
}

export function AnalyticDashboardPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    Promise.all([
      dataProvider.listChannels(),
      dataProvider.listTreatmentCategories(),
      dataProvider.listPlAccounts(),
      dataProvider.getKpiTargets(year),
      dataProvider.getStudioConfig(year),
      dataProvider.getKpiPriorYearBaseline(year - 1),
      dataProvider.getPlPriorYearBaseline(year - 1),
      loadYear(year),
      loadYear(year - 1),
    ])
      .then(([channels, categories, accounts, targets, config, kpiBaseline, afpBaseline, current, prior]) => {
        if (!cancelled) setData({ channels, categories, accounts, targets, cfmpTarget: config?.cfmpTarget ?? null, kpiBaseline, afpBaseline, current, prior })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore nel caricamento dei dati.')
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const sections = useMemo(() => (data ? buildAnalyticSheet({ year, ...data }) : []), [data, year])

  return (
    <div>
      <PageHeader
        title="Dashboard analitica"
        subtitle="Cruscotto aggregato trimestrale — tutti i KPI affiancati per leggere una colonna dall'alto in basso"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />
      <SectionCard title="Cruscotto aggregato trimestrale" subtitle={`Anno ${year} a confronto con l'anno precedente (AFP) e con il budget`}>
        {error && <p className="rounded-card bg-danger-100 px-4 py-3 text-sm text-danger-600">Errore nel caricamento: {error}</p>}
        {!error && !data && <p className="py-8 text-center text-sm text-stone-500">Caricamento…</p>}
        {data && <AnalyticSheetTable sections={sections} year={year} />}
      </SectionCard>
    </div>
  )
}
