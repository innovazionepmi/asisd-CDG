import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { QuarterSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatEur, formatPct, safeDiv, sum, trendOf } from '../lib/calc'
import { allQuartersOfYear, quarterKey, quarterLabel } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { KpiPriorYearBaseline, PlAccount, PlQuarterly } from '../lib/types'

export function EconomicsPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1)
  const [accounts, setAccounts] = useState<PlAccount[]>([])
  const [pl, setPl] = useState<PlQuarterly[]>([])
  const [priorPl, setPriorPl] = useState<PlQuarterly[]>([])
  const [priorBaseline, setPriorBaseline] = useState<KpiPriorYearBaseline[]>([])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [baselineDraft, setBaselineDraft] = useState({ revenue: 0, mol: 0 })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [baselineSaveState, setBaselineSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [acc, quarterly, priorQuarterly, baseline] = await Promise.all([
      dataProvider.listPlAccounts(),
      dataProvider.getPlQuarterly(year),
      dataProvider.getPlQuarterly(year - 1),
      dataProvider.getKpiPriorYearBaseline(year - 1),
    ])
    setAccounts(acc)
    setPl(quarterly)
    setPriorPl(priorQuarterly)
    setPriorBaseline(baseline)
    setBaselineDraft({
      revenue: baseline.find((b) => b.metricKey === 'economics.revenue')?.annualValue ?? 0,
      mol: baseline.find((b) => b.metricKey === 'economics.mol')?.annualValue ?? 0,
    })
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = quarterKey(year, quarter)
    const next: Record<string, number> = {}
    for (const acc of accounts) {
      next[acc.id] = pl.find((r) => r.periodQuarter === period && r.accountId === acc.id)?.amount ?? 0
    }
    setDraft(next)
  }, [accounts, pl, year, quarter])

  async function save() {
    setSaveState('saving')
    const period = quarterKey(year, quarter)
    await Promise.all(accounts.map((acc) => dataProvider.upsertPlQuarterly({ periodQuarter: period, accountId: acc.id, amount: draft[acc.id] ?? 0 })))
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  async function saveBaseline() {
    setBaselineSaveState('saving')
    await Promise.all([
      dataProvider.upsertKpiPriorYearBaseline({ fiscalYear: year - 1, metricKey: 'economics.revenue', annualValue: baselineDraft.revenue }),
      dataProvider.upsertKpiPriorYearBaseline({ fiscalYear: year - 1, metricKey: 'economics.mol', annualValue: baselineDraft.mol }),
    ])
    await reload()
    setBaselineSaveState('saved')
    setTimeout(() => setBaselineSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const byType = (rows: PlQuarterly[], type: PlAccount['accountType']) =>
      sum(rows.filter((r) => accounts.find((a) => a.id === r.accountId)?.accountType === type).map((r) => r.amount))

    const revenue = byType(pl, 'revenue')
    const variableCosts = byType(pl, 'variable_cost')
    const fixedCosts = byType(pl, 'fixed_cost')
    const mdc = revenue - variableCosts
    const mol = mdc - fixedCosts

    const priorHasData = priorPl.length > 0
    const revenuePriorBaseline = priorBaseline.find((b) => b.metricKey === 'economics.revenue')?.annualValue ?? null
    const molPriorBaseline = priorBaseline.find((b) => b.metricKey === 'economics.mol')?.annualValue ?? null

    const revenuePrior = priorHasData ? byType(priorPl, 'revenue') : revenuePriorBaseline
    const molPrior = priorHasData
      ? byType(priorPl, 'revenue') - byType(priorPl, 'variable_cost') - byType(priorPl, 'fixed_cost')
      : molPriorBaseline
    const isEstimated = !priorHasData && (revenuePriorBaseline != null || molPriorBaseline != null)

    const costBreakdown = accounts
      .filter((a) => a.accountType !== 'revenue')
      .map((a) => ({ name: a.name, value: sum(pl.filter((r) => r.accountId === a.id).map((r) => r.amount)) }))

    const trend = allQuartersOfYear(year).map((period, i) => {
      const qRows = pl.filter((r) => r.periodQuarter === period)
      const rev = byType(qRows, 'revenue')
      const vc = byType(qRows, 'variable_cost')
      const fc = byType(qRows, 'fixed_cost')
      return { label: `T${i + 1}`, ricavi: rev, mdc: rev - vc, mol: rev - vc - fc }
    })

    const table = allQuartersOfYear(year).map((period, i) => {
      const qRows = pl.filter((r) => r.periodQuarter === period)
      const rev = byType(qRows, 'revenue')
      const vc = byType(qRows, 'variable_cost')
      const fc = byType(qRows, 'fixed_cost')
      return { label: quarterLabel(i + 1), revenue: rev, variableCosts: vc, mdc: rev - vc, fixedCosts: fc, mol: rev - vc - fc, molPct: safeDiv(rev - vc - fc, rev) }
    })

    return { revenue, variableCosts, fixedCosts, mdc, mol, revenuePrior, molPrior, isEstimated, costBreakdown, trend, table }
  }, [pl, priorPl, priorBaseline, accounts, year])

  const revenueAccounts = accounts.filter((a) => a.accountType === 'revenue')
  const variableAccounts = accounts.filter((a) => a.accountType === 'variable_cost')
  const fixedAccounts = accounts.filter((a) => a.accountType === 'fixed_cost')
  const draftRevenue = sum(revenueAccounts.map((a) => draft[a.id] ?? 0))
  const draftVariable = sum(variableAccounts.map((a) => draft[a.id] ?? 0))
  const draftFixed = sum(fixedAccounts.map((a) => draft[a.id] ?? 0))

  return (
    <div>
      <PageHeader
        title="Economics"
        subtitle="Conto economico — grana trimestrale (dati contabili disponibili solo a trimestre)"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard
          label="Ricavi"
          value={formatEur(view.revenue)}
          deviation={deviationPct(view.revenue, view.revenuePrior)}
          trend={trendOf(deviationPct(view.revenue, view.revenuePrior))}
          deviationLabel={view.isEstimated ? 'vs AFP (stimato)' : 'vs anno prec.'}
        />
        <KpiCard label="MDC" value={formatEur(view.mdc)} hint={formatPct(safeDiv(view.mdc, view.revenue))} />
        <KpiCard
          label="MOL"
          value={formatEur(view.mol)}
          deviation={deviationPct(view.mol, view.molPrior)}
          trend={trendOf(deviationPct(view.mol, view.molPrior))}
          deviationLabel={view.isEstimated ? 'vs AFP (stimato)' : 'vs anno prec.'}
          hint={formatPct(safeDiv(view.mol, view.revenue))}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Composizione costi" subtitle={`Anno ${year}`}>
          <DonutChart data={view.costBreakdown} unit="currency" />
        </SectionCard>
        <SectionCard title="Ricavi · MDC · MOL per trimestre">
          <TrendLineChart
            data={view.trend}
            series={[
              { key: 'ricavi', label: 'Ricavi' },
              { key: 'mdc', label: 'MDC' },
              { key: 'mol', label: 'MOL' },
            ]}
            unit="currency"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Inserimento dati trimestrale"
        subtitle="Seleziona il trimestre e aggiorna le voci di conto economico"
        actions={<QuarterSelect quarter={quarter} onChange={setQuarter} />}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div>
            <p className="mb-3 text-sm font-semibold text-navy-900">Ricavi</p>
            <div className="space-y-3">
              {revenueAccounts.map((a) => (
                <NumberField key={a.id} label={a.name} value={draft[a.id] ?? 0} onChange={(v) => setDraft((d) => ({ ...d, [a.id]: v }))} prefix="€" />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-navy-900">Costi variabili</p>
            <div className="space-y-3">
              {variableAccounts.map((a) => (
                <NumberField key={a.id} label={a.name} value={draft[a.id] ?? 0} onChange={(v) => setDraft((d) => ({ ...d, [a.id]: v }))} prefix="€" />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-navy-900">Costi fissi</p>
            <div className="space-y-3">
              {fixedAccounts.map((a) => (
                <NumberField key={a.id} label={a.name} value={draft[a.id] ?? 0} onChange={(v) => setDraft((d) => ({ ...d, [a.id]: v }))} prefix="€" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-card bg-stone-100 px-4 py-3 text-sm">
          <span className="text-stone-500">
            MDC anteprima: <span className="font-semibold text-navy-900">{formatEur(draftRevenue - draftVariable)}</span>
          </span>
          <span className="text-stone-500">
            MOL anteprima: <span className="font-semibold text-navy-900">{formatEur(draftRevenue - draftVariable - draftFixed)}</span>
          </span>
        </div>

        <button
          onClick={save}
          disabled={saveState === 'saving'}
          className="mt-4 rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover disabled:opacity-60"
        >
          {saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato ✓' : 'Salva trimestre'}
        </button>
      </SectionCard>

      <SectionCard
        title={`Valore AFP ${year - 1}`}
        subtitle="Da usare quando il dettaglio trimestrale reale dell'anno precedente non è (ancora) nel sistema — sostituisce la colonna 'Totale AFP' dell'Excel"
      >
        {priorPl.length > 0 && (
          <p className="mb-4 rounded-card bg-success-100 px-3 py-2 text-xs text-success-600">
            Per il {year - 1} sono già presenti dati trimestrali reali: il confronto "vs anno precedente" li usa già,
            questo valore resta come riserva solo per gli anni senza dettaglio reale.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <NumberField label="Ricavi annui" value={baselineDraft.revenue} onChange={(v) => setBaselineDraft((d) => ({ ...d, revenue: v }))} prefix="€" />
          <NumberField label="MOL annuo" value={baselineDraft.mol} onChange={(v) => setBaselineDraft((d) => ({ ...d, mol: v }))} prefix="€" />
          <button
            onClick={saveBaseline}
            disabled={baselineSaveState === 'saving'}
            className="rounded-card border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 disabled:opacity-60"
          >
            {baselineSaveState === 'saving' ? 'Salvataggio…' : baselineSaveState === 'saved' ? 'Salvato ✓' : 'Salva valore AFP'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Dati completi" subtitle={`Tutti i trimestri dell'anno ${year}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-4">Trimestre</th>
                <th className="py-2 pr-4 text-right">Ricavi</th>
                <th className="py-2 pr-4 text-right">Costi variabili</th>
                <th className="py-2 pr-4 text-right">MDC</th>
                <th className="py-2 pr-4 text-right">Costi fissi</th>
                <th className="py-2 pr-4 text-right">MOL</th>
                <th className="py-2 text-right">% MOL</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pr-4 text-navy-700">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.revenue)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.variableCosts)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.mdc)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.fixedCosts)}</td>
                  <td className="py-1.5 pr-4 text-right font-medium text-navy-900">{formatEur(row.mol)}</td>
                  <td className="py-1.5 text-right text-stone-600">{formatPct(row.molPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
