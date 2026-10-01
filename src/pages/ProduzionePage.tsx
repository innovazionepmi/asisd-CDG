import { useEffect, useMemo, useState } from 'react'
import { DonutChart } from '../components/charts/DonutChart'
import { TrendLineChart } from '../components/charts/TrendLineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { KpiCard } from '../components/ui/KpiCard'
import { MonthSelect, YearSelect } from '../components/ui/PeriodSelect'
import { NumberField } from '../components/ui/NumberField'
import { PercentField } from '../components/ui/PercentField'
import { SectionCard } from '../components/ui/SectionCard'
import { deviationPct, formatEur, formatInt, formatPct, safeDiv, sum, trendOf } from '../lib/calc'
import { allMonthsOfYear, monthKey, MONTH_LABELS_IT, MONTH_LABELS_SHORT_IT } from '../lib/periods'
import { dataProvider } from '../lib/provider'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'
import type { HygieneSessionsMonthly, KpiTarget, ProductionMonthly, ProductionTitolareMonthly, TreatmentCategory } from '../lib/types'

const TOTAL_TARGET_KEY = 'production.total'
const TITOLARE_TARGET_KEY = 'production.titolare'
const TITOLARE_SHARE_TARGET_KEY = 'production.titolare_share'
const HYGIENE_TARGET_KEY = 'production.hygiene_sessions'

