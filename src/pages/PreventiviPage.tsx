import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatEur, formatInt, formatPct, safeDiv, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_IT, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { PatientSegment, QuotesMonthly } from '../lib/types'

const SEGMENTS: { id: PatientSegment; label: string }[] = [
  { id: 'new_patient', label: 'Nuovi pazienti' },
  { id: 'returning_patient', label: 'Pazienti esistenti' },
]

const EMPTY_DRAFT: QuotesMonthly = {
  periodMonth: '',
  patientSegment: 'new_patient',
  issuedCount: 0,
  issuedValue: 0,
  confirmedCount: 0,
  confirmedValue: 0,
  lostCount: 0,
  lostValue: 0,
}

export function PreventiviPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [quotes, setQuotes] = useState<QuotesMonthly[]>([])
  const [priorQuotes, setPriorQuotes] = useState<QuotesMonthly[]>([])
  const [draft, setDraft] = useState<Record<PatientSegment, QuotesMonthly>>({
    new_patient: EMPTY_DRAFT,
    returning_patient: EMPTY_DRAFT,
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [q, pq] = await Promise.all([dataProvider.getQuotesMonthly(year), dataProvider.getQuotesMonthly(year - 1)])
    setQuotes(q)
    setPriorQuotes(pq)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = monthKey(year, month)
    const next = { ...draft }
    for (const seg of SEGMENTS) {
      const found = quotes.find((q) => q.periodMonth === period && q.patientSegment === seg.id)
      next[seg.id] = found ?? { ...EMPTY_DRAFT, periodMonth: period, patientSegment: seg.id }
    }
    setDraft(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, year, month])

  async function save() {
    setSaveState('saving')
    await Promise.all(SEGMENTS.map((seg) => dataProvider.upsertQuotesMonthly(draft[seg.id])))
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const issuedValue = sum(quotes.map((q) => q.issuedValue))
    const confirmedValue = sum(quotes.map((q) => q.confirmedValue))
    const lostValue = sum(quotes.map((q) => q.lostValue))
    const issuedCount = sum(quotes.map((q) => q.issuedCount))
    const confirmedCount = sum(quotes.map((q) => q.confirmedCount))
    const closeRate = safeDiv(confirmedCount, issuedCount)

    const priorIssuedCount = sum(priorQuotes.map((q) => q.issuedCount))
    const priorConfirmedCount = sum(priorQuotes.map((q) => q.confirmedCount))
    const closeRatePrior = safeDiv(priorConfirmedCount, priorIssuedCount)

    const avgConfirmedValue = safeDiv(confirmedValue, confirmedCount)

    const breakdown = [
      { name: 'Confermati', value: confirmedValue },
      { name: 'Persi', value: lostValue },
      { name: 'In corso', value: Math.max(0, issuedValue - confirmedValue - lostValue) },
    ]

    const trend = allMonthsOfYear(year).map((period, i) => {
      const monthQuotes = quotes.filter((q) => q.periodMonth === period)
      const iCount = sum(monthQuotes.map((q) => q.issuedCount))
      const cCount = sum(monthQuotes.map((q) => q.confirmedCount))
      return { label: MONTH_LABELS_SHORT_IT[i], chiusura: safeDiv(cCount, iCount) ?? 0 }
    })

    const table = allMonthsOfYear(year).map((period, i) => {
      const monthQuotes = quotes.filter((q) => q.periodMonth === period)
      return {
        label: MONTH_LABELS_IT[i],
        issuedCount: sum(monthQuotes.map((q) => q.issuedCount)),
        issuedValue: sum(monthQuotes.map((q) => q.issuedValue)),
        confirmedCount: sum(monthQuotes.map((q) => q.confirmedCount)),
        confirmedValue: sum(monthQuotes.map((q) => q.confirmedValue)),
        lostCount: sum(monthQuotes.map((q) => q.lostCount)),
        lostValue: sum(monthQuotes.map((q) => q.lostValue)),
      }
    })

    return { issuedValue, confirmedValue, closeRate, closeRatePrior, avgConfirmedValue, breakdown, trend, table }
  }, [quotes, priorQuotes, year])

  function updateDraft(seg: PatientSegment, field: keyof QuotesMonthly, value: number) {
    setDraft((d) => ({ ...d, [seg]: { ...d[seg], [field]: value } }))
  }

  return (
    <div>
      <PageHeader
        title="Preventivi"
        subtitle="Emessi, confermati e persi — grana mensile, per nuovi pazienti e pazienti esistenti"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="€ Preventivi emessi" value={formatEur(view.issuedValue)} />
        <KpiCard label="€ Preventivi confermati" value={formatEur(view.confirmedValue)} />
        <KpiCard
          label="% Chiusura"
          value={formatPct(view.closeRate)}
          deviation={deviationPct(view.closeRate, view.closeRatePrior)}
          trend={trendOf(deviationPct(view.closeRate, view.closeRatePrior))}
          deviationLabel="vs anno prec."
        />
        <KpiCard label="€ Medio confermato" value={formatEur(view.avgConfirmedValue)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Esito preventivi emessi" subtitle={`Anno ${year}, valore in €`}>
          <DonutChart data={view.breakdown} unit="currency" />
        </SectionCard>
        <SectionCard title="Trend % di chiusura">
          <TrendLineChart data={view.trend} series={[{ key: 'chiusura', label: '% chiusura' }]} unit="percent" />
        </SectionCard>
      </div>

      <SectionCard
        title="Inserimento dati mensile"
        subtitle="Seleziona il mese e aggiorna emessi / confermati / persi per segmento"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {SEGMENTS.map((seg) => (
            <div key={seg.id} className="rounded-lg border border-slate-100 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">{seg.label}</p>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Nr. emessi" value={draft[seg.id].issuedCount} onChange={(v) => updateDraft(seg.id, 'issuedCount', v)} />
                <NumberField label="€ emessi" value={draft[seg.id].issuedValue} onChange={(v) => updateDraft(seg.id, 'issuedValue', v)} />
                <NumberField label="Nr. confermati" value={draft[seg.id].confirmedCount} onChange={(v) => updateDraft(seg.id, 'confirmedCount', v)} />
                <NumberField label="€ confermati" value={draft[seg.id].confirmedValue} onChange={(v) => updateDraft(seg.id, 'confirmedValue', v)} />
                <NumberField label="Nr. persi" value={draft[seg.id].lostCount} onChange={(v) => updateDraft(seg.id, 'lostCount', v)} />
                <NumberField label="€ persi" value={draft[seg.id].lostValue} onChange={(v) => updateDraft(seg.id, 'lostValue', v)} />
              </div>
            </div>
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

      <SectionCard title="Dati completi (generali)" subtitle={`Tutti i mesi dell'anno ${year}, nuovi + esistenti`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Mese</th>
                <th className="py-2 pr-4 text-right">Nr. emessi</th>
                <th className="py-2 pr-4 text-right">€ emessi</th>
                <th className="py-2 pr-4 text-right">Nr. confermati</th>
                <th className="py-2 pr-4 text-right">€ confermati</th>
                <th className="py-2 pr-4 text-right">Nr. persi</th>
                <th className="py-2 text-right">€ persi</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatInt(row.issuedCount)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatEur(row.issuedValue)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatInt(row.confirmedCount)}</td>
                  <td className="py-1.5 pr-4 text-right font-medium text-slate-900">{formatEur(row.confirmedValue)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatInt(row.lostCount)}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatEur(row.lostValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
