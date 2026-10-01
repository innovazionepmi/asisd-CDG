import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatInt, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_IT, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { Channel, KpiTarget, MonthlyVisit } from '../lib/types'

const NEW_PATIENTS_TARGET_KEY = 'traffic.new_patients.total'
const REACTIVATED_TARGET_KEY = 'traffic.reactivated.total'

export function TrafficoPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [channels, setChannels] = useState<Channel[]>([])
  const [visits, setVisits] = useState<MonthlyVisit[]>([])
  const [priorVisits, setPriorVisits] = useState<MonthlyVisit[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [draftTargetNewPatients, setDraftTargetNewPatients] = useState(0)
  const [draftTargetReactivated, setDraftTargetReactivated] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [ch, v, pv, t] = await Promise.all([
      dataProvider.listChannels(),
      dataProvider.getMonthlyVisits(year),
      dataProvider.getMonthlyVisits(year - 1),
      dataProvider.getKpiTargets(year),
    ])
    setChannels(ch)
    setVisits(v)
    setPriorVisits(pv)
    setTargets(t.filter((x) => x.metricKey === NEW_PATIENTS_TARGET_KEY || x.metricKey === REACTIVATED_TARGET_KEY))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = monthKey(year, month)
    const next: Record<string, number> = {}
    for (const ch of channels) {
      next[ch.id] = visits.find((v) => v.periodMonth === period && v.channelId === ch.id)?.visitCount ?? 0
    }
    setDraft(next)
    setDraftTargetNewPatients(targets.find((t) => t.periodStart === period && t.metricKey === NEW_PATIENTS_TARGET_KEY)?.targetValue ?? 0)
    setDraftTargetReactivated(targets.find((t) => t.periodStart === period && t.metricKey === REACTIVATED_TARGET_KEY)?.targetValue ?? 0)
  }, [channels, visits, targets, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all([
      ...channels.map((ch) => dataProvider.upsertMonthlyVisit({ periodMonth: period, channelId: ch.id, visitCount: draft[ch.id] ?? 0 })),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: NEW_PATIENTS_TARGET_KEY, targetValue: draftTargetNewPatients }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: REACTIVATED_TARGET_KEY, targetValue: draftTargetReactivated }),
    ])
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const reactivationIds = new Set(channels.filter((c) => c.type === 'reactivation').map((c) => c.id))
    const total = sum(visits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))
    const totalPrior = sum(priorVisits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))
    const reactivated = sum(visits.filter((v) => reactivationIds.has(v.channelId)).map((v) => v.visitCount))

    const newPatientsTargetTotal = sum(targets.filter((t) => t.metricKey === NEW_PATIENTS_TARGET_KEY).map((t) => t.targetValue))
    const reactivatedTargetTotal = sum(targets.filter((t) => t.metricKey === REACTIVATED_TARGET_KEY).map((t) => t.targetValue))

    const byChannel = channels.map((ch) => ({ name: ch.name, value: sum(visits.filter((v) => v.channelId === ch.id).map((v) => v.visitCount)) }))

    const trend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      corrente: sum(visits.filter((v) => v.periodMonth === period && !reactivationIds.has(v.channelId)).map((v) => v.visitCount)),
      precedente: sum(priorVisits.filter((v) => v.periodMonth === allMonthsOfYear(year - 1)[i] && !reactivationIds.has(v.channelId)).map((v) => v.visitCount)),
    }))

    const table = allMonthsOfYear(year).map((period, i) => {
      const monthTotal = sum(channels.map((ch) => visits.find((v) => v.periodMonth === period && v.channelId === ch.id)?.visitCount ?? 0))
      const target = targets.find((t) => t.periodStart === period && t.metricKey === NEW_PATIENTS_TARGET_KEY)?.targetValue ?? null
      return {
        label: MONTH_LABELS_IT[i],
        values: channels.map((ch) => visits.find((v) => v.periodMonth === period && v.channelId === ch.id)?.visitCount ?? 0),
        total: monthTotal,
        target,
        deviation: target != null ? monthTotal - target : null,
      }
    })

    return { total, totalPrior, reactivated, newPatientsTargetTotal, reactivatedTargetTotal, byChannel, trend, table }
  }, [channels, visits, priorVisits, targets, year])

  return (
    <div>
      <PageHeader
        title="Traffico"
        subtitle="Nuove visite e riattivazioni per canale — grana mensile"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard
          label="Nuovi pazienti (anno)"
          value={formatInt(view.total)}
          deviation={deviationPct(view.total, view.newPatientsTargetTotal)}
          trend={trendOf(deviationPct(view.total, view.newPatientsTargetTotal))}
          deviationLabel="vs obiettivo"
        />
        <KpiCard
          label="Pazienti riattivati (anno)"
          value={formatInt(view.reactivated)}
          deviation={deviationPct(view.reactivated, view.reactivatedTargetTotal)}
          trend={trendOf(deviationPct(view.reactivated, view.reactivatedTargetTotal))}
          deviationLabel="vs obiettivo"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Mix canali di acquisizione" subtitle={`Anno ${year}`}>
          <DonutChart data={view.byChannel} unit="count" />
        </SectionCard>
        <SectionCard title="Trend mensile nuovi pazienti">
          <TrendLineChart
            data={view.trend}
            series={[
              { key: 'corrente', label: String(year) },
              { key: 'precedente', label: String(year - 1), dashed: true },
            ]}
            unit="count"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Inserimento dati mensile"
        subtitle="Seleziona il mese e aggiorna il numero di visite per canale e gli obiettivi"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {channels.map((ch) => (
            <NumberField key={ch.id} label={ch.name} value={draft[ch.id] ?? 0} onChange={(v) => setDraft((d) => ({ ...d, [ch.id]: v }))} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 border-t border-slate-100 pt-4">
          <NumberField label="Obiettivo nuovi pazienti" value={draftTargetNewPatients} onChange={setDraftTargetNewPatients} />
          <NumberField label="Obiettivo riattivati" value={draftTargetReactivated} onChange={setDraftTargetReactivated} />
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
                {channels.map((ch) => (
                  <th key={ch.id} className="py-2 pr-4 text-right">
                    {ch.name}
                  </th>
                ))}
                <th className="py-2 pr-4 text-right font-semibold">Totale</th>
                <th className="py-2 pr-4 text-right">Obiettivo</th>
                <th className="py-2 text-right">Scostamento</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="py-1.5 pr-4 text-right text-slate-600">
                      {formatInt(v)}
                    </td>
                  ))}
                  <td className="py-1.5 pr-4 text-right font-medium text-slate-900">{formatInt(row.total)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatInt(row.target)}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatInt(row.deviation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
