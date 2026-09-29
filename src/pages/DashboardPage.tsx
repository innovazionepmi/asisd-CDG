import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { SectionCard } from '../components/ui/SectionCard'
import { YearSelect } from '../components/ui/PeriodSelect'
import { deviationPct, formatEur, formatInt, formatPct, safeDiv, sum, trendOf } from '../lib/calc'
import { dataProvider } from '../lib/provider'
import { allMonthsOfYear, allQuartersOfYear, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type {
  CashflowMonthly,
  Channel,
  MonthlyVisit,
  PlAccount,
  PlQuarterly,
  ProductionMonthly,
  QuotesMonthly,
  TreatmentCategory,
} from '../lib/types'

interface YearBundle {
  channels: Channel[]
  categories: TreatmentCategory[]
  accounts: PlAccount[]
  visits: MonthlyVisit[]
  priorVisits: MonthlyVisit[]
  quotes: QuotesMonthly[]
  production: ProductionMonthly[]
  priorProduction: ProductionMonthly[]
  pl: PlQuarterly[]
  priorPl: PlQuarterly[]
  cashflow: CashflowMonthly[]
  revenueBaselinePrior: number | null
  molBaselinePrior: number | null
}

export function DashboardPage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [data, setData] = useState<YearBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const [channels, categories, accounts, visits, priorVisits, quotes, production, priorProduction, pl, priorPl, cashflow, priorBaseline] =
          await Promise.all([
            dataProvider.listChannels(),
            dataProvider.listTreatmentCategories(),
            dataProvider.listPlAccounts(),
            dataProvider.getMonthlyVisits(year),
            dataProvider.getMonthlyVisits(year - 1),
            dataProvider.getQuotesMonthly(year),
            dataProvider.getProductionMonthly(year),
            dataProvider.getProductionMonthly(year - 1),
            dataProvider.getPlQuarterly(year),
            dataProvider.getPlQuarterly(year - 1),
            dataProvider.getCashflowMonthly(year),
            dataProvider.getKpiPriorYearBaseline(year - 1),
          ])
        if (cancelled) return
        setData({
          channels,
          categories,
          accounts,
          visits,
          priorVisits,
          quotes,
          production,
          priorProduction,
          pl,
          priorPl,
          cashflow,
          revenueBaselinePrior: priorBaseline.find((b) => b.metricKey === 'economics.revenue')?.annualValue ?? null,
          molBaselinePrior: priorBaseline.find((b) => b.metricKey === 'economics.mol')?.annualValue ?? null,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Errore imprevisto nel caricamento dei dati.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [year])

  const view = useMemo(() => {
    if (!data) return null
    const reactivationIds = new Set(data.channels.filter((c) => c.type === 'reactivation').map((c) => c.id))

    const newPatients = sum(data.visits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))
    const newPatientsPrior = sum(data.priorVisits.filter((v) => !reactivationIds.has(v.channelId)).map((v) => v.visitCount))

    const issuedCount = sum(data.quotes.map((q) => q.issuedCount))
    const confirmedCount = sum(data.quotes.map((q) => q.confirmedCount))
    const closeRate = safeDiv(confirmedCount, issuedCount)
    const confirmedValue = sum(data.quotes.map((q) => q.confirmedValue))

    const productionTotal = sum(data.production.map((p) => p.productionValue))
    const productionPriorTotal = sum(data.priorProduction.map((p) => p.productionValue))

    const revenue = sum(data.pl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'revenue').map((r) => r.amount))
    const variableCosts = sum(data.pl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'variable_cost').map((r) => r.amount))
    const fixedCosts = sum(data.pl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'fixed_cost').map((r) => r.amount))
    const mdc = revenue - variableCosts
    const mol = mdc - fixedCosts

    const revenuePriorReal = data.priorPl.length
      ? sum(data.priorPl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'revenue').map((r) => r.amount))
      : null
    const revenuePrior = revenuePriorReal ?? data.revenueBaselinePrior
    const revenuePriorIsEstimated = revenuePriorReal == null && data.revenueBaselinePrior != null

    const molPriorReal = data.priorPl.length
      ? (() => {
          const rev = sum(data.priorPl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'revenue').map((r) => r.amount))
          const vc = sum(data.priorPl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'variable_cost').map((r) => r.amount))
          const fc = sum(data.priorPl.filter((r) => data.accounts.find((a) => a.id === r.accountId)?.accountType === 'fixed_cost').map((r) => r.amount))
          return rev - vc - fc
        })()
      : null
    const molPrior = molPriorReal ?? data.molBaselinePrior

    const advancePayments = sum(data.cashflow.map((c) => c.advancePaymentsValue))

    const productionByCategory = data.categories.map((cat) => ({
      name: cat.name,
      value: sum(data.production.filter((p) => p.treatmentCategoryId === cat.id).map((p) => p.productionValue)),
    }))

    const trafficByChannel = data.channels.map((ch) => ({
      name: ch.name,
      value: sum(data.visits.filter((v) => v.channelId === ch.id).map((v) => v.visitCount)),
    }))

    const productionTrend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      corrente: sum(data.production.filter((p) => p.periodMonth === period).map((p) => p.productionValue)),
      precedente: sum(data.priorProduction.filter((p) => p.periodMonth === allMonthsOfYear(year - 1)[i]).map((p) => p.productionValue)),
    }))

    const economicsTrend = allQuartersOfYear(year).map((period, i) => {
      const revQ = sum(data.pl.filter((r) => r.periodQuarter === period && data.accounts.find((a) => a.id === r.accountId)?.accountType === 'revenue').map((r) => r.amount))
      const vcQ = sum(data.pl.filter((r) => r.periodQuarter === period && data.accounts.find((a) => a.id === r.accountId)?.accountType === 'variable_cost').map((r) => r.amount))
      const fcQ = sum(data.pl.filter((r) => r.periodQuarter === period && data.accounts.find((a) => a.id === r.accountId)?.accountType === 'fixed_cost').map((r) => r.amount))
      return { label: `T${i + 1}`, ricavi: revQ, mol: revQ - vcQ - fcQ }
    })

    return {
      newPatients,
      newPatientsPrior,
      closeRate,
      confirmedValue,
      productionTotal,
      productionPriorTotal,
      revenue,
      revenuePrior,
      revenuePriorIsEstimated,
      mol,
      molPrior,
      advancePayments,
      productionByCategory,
      trafficByChannel,
      productionTrend,
      economicsTrend,
    }
  }, [data, year])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Vista d'insieme dello studio — traffico, preventivi, produzione, economics, cashflow"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      {error ? (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">Errore nel caricamento: {error}</p>
      ) : !view ? (
        <p className="text-sm text-slate-400">Caricamento…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Nuovi pazienti"
              value={formatInt(view.newPatients)}
              deviation={deviationPct(view.newPatients, view.newPatientsPrior)}
              trend={trendOf(deviationPct(view.newPatients, view.newPatientsPrior))}
              deviationLabel="vs anno prec."
            />
            <KpiCard label="% Chiusura preventivi" value={formatPct(view.closeRate)} hint={`${formatEur(view.confirmedValue)} confermati`} />
            <KpiCard
              label="Produzione eseguita"
              value={formatEur(view.productionTotal)}
              deviation={deviationPct(view.productionTotal, view.productionPriorTotal)}
              trend={trendOf(deviationPct(view.productionTotal, view.productionPriorTotal))}
              deviationLabel="vs anno prec."
            />
            <KpiCard
              label="Ricavi"
              value={formatEur(view.revenue)}
              deviation={deviationPct(view.revenue, view.revenuePrior)}
              trend={trendOf(deviationPct(view.revenue, view.revenuePrior))}
              deviationLabel={view.revenuePriorIsEstimated ? 'vs AFP (stimato)' : 'vs anno prec.'}
            />
            <KpiCard
              label="MOL"
              value={formatEur(view.mol)}
              deviation={deviationPct(view.mol, view.molPrior)}
              trend={trendOf(deviationPct(view.mol, view.molPrior))}
              deviationLabel={view.revenuePriorIsEstimated ? 'vs AFP (stimato)' : 'vs anno prec.'}
            />
            <KpiCard label="Incassi anticipati" value={formatEur(view.advancePayments)} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Produzione per tipologia trattamento" subtitle={`Anno ${year}`}>
              <DonutChart data={view.productionByCategory} unit="currency" />
            </SectionCard>
            <SectionCard title="Traffico per canale" subtitle={`Anno ${year}`}>
              <DonutChart data={view.trafficByChannel} unit="count" />
            </SectionCard>
            <SectionCard title="Produzione mensile: anno corrente vs precedente">
              <TrendLineChart
                data={view.productionTrend}
                series={[
                  { key: 'corrente', label: String(year) },
                  { key: 'precedente', label: String(year - 1), dashed: true },
                ]}
                unit="currency"
              />
            </SectionCard>
            <SectionCard title="Ricavi e MOL per trimestre">
              <TrendLineChart
                data={view.economicsTrend}
                series={[
                  { key: 'ricavi', label: 'Ricavi' },
                  { key: 'mol', label: 'MOL' },
                ]}
                unit="currency"
              />
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  )
}
