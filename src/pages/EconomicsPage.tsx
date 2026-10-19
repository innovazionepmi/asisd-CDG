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
import {
  afpTotals,
  compute,
  planCumulativeSave,
  QUARTER_END,
  QUARTER_START,
  resolveAfp,
  valuesForQuarters,
  type PlRowKind,
} from '../lib/plStatement'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { KpiPriorYearBaseline, PlAccount, PlPriorYearBaseline, PlQuarterly } from '../lib/types'

function AccountFields({
  accounts,
  values,
  onChange,
  hints,
}: {
  accounts: PlAccount[]
  values: Record<string, number>
  onChange: (accountId: string, v: number) => void
  hints?: Record<string, string>
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
              <NumberField key={a.id} label={a.name} value={values[a.id] ?? 0} onChange={(v) => onChange(a.id, v)} prefix="€" hint={hints?.[a.id]} />
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

  // Il form lavora sul CUMULATO da inizio anno fino al trimestre scelto;
  // a database resta il delta del singolo trimestre (vedi planCumulativeSave).
  useEffect(() => {
    const ytd = valuesForQuarters(pl, year, 1, quarter)
    const next: Record<string, number> = {}
    for (const acc of accounts) next[acc.id] = ytd[acc.id] ?? 0
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
    const writes = planCumulativeSave({ pl, accounts, year, quarter, ytd: draft })
    await Promise.all(writes.map((w) => dataProvider.upsertPlQuarterly(w)))
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

  const prevYtd = useMemo(() => (quarter > 1 ? valuesForQuarters(pl, year, 1, quarter - 1) : {}), [pl, year, quarter])
  const draftTotals = compute(draft, accounts)
  const prevTotals = compute(prevYtd, accounts)
  const quarterRevenue = draftTotals.revenue - prevTotals.revenue
  const quarterMol = draftTotals.mol - prevTotals.mol
  const negativeAccounts = accounts.filter((a) => (draft[a.id] ?? 0) < (prevYtd[a.id] ?? 0) - 0.005)
  const nextQuarterHasData = quarter < 4 && pl.some((r) => r.periodQuarter === quarterKey(year, quarter + 1) && r.amount !== 0)
  const prevHints: Record<string, string> | undefined =
    quarter > 1
      ? Object.fromEntries(accounts.map((a) => [a.id, `Cumulato al ${QUARTER_END[quarter - 2]}: ${formatEur(prevYtd[a.id] ?? 0)}`]))
      : undefined
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
        title="Trimestrale inserimento dati"
        subtitle="Inserisci i valori cumulati da inizio anno fino al trimestre selezionato: i valori del singolo trimestre si ricavano per differenza."
        actions={<QuarterSelect quarter={quarter} onChange={setQuarter} labelFor={(q) => `Al ${QUARTER_END[q - 1]} (cumulato)`} />}
      >
        <p className="mb-4 rounded-card bg-navy-50 px-3 py-2 text-xs text-navy-700">
          Stai inserendo il cumulato <span className="font-semibold">dal {QUARTER_START[0]} al {QUARTER_END[quarter - 1]}</span> {year}.
          {nextQuarterHasData && ' I trimestri successivi già inseriti mantengono il loro cumulato.'}
        </p>
        <AccountFields accounts={accounts} values={draft} onChange={(id, v) => setDraft((d) => ({ ...d, [id]: v }))} hints={prevHints} />

        {negativeAccounts.length > 0 && (
          <p className="mt-4 rounded-card bg-warning-100 px-3 py-2 text-xs text-warning-700">
            Attenzione: per {negativeAccounts.length === 1 ? 'questa voce' : 'queste voci'} il cumulato è inferiore a quello del trimestre precedente (il
            trimestre risulterebbe negativo): {negativeAccounts.map((a) => a.name).join(', ')}.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-card bg-stone-100 px-4 py-3 text-sm">
          <span className="text-stone-500">
            MDC cumulato: <span className="font-semibold text-navy-900">{formatEur(draftTotals.mdc)}</span>
          </span>
          <span className="text-stone-500">
            MOL cumulato: <span className="font-semibold text-navy-900">{formatEur(draftTotals.mol)}</span>
          </span>
          {quarter > 1 && (
            <span className="text-stone-500">
              Solo questo trimestre — ricavi: <span className="font-semibold text-navy-900">{formatEur(quarterRevenue)}</span>, MOL:{' '}
              <span className="font-semibold text-navy-900">{formatEur(quarterMol)}</span>
            </span>
          )}
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
