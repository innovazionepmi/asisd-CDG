import { useEffect, useMemo, useState } from 'react'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { SaturationSheetTable } from '../components/saturation/SaturationSheetTable'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { PercentField } from '../components/ui/PercentField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatPct, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { buildSaturationSheet } from '../lib/saturationSheet'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type {
  Channel,
  HygieneSessionsMonthly,
  KpiTarget,
  MonthlyVisit,
  ProductionMonthly,
  ProductionTitolareMonthly,
  SaturationMonthly,
} from '../lib/types'

const METRIC_KEY = 'production.saturation_pct'

export function SaturazionePage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<SaturationMonthly[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [allTargets, setAllTargets] = useState<KpiTarget[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [visits, setVisits] = useState<MonthlyVisit[]>([])
  const [production, setProduction] = useState<ProductionMonthly[]>([])
  const [titolare, setTitolare] = useState<ProductionTitolareMonthly[]>([])
  const [hygiene, setHygiene] = useState<HygieneSessionsMonthly[]>([])
  const [draftValue, setDraftValue] = useState(0)
  const [draftTarget, setDraftTarget] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [r, t, ch, vis, prod, tit, hyg] = await Promise.all([
      dataProvider.getSaturationMonthly(year),
      dataProvider.getKpiTargets(year),
      dataProvider.listChannels(),
      dataProvider.getMonthlyVisits(year),
      dataProvider.getProductionMonthly(year),
      dataProvider.getProductionTitolareMonthly(year),
      dataProvider.getHygieneSessionsMonthly(year),
    ])
    setRows(r)
    setAllTargets(t)
    setTargets(t.filter((x) => x.metricKey === METRIC_KEY))
    setChannels(ch)
    setVisits(vis)
    setProduction(prod)
    setTitolare(tit)
    setHygiene(hyg)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = monthKey(year, month)
    setDraftValue(rows.find((r) => r.periodMonth === period)?.saturationPct ?? 0)
    setDraftTarget(targets.find((t) => t.periodStart === period)?.targetValue ?? 0)
  }, [rows, targets, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all([
      dataProvider.upsertSaturationMonthly({ periodMonth: period, saturationPct: draftValue }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: METRIC_KEY, targetValue: draftTarget }),
    ])
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const avgActual = rows.length ? sum(rows.map((r) => r.saturationPct)) / rows.length : null
    const avgTarget = targets.length ? sum(targets.map((t) => t.targetValue)) / targets.length : null

    const trend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      attuale: rows.find((r) => r.periodMonth === period)?.saturationPct ?? null,
      obiettivo: targets.find((t) => t.periodStart === period)?.targetValue ?? null,
    }))

    return { avgActual, avgTarget, trend }
  }, [rows, targets, year])

  const sheet = useMemo(
    () => buildSaturationSheet({ year, channels, visits, saturation: rows, production, titolare, hygiene, targets: allTargets }),
    [year, channels, visits, rows, production, titolare, hygiene, allTargets],
  )

  return (
    <div>
      <PageHeader
        title="Saturazione"
        subtitle="KPI primari mensili di saturazione — traffico, saturazione, produzione e igiene con obiettivi e scostamenti"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard
          label="% Saturazione media"
          value={formatPct(view.avgActual)}
          deviation={deviationPct(view.avgActual, view.avgTarget)}
          trend={trendOf(deviationPct(view.avgActual, view.avgTarget))}
          deviationLabel="vs obiettivo medio"
        />
        <KpiCard label="Obiettivo medio" value={formatPct(view.avgTarget)} />
      </div>

      <div className="mb-6">
        <SectionCard title="Lunedì della Saturazione" subtitle={`Anno ${year} — mesi nelle colonne, per ogni KPI valore, obiettivo e scostamento`}>
          <SaturationSheetTable blocks={sheet} year={year} />
        </SectionCard>
      </div>

      <SectionCard title="Trend mensile: attuale vs obiettivo" subtitle={`Anno ${year}`}>
        <TrendLineChart
          data={view.trend}
          series={[
            { key: 'attuale', label: '% Saturazione' },
            { key: 'obiettivo', label: 'Obiettivo', dashed: true },
          ]}
          unit="percent"
        />
      </SectionCard>

      <SectionCard
        title="Inserimento dati mensile"
        subtitle="Seleziona il mese e aggiorna il valore di saturazione e il relativo obiettivo"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <PercentField label="% Saturazione" value={draftValue} onChange={setDraftValue} />
          <PercentField label="Obiettivo" value={draftTarget} onChange={setDraftTarget} />
        </div>
        <button
          onClick={save}
          disabled={saveState === 'saving'}
          className="mt-4 rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover disabled:opacity-60"
        >
          {saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato ✓' : 'Salva mese'}
        </button>
      </SectionCard>
    </div>
  )
}
