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
import type { HygieneSessionsMonthly, ProductionMonthly, ProductionTitolareMonthly, TreatmentCategory } from '../lib/types'

export function ProduzionePage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [categories, setCategories] = useState<TreatmentCategory[]>([])
  const [production, setProduction] = useState<ProductionMonthly[]>([])
  const [priorProduction, setPriorProduction] = useState<ProductionMonthly[]>([])
  const [titolare, setTitolare] = useState<ProductionTitolareMonthly[]>([])
  const [hygiene, setHygiene] = useState<HygieneSessionsMonthly[]>([])
  const [draftCategories, setDraftCategories] = useState<Record<string, number>>({})
  const [draftTitolare, setDraftTitolare] = useState(0)
  const [draftHygiene, setDraftHygiene] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function reload() {
    const [cats, prod, priorProd, tit, hyg] = await Promise.all([
      dataProvider.listTreatmentCategories(),
      dataProvider.getProductionMonthly(year),
      dataProvider.getProductionMonthly(year - 1),
      dataProvider.getProductionTitolareMonthly(year),
      dataProvider.getHygieneSessionsMonthly(year),
    ])
    setCategories(cats)
    setProduction(prod)
    setPriorProduction(priorProd)
    setTitolare(tit)
    setHygiene(hyg)
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  useEffect(() => {
    const period = monthKey(year, month)
    const nextCats: Record<string, number> = {}
    for (const cat of categories) {
      nextCats[cat.id] = production.find((p) => p.periodMonth === period && p.treatmentCategoryId === cat.id)?.productionValue ?? 0
    }
    setDraftCategories(nextCats)
    setDraftTitolare(titolare.find((t) => t.periodMonth === period)?.productionValue ?? 0)
    setDraftHygiene(hygiene.find((h) => h.periodMonth === period)?.sessionCount ?? 0)
  }, [categories, production, titolare, hygiene, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all([
      ...categories.map((cat) => dataProvider.upsertProductionMonthly({ periodMonth: period, treatmentCategoryId: cat.id, productionValue: draftCategories[cat.id] ?? 0 })),
      dataProvider.upsertProductionTitolareMonthly({ periodMonth: period, productionValue: draftTitolare }),
      dataProvider.upsertHygieneSessionsMonthly({ periodMonth: period, sessionCount: draftHygiene }),
    ])
    await reload()
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const view = useMemo(() => {
    const total = sum(production.map((p) => p.productionValue))
    const totalPrior = sum(priorProduction.map((p) => p.productionValue))
    const titolareTotal = sum(titolare.map((t) => t.productionValue))
    const titolareShare = safeDiv(titolareTotal, total)
    const hygieneTotal = sum(hygiene.map((h) => h.sessionCount))

    const byCategory = categories.map((cat) => ({
      name: cat.name,
      value: sum(production.filter((p) => p.treatmentCategoryId === cat.id).map((p) => p.productionValue)),
    }))

    const trend = allMonthsOfYear(year).map((period, i) => ({
      label: MONTH_LABELS_SHORT_IT[i],
      corrente: sum(production.filter((p) => p.periodMonth === period).map((p) => p.productionValue)),
      precedente: sum(priorProduction.filter((p) => p.periodMonth === allMonthsOfYear(year - 1)[i]).map((p) => p.productionValue)),
    }))

    const table = allMonthsOfYear(year).map((period, i) => {
      const monthRows = production.filter((p) => p.periodMonth === period)
      return {
        label: MONTH_LABELS_IT[i],
        total: sum(monthRows.map((p) => p.productionValue)),
        titolare: titolare.find((t) => t.periodMonth === period)?.productionValue ?? 0,
        hygiene: hygiene.find((h) => h.periodMonth === period)?.sessionCount ?? 0,
      }
    })

    return { total, totalPrior, titolareTotal, titolareShare, hygieneTotal, byCategory, trend, table }
  }, [production, priorProduction, titolare, hygiene, categories, year])

  return (
    <div>
      <PageHeader
        title="Produzione"
        subtitle="Valore eseguito per tipologia di trattamento — grana mensile"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Produzione totale"
          value={formatEur(view.total)}
          deviation={deviationPct(view.total, view.totalPrior)}
          trend={trendOf(deviationPct(view.total, view.totalPrior))}
          deviationLabel="vs anno prec."
        />
        <KpiCard label="Quota titolare" value={formatPct(view.titolareShare)} hint={formatEur(view.titolareTotal)} />
        <KpiCard label="Sedute di igiene" value={formatInt(view.hygieneTotal)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Produzione per tipologia" subtitle={`Anno ${year}`}>
          <DonutChart data={view.byCategory} unit="currency" />
        </SectionCard>
        <SectionCard title="Trend mensile: anno corrente vs precedente">
          <TrendLineChart
            data={view.trend}
            series={[
              { key: 'corrente', label: String(year) },
              { key: 'precedente', label: String(year - 1), dashed: true },
            ]}
            unit="currency"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Inserimento dati mensile"
        subtitle="Seleziona il mese e aggiorna la produzione per tipologia"
        actions={<MonthSelect month={month} onChange={setMonth} />}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((cat) => (
            <NumberField
              key={cat.id}
              label={cat.name}
              value={draftCategories[cat.id] ?? 0}
              onChange={(v) => setDraftCategories((d) => ({ ...d, [cat.id]: v }))}
            />
          ))}
          <NumberField label="Di cui Titolare" value={draftTitolare} onChange={setDraftTitolare} />
          <NumberField label="Nr. sedute igiene" value={draftHygiene} onChange={setDraftHygiene} />
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
                <th className="py-2 pr-4 text-right">Produzione totale</th>
                <th className="py-2 pr-4 text-right">Di cui Titolare</th>
                <th className="py-2 text-right">Sedute igiene</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right font-medium text-slate-900">{formatEur(row.total)}</td>
                  <td className="py-1.5 pr-4 text-right text-slate-600">{formatEur(row.titolare)}</td>
                  <td className="py-1.5 text-right text-slate-600">{formatInt(row.hygiene)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
