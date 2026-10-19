import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PlStatementTable } from '../components/economics/PlStatementTable'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { QuarterSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatEur, formatPct, safeDiv, sum, trendOf } from '../lib/calc'
import { allQuartersOfYear, quarterKey } from '../lib/periods'
import { afpTotals, resolveAfp, type PlRowKind } from '../lib/plStatement'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { KpiPriorYearBaseline, PlAccount, PlPriorYearBaseline, PlQuarterly } from '../lib/types'

function AccountFields({
  accounts,
  values,
  onChange,
}: {
  accounts: PlAccount[]
  values: Record<string, number>
  onChange: (accountId: string, v: number) => void
}) {
  const groups: { title: string; items: PlAccount[] }[] = [
    { title: 'Ricavi', items: accounts.filter((a) => a.accountType === 'revenue') },
    { title: 'Costi variabili', items: accounts.filter((a) => a.accountType === 'variable_cost') },
    { title: 'Costi fissi', items: accounts.filter((a) => a.accountType === 'fixed_cost') },
  ]
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-3 text-sm font-semibold text-navy-900">{g.title}</p>
          <div className="space-y-3">
            {g.items.map((a) => (
              <NumberField key={a.id} label={a.name} value={values[a.id] ?? 0} onChange={(v) => onChange(a.id, v)} prefix="€" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function EconomicsPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1)
  const [accounts, setAccounts] = useState<PlAccount[]>([])
  const [pl, setPl] = useState<PlQuarterly[]>([])
  const [priorPl, setPriorPl] = useState<PlQuarterly[]>([])
  const [priorBaseline, setPriorBaseline] = useState<KpiPriorYearBaseline[]>([])
  const [afpBaseline, setAfpBaseline] = useState<PlPriorYearBaseline[]>([])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [afpDraft, setAfpDraft] = useState<Record<string, number>>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [baselineSaveState, setBaselineSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [acc, quarterly, priorQuarterly, baseline, perAccountBaseline] = await Promise.all([
      dataProvider.listPlAccounts(),
      dataProvider.getPlQuarterly(year),
      dataProvider.getPlQuarterly(year - 1),
      dataProvider.getKpiPriorYearBaseline(year - 1),
      dataProvider.getPlPriorYearBaseline(year - 1),
    ])
    setAccounts(acc)
    setPl(quarterly)
    setPriorPl(priorQuarterly)
    setPriorBaseline(baseline)
    setAfpBaseline(perAccountBaseline)
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

  useEffect(() => {
    const next: Record<string, number> = {}
    for (const acc of accounts) {
      next[acc.id] = afpBaseline.find((b) => b.accountId === acc.id)?.annualValue ?? 0
    }
    setAfpDraft(next)
  }, [accounts, afpBaseline])

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
    const totals = afpTotals(afpDraft, accounts)
    await Promise.all([
      ...accounts.map((acc) =>
        dataProvider.upsertPlPriorYearBaseline({ fiscalYear: year - 1, accountId: acc.id, annualValue: afpDraft[acc.id] ?? 0 }),
      ),
      // i due totali restano anche in kpi_prior_year_baseline: li legge la Dashboard
      dataProvider.upsertKpiPriorYearBaseline({ fiscalYear: year - 1, metricKey: 'economics.revenue', annualValue: totals.revenue }),
      dataProvider.upsertKpiPriorYearBaseline({ fiscalYear: year - 1, metricKey: 'economics.mol', annualValue: totals.mol }),
    ])
    await reload()
    setBaselineSaveState('saved')
    setTimeout(() => setBaselineSaveState('idle'), 1500)
  }

  const afp = useMemo(
    () => resolveAfp({ year, accounts, priorPl, afpBaseline, kpiBaseline: priorBaseline }),
    [year, accounts, priorPl, afpBaseline, priorBaseline],
  )

  const view = useMemo(() => {
    const byType = (rows: PlQuarterly[], type: PlAccount['accountType']) =>
      sum(rows.filter((r) => accounts.find((a) => a.id === r.accountId)?.accountType === type).map((r) => r.amount))

    const revenue = byType(pl, 'revenue')
    const variableCosts = byType(pl, 'variable_cost')
    const fixedCosts = byType(pl, 'fixed_cost')
    const mdc = revenue - variableCosts
    const mol = mdc - fixedCosts

    const afpKnown = (kind: PlRowKind) => (afp.column && (!afp.column.knownKinds || afp.column.knownKinds.includes(kind)) ? afp.column.computed : null)
    const revenuePrior = afpKnown('revenue')?.revenue ?? null
    const molPrior = afpKnown('mol')?.mol ?? null
    const isEstimated = afp.source === 'baseline' || afp.source === 'totals'

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

    return { revenue, mdc, mol, revenuePrior, molPrior, isEstimated, costBreakdown, trend }
  }, [pl, accounts, year, afp])

  const draftRevenue = sum(accounts.filter((a) => a.accountType === 'revenue').map((a) => draft[a.id] ?? 0))
  const draftVariable = sum(accounts.filter((a) => a.accountType === 'variable_cost').map((a) => draft[a.id] ?? 0))
  const draftFixed = sum(accounts.filter((a) => a.accountType === 'fixed_cost').map((a) => draft[a.id] ?? 0))
  const afpDraftTotals = afpTotals(afpDraft, accounts)

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

      <div className="mb-6">
        <SectionCard
          title="Conto economico"
          subtitle={`Anno ${year} — ricavi, costi variabili, MDC, costi fissi e MOL, con confronto vs AFP ${year - 1}`}
        >
          <PlStatementTable accounts={accounts} pl={pl} afp={afp} year={year} />
        </SectionCard>
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
        <AccountFields accounts={accounts} values={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} />

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

      <div className="mt-6">
        <SectionCard
          title={`Valore AFP ${year - 1}`}
          subtitle="Totale annuo per voce dell'anno precedente — sostituisce la colonna 'Anno Fiscale Precedente' dell'Excel. Serve quando il dettaglio trimestrale reale di quell'anno non è (ancora) nel sistema."
        >
          {priorPl.length > 0 && (
            <p className="mb-4 rounded-card bg-success-100 px-3 py-2 text-xs text-success-600">
              Per il {year - 1} sono già presenti dati trimestrali reali: il confronto "vs AFP" li usa già, questi valori restano come riserva solo per
              gli anni senza dettaglio reale.
            </p>
          )}
          <AccountFields accounts={accounts} values={afpDraft} onChange={(id, v) => setAfpDraft((d) => ({ ...d, [id]: v }))} />

          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-card bg-stone-100 px-4 py-3 text-sm">
            <span className="text-stone-500">
              MOL AFP anteprima: <span className="font-semibold text-navy-900">{formatEur(afpDraftTotals.mol)}</span>
            </span>
          </div>

          <button
            onClick={saveBaseline}
            disabled={baselineSaveState === 'saving'}
            className="mt-4 rounded-card border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 disabled:opacity-60"
          >
            {baselineSaveState === 'saving' ? 'Salvataggio…' : baselineSaveState === 'saved' ? 'Salvato ✓' : 'Salva valore AFP'}
          </button>
        </SectionCard>
      </div>
    </div>
  )
}
