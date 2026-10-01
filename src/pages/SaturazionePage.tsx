import { useEffect, useMemo, useState } from 'react'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { PercentField } from '../components/ui/PercentField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatPct, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_IT, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { KpiTarget, SaturationMonthly } from '../lib/types'

const METRIC_KEY = 'production.saturation_pct'

export function SaturazionePage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<SaturationMonthly[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [draftValue, setDraftValue] = useState(0)
  const [draftTarget, setDraftTarget] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [r, t] = await Promise.all([dataProvider.getSaturationMonthly(year), dataProvider.getKpiTargets(year)])
    setRows(r)
    setTargets(t.filter((x) => x.metricKey === METRIC_KEY))
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

    const table = allMonthsOfYear(year).map((period, i) => {
      const actual = rows.find((r) => r.periodMonth === period)?.saturationPct ?? null
      const target = targets.find((t) => t.periodStart === period)?.targetValue ?? null
      return { label: MONTH_LABELS_IT[i], actual, target, deviation: actual != null && target != null ? actual - target : null }
    })

    return { avgActual, avgTarget, trend, table }
  }, [rows, targets, year])

  return (
    <div>
      <PageHeader
        title="Saturazione"
        subtitle="% di saturazione della capacità produttiva dello studio — valore inserito mensilmente"
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
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato ✓' : 'Salva mese'}
        </button>
      </SectionCard>

      <SectionCard title="Dati completi" subtitle={`Tutti i mesi dell'anno ${year}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Mese</th>
                <th className="py-2 pr-4 text-right">% Saturazione</th>
                <th className="py-2 pr-4 text-right">Obiettivo</th>
                <th className="py-2 text-right">Scostamento</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right font-medium text-slate-900">{formatPct(row.actual)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatPct(row.target)}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatPct(row.deviation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
