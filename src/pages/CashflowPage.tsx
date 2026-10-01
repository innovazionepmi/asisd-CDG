import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { PercentField } from '../components/ui/PercentField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatEur, formatPct, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_IT, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { CashflowMonthly, CashflowStatus, KpiTarget } from '../lib/types'

const TARGET_KEY = 'cashflow.advance_payments_pct'

const STATUS_OPTIONS: { value: CashflowStatus; label: string }[] = [
  { value: 'positivo', label: 'Positivo' },
  { value: 'negativo', label: 'Negativo' },
  { value: 'pareggio', label: 'Pareggio' },
]

const STATUS_BADGE: Record<CashflowStatus, string> = {
  positivo: 'bg-emerald-50 text-emerald-700',
  negativo: 'bg-rose-50 text-rose-700',
  pareggio: 'bg-slate-100 text-slate-600',
}

const EMPTY: CashflowMonthly = {
  periodMonth: '',
  status: 'positivo',
  advancePaymentsValue: 0,
  advancePaymentsPct: 0,
  plannedReceivables: 0,
  unplannedReceivables: 0,
  overdueReceivables: 0,
  thirdPartyPayerReceivables: 0,
}

export function CashflowPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [rows, setRows] = useState<CashflowMonthly[]>([])
  const [priorRows, setPriorRows] = useState<CashflowMonthly[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [draft, setDraft] = useState<CashflowMonthly>(EMPTY)
  const [draftTarget, setDraftTarget] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [r, pr, t] = await Promise.all([
      dataProvider.getCashflowMonthly(year),
      dataProvider.getCashflowMonthly(year - 1),
      dataProvider.getKpiTargets(year),
    ])
    setRows(r)
    setPriorRows(pr)
    setTargets(t.filter((x) => x.metricKey === TARGET_KEY))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = monthKey(year, month)
    setDraft(rows.find((r) => r.periodMonth === period) ?? { ...EMPTY, periodMonth: period })
    setDraftTarget(targets.find((t) => t.periodStart === period)?.targetValue ?? 0)
  }, [rows, targets, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all([
      dataProvider.upsertCashflowMonthly(draft),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: TARGET_KEY, targetValue: draftTarget }),
    ])
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const advanceTotal = sum(rows.map((r) => r.advancePaymentsValue))
    const advanceTotalPrior = sum(priorRows.map((r) => r.advancePaymentsValue))
    const avgPct = rows.length ? sum(rows.map((r) => r.advancePaymentsPct)) / rows.length : null
    const avgTarget = targets.length ? sum(targets.map((t) => t.targetValue)) / targets.length : null

    const latest = [...rows].sort((a, b) => (a.periodMonth < b.periodMonth ? 1 : -1))[0]
    const receivablesBreakdown = latest
      ? [
          { name: 'Pianificati', value: latest.plannedReceivables },
          { name: 'Non pianificati', value: latest.unplannedReceivables },
          { name: 'Scaduti', value: latest.overdueReceivables },
          { name: 'Terzo pagante', value: latest.thirdPartyPayerReceivables },
        ]
      : []

    const trend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      corrente: rows.find((r) => r.periodMonth === period)?.advancePaymentsValue ?? 0,
      precedente: priorRows.find((r) => r.periodMonth === allMonthsOfYear(year - 1)[i])?.advancePaymentsValue ?? 0,
    }))

    const pctTrend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      attuale: rows.find((r) => r.periodMonth === period)?.advancePaymentsPct ?? null,
      obiettivo: targets.find((t) => t.periodStart === period)?.targetValue ?? null,
    }))

    const table = allMonthsOfYear(year).map((period, i) => {
      const row = rows.find((r) => r.periodMonth === period)
      const target = targets.find((t) => t.periodStart === period)?.targetValue ?? null
      const pct = row?.advancePaymentsPct ?? null
      return {
        label: MONTH_LABELS_IT[i],
        status: row?.status ?? null,
        advance: row?.advancePaymentsValue ?? 0,
        pct,
        target,
        deviation: pct != null && target != null ? pct - target : null,
        overdue: row?.overdueReceivables ?? 0,
        planned: row?.plannedReceivables ?? 0,
      }
    })

    return { advanceTotal, advanceTotalPrior, avgPct, avgTarget, receivablesBreakdown, trend, pctTrend, table, latestOverdue: latest?.overdueReceivables ?? 0 }
  }, [rows, priorRows, targets, year])

  return (
    <div>
      <PageHeader
        title="Cashflow"
        subtitle="Incassi anticipati e crediti — grana mensile"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Incassi anticipati (anno)"
          value={formatEur(view.advanceTotal)}
          deviation={deviationPct(view.advanceTotal, view.advanceTotalPrior)}
          trend={trendOf(deviationPct(view.advanceTotal, view.advanceTotalPrior))}
          deviationLabel="vs anno prec."
        />
        <KpiCard
          label="% Incassi anticipati media"
          value={formatPct(view.avgPct)}
          deviation={deviationPct(view.avgPct, view.avgTarget)}
          trend={trendOf(deviationPct(view.avgPct, view.avgTarget))}
          deviationLabel="vs obiettivo"
        />
        <KpiCard label="Crediti scaduti (ultimo mese)" value={formatEur(view.latestOverdue)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Composizione crediti" subtitle="Ultimo mese disponibile">
          <DonutChart data={view.receivablesBreakdown} unit="currency" />
        </SectionCard>
        <SectionCard title="Trend incassi anticipati">
          <TrendLineChart
            data={view.trend}
            series={[
              { key: 'corrente', label: String(year) },
              { key: 'precedente', label: String(year - 1), dashed: true },
            ]}
            unit="currency"
          />
        </SectionCard>
        <SectionCard title="% Incassi anticipati: attuale vs obiettivo" subtitle={`Anno ${year}`}>
          <TrendLineChart
            data={view.pctTrend}
            series={[
              { key: 'attuale', label: '% Incassi anticipati' },
              { key: 'obiettivo', label: 'Obiettivo', dashed: true },
            ]}
            unit="percent"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Inserimento dati mensile"
        subtitle="Seleziona il mese e aggiorna cassa, crediti e obiettivo"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="mb-4">
          <span className="mb-1 block text-xs font-medium text-slate-600">Situazione cashflow</span>
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDraft((d) => ({ ...d, status: opt.value }))}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  draft.status === opt.value ? STATUS_BADGE[opt.value] : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <NumberField label="Incassi anticipati" value={draft.advancePaymentsValue} onChange={(v) => setDraft((d) => ({ ...d, advancePaymentsValue: v }))} prefix="€" />
          <PercentField label="% Incassi anticipati" value={draft.advancePaymentsPct} onChange={(v) => setDraft((d) => ({ ...d, advancePaymentsPct: v }))} />
          <PercentField label="Obiettivo %" value={draftTarget} onChange={setDraftTarget} />
          <NumberField label="Crediti pianificati" value={draft.plannedReceivables} onChange={(v) => setDraft((d) => ({ ...d, plannedReceivables: v }))} prefix="€" />
          <NumberField label="Crediti non pianificati" value={draft.unplannedReceivables} onChange={(v) => setDraft((d) => ({ ...d, unplannedReceivables: v }))} prefix="€" />
          <NumberField label="Crediti scaduti" value={draft.overdueReceivables} onChange={(v) => setDraft((d) => ({ ...d, overdueReceivables: v }))} prefix="€" />
          <NumberField label="Terzo pagante" value={draft.thirdPartyPayerReceivables} onChange={(v) => setDraft((d) => ({ ...d, thirdPartyPayerReceivables: v }))} prefix="€" />
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
                <th className="py-2 pr-4">Situazione</th>
                <th className="py-2 pr-4 text-right">Incassi anticipati</th>
                <th className="py-2 pr-4 text-right">% Incassi anticipati</th>
                <th className="py-2 pr-4 text-right">Obiettivo</th>
                <th className="py-2 pr-4 text-right">Scostamento</th>
                <th className="py-2 pr-4 text-right">Crediti pianificati</th>
                <th className="py-2 text-right">Crediti scaduti</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{row.label}</td>
                  <td className="py-1.5 pr-4">
                    {row.status && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{row.status}</span>}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-medium text-slate-900">{formatEur(row.advance)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatPct(row.pct)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatPct(row.target)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatPct(row.deviation)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatEur(row.planned)}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatEur(row.overdue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