export function ProduzionePage() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [categories, setCategories] = useState<TreatmentCategory[]>([])
  const [production, setProduction] = useState<ProductionMonthly[]>([])
  const [priorProduction, setPriorProduction] = useState<ProductionMonthly[]>([])
  const [titolare, setTitolare] = useState<ProductionTitolareMonthly[]>([])
  const [hygiene, setHygiene] = useState<HygieneSessionsMonthly[]>([])
  const [targets, setTargets] = useState<KpiTarget[]>([])
  const [draftCategories, setDraftCategories] = useState<Record<string, number>>({})
  const [draftTitolare, setDraftTitolare] = useState(0)
  const [draftHygiene, setDraftHygiene] = useState(0)
  const [draftTargetTotal, setDraftTargetTotal] = useState(0)
  const [draftTargetTitolare, setDraftTargetTitolare] = useState(0)
  const [draftTargetTitolareShare, setDraftTargetTitolareShare] = useState(0)
  const [draftTargetHygiene, setDraftTargetHygiene] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const relevantKeys = [TOTAL_TARGET_KEY, TITOLARE_TARGET_KEY, TITOLARE_SHARE_TARGET_KEY, HYGIENE_TARGET_KEY]

  async function reload() {
    const [cats, prod, priorProd, tit, hyg, tg] = await Promise.all([
      dataProvider.listTreatmentCategories(),
      dataProvider.getProductionMonthly(year),
      dataProvider.getProductionMonthly(year - 1),
      dataProvider.getProductionTitolareMonthly(year),
      dataProvider.getHygieneSessionsMonthly(year),
      dataProvider.getKpiTargets(year),
    ])
    setCategories(cats)
    setProduction(prod)
    setPriorProduction(priorProd)
    setTitolare(tit)
    setHygiene(hyg)
    setTargets(tg.filter((t) => relevantKeys.includes(t.metricKey)))
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
    const targetFor = (key: string) => targets.find((t) => t.periodStart === period && t.metricKey === key)?.targetValue ?? 0
    setDraftTargetTotal(targetFor(TOTAL_TARGET_KEY))
    setDraftTargetTitolare(targetFor(TITOLARE_TARGET_KEY))
    setDraftTargetTitolareShare(targetFor(TITOLARE_SHARE_TARGET_KEY))
    setDraftTargetHygiene(targetFor(HYGIENE_TARGET_KEY))
  }, [categories, production, titolare, hygiene, targets, year, month])

  async function save() {
    setSaveState('saving')
    const period = monthKey(year, month)
    await Promise.all([
      ...categories.map((cat) => dataProvider.upsertProductionMonthly({ periodMonth: period, treatmentCategoryId: cat.id, productionValue: draftCategories[cat.id] ?? 0 })),
      dataProvider.upsertProductionTitolareMonthly({ periodMonth: period, productionValue: draftTitolare }),
      dataProvider.upsertHygieneSessionsMonthly({ periodMonth: period, sessionCount: draftHygiene }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: TOTAL_TARGET_KEY, targetValue: draftTargetTotal }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: TITOLARE_TARGET_KEY, targetValue: draftTargetTitolare }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: TITOLARE_SHARE_TARGET_KEY, targetValue: draftTargetTitolareShare }),
      dataProvider.upsertKpiTarget({ periodStart: period, metricKey: HYGIENE_TARGET_KEY, targetValue: draftTargetHygiene }),
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

    const targetSum = (key: string) => sum(targets.filter((t) => t.metricKey === key).map((t) => t.targetValue))
    const targetAvg = (key: string) => {
      const rows = targets.filter((t) => t.metricKey === key)
      return rows.length ? sum(rows.map((t) => t.targetValue)) / rows.length : null
    }
    const totalTarget = targetSum(TOTAL_TARGET_KEY)
    const titolareShareTarget = targetAvg(TITOLARE_SHARE_TARGET_KEY)
    const hygieneTarget = targetSum(HYGIENE_TARGET_KEY)

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
      const monthTotal = sum(production.filter((p) => p.periodMonth === period).map((p) => p.productionValue))
      const target = targets.find((t) => t.periodStart === period && t.metricKey === TOTAL_TARGET_KEY)?.targetValue ?? null
      return {
        label: MONTH_LABELS_IT[i],
        total: monthTotal,
        titolare: titolare.find((t) => t.periodMonth === period)?.productionValue ?? 0,
        hygiene: hygiene.find((h) => h.periodMonth === period)?.sessionCount ?? 0,
        target,
        deviation: target != null ? monthTotal - target : null,
      }
    })

    return { total, totalPrior, titolareTotal, titolareShare, hygieneTotal, totalTarget, titolareShareTarget, hygieneTarget, byCategory, trend, table }
  }, [production, priorProduction, titolare, hygiene, targets, categories, year])

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
          deviation={deviationPct(view.total, view.totalTarget)}
          trend={trendOf(deviationPct(view.total, view.totalTarget))}
          deviationLabel="vs obiettivo"
        />
        <KpiCard
          label="Quota titolare"
          value={formatPct(view.titolareShare)}
          hint={formatEur(view.titolareTotal)}
          deviation={deviationPct(view.titolareShare, view.titolareShareTarget)}
          trend={trendOf(deviationPct(view.titolareShare, view.titolareShareTarget))}
          deviationLabel="vs obiettivo"
        />
        <KpiCard
          label="Sedute di igiene"
          value={formatInt(view.hygieneTotal)}
          deviation={deviationPct(view.hygieneTotal, view.hygieneTarget)}
          trend={trendOf(deviationPct(view.hygieneTotal, view.hygieneTarget))}
          deviationLabel="vs obiettivo"
        />
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
        subtitle="Seleziona il mese e aggiorna la produzione per tipologia e gli obiettivi"
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
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 sm:grid-cols-4">
          <NumberField label="Obiettivo produzione totale" value={draftTargetTotal} onChange={setDraftTargetTotal} />
          <NumberField label="Obiettivo produzione titolare" value={draftTargetTitolare} onChange={setDraftTargetTitolare} />
          <PercentField label="Obiettivo quota titolare" value={draftTargetTitolareShare} onChange={setDraftTargetTitolareShare} />
          <NumberField label="Obiettivo sedute igiene" value={draftTargetHygiene} onChange={setDraftTargetHygiene} />
        </div>
        <button
          onClick={save}
          disabled={saveState === 'saving'}
          className="mt-4 rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover disabled:opacity-60"
        >
          {saveState === 'saving' ? 'Salvataggio…' : saveState === 'saved' ? 'Salvato ✓' : 'Salva mese'}
        </button>
      </SectionCard>

      <SectionCard title="Dati completi" subtitle={`Tutti i mesi dell'anno ${year}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-xs uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-4">Mese</th>
                <th className="py-2 pr-4 text-right">Produzione totale</th>
                <th className="py-2 pr-4 text-right">Di cui Titolare</th>
                <th className="py-2 pr-4 text-right">Sedute igiene</th>
                <th className="py-2 pr-4 text-right">Obiettivo</th>
                <th className="py-2 text-right">Scostamento</th>
              </tr>
            </thead>
            <tbody>
              {view.table.map((row) => (
                <tr key={row.label} className="border-b border-stone-100 last:border-0">
                  <td className="py-1.5 pr-4 text-navy-700">{row.label}</td>
                  <td className="py-1.5 pr-4 text-right font-medium text-navy-900">{formatEur(row.total)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.titolare)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatInt(row.hygiene)}</td>
                  <td className="py-1.5 pr-4 text-right text-stone-600">{formatEur(row.target)}</td>
                  <td className="py-1.5 text-right text-stone-600">{formatEur(row.deviation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
