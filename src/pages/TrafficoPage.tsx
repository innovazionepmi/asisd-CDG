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
import type { Channel, MonthlyVisit } from '../lib/types'

export function TrafficoPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [channels, setChannels] = useState<Channel[]>([])
  const [visits, setVisits] = useState<MonthlyVisit[]>([])
  const [priorVisits, setPriorVisits] = useState<MonthlyVisit[]>([])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [ch, v, pv] = await Promise.all([
      dataProvider.listChannels(),
      dataProvider.getMonthlyVisits(year),
      dataProvider.getMonthlyVisits(year - 1),
    ])
    setChannels(ch)
    setVisits(v)
    setPriorVisits(pv)
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
  }, [channels, visits, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all(
      channels.map((ch) => dataProvider.upsertMonthlyVisit({ periodMonth: period, channelId: ch.id, visitCount: draft[ch.id] ?? 0 })),
    )
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const reactivationIds = new Set(channels.filter((c) => c.type === 'reactivation').map((c) => c.id))
    const total = sum(visits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))
    const totalPrior = sum(priorVisits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))
    const reactivated = sum(visits.filter((v) => reactivationIds.has(v.channelId)).map((v) => v.visitCount))

    const byChannel = channels.map((ch) => ({ name: ch.name, value: sum(visits.filter((v) => v.channelId === ch.id).map((v) => v.visitCount)) }))

    const trend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      corrente: sum(visits.filter((v) => v.periodMonth === period && !reactivationIds.has(v.channelId)).map((v) => v.visitCount)),
      precedente: sum(priorVisits.filter((v) => v.periodMonth === allMonthsOfYear(year - 1)[i] && !reactivationIds.has(v.channelId)).map((v) => v.visitCount)),
    }))

    const table = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_IT[i],
      values: channels.map((ch) => visits.find((v) => v.periodMonth === period && v.channelId === ch.id)?.visitCount ?? 0),
      total: sum(channels.map((ch) => visits.find((v) => v.periodMonth === period && v.channelId === ch.id)?.visitCount ?? 0)),
    }))

    return { total, totalPrior, reactivated, byChannel, trend, table }
  }, [channels, visits, priorVisits, year])

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
          deviation={deviationPct(view.total, view.totalPrior)}
          trend={trendOf(deviationPct(view.total, view.totalPrior))}
          deviationLabel="vs anno prec."
        />
        <KpiCard label="Pazienti riattivati (anno)" value={formatInt(view.reactivated)} />
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
        subtitle="Seleziona il mese e aggiorna il numero di visite per canale"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {channels.map((ch) => (
            <NumberField key={ch.id} label={ch.name} value={draft[ch.id] ?? 0} onChange={(v) => setDraft((d) => ({ ...d, [ch.id]: v }))} />
          ))}
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
                <th className="py-2 text-right font-semibold">Totale</th>
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
                  <td className="py-1.5 text-right font-medium text-slate-900">{formatInt(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
