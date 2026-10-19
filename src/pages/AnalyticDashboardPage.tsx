import { useState } from 'react'
import { AnalyticSheetTable } from '../components/analytics/AnalyticSheetTable'
import { PageHeader } from '../components/layout/PageHeader'
import { YearSelect } from '../components/ui/PeriodSelect'
import { SectionCard } from '../components/ui/SectionCard'
import { useAnalyticData } from '../lib/useAnalyticData'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'

export function AnalyticDashboardPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const { data, error, sections } = useAnalyticData(year)

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
