import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildAnalyticSheet, type SheetSection, type YearData } from './analyticSheet'
import { dataProvider } from './provider'
import type { Channel, KpiPriorYearBaseline, KpiTarget, ManualColKey, ManualValue, PlAccount, PlPriorYearBaseline, StudioConfig, TreatmentCategory } from './types'

async function loadYear(year: number): Promise<YearData> {
  const [visits, quotes, production, titolare, hygiene, saturation, cashflow, pl] = await Promise.all([
    dataProvider.getMonthlyVisits(year),
    dataProvider.getQuotesMonthly(year),
    dataProvider.getProductionMonthly(year),
    dataProvider.getProductionTitolareMonthly(year),
    dataProvider.getHygieneSessionsMonthly(year),
    dataProvider.getSaturationMonthly(year),
    dataProvider.getCashflowMonthly(year),
    dataProvider.getPlQuarterly(year),
  ])
  return { visits, quotes, production, titolare, hygiene, saturation, cashflow, pl }
}

interface Loaded {
  channels: Channel[]
  categories: TreatmentCategory[]
  accounts: PlAccount[]
  targets: KpiTarget[]
  config: StudioConfig | null
  manual: ManualValue[]
  kpiBaseline: KpiPriorYearBaseline[]
  afpBaseline: PlPriorYearBaseline[]
  current: YearData
  prior: YearData
}

/** Carica tutti i dati della Dashboard analitica e del nodo Inserimento dati per un anno. */
export function useAnalyticData(year: number) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    Promise.all([
      dataProvider.listChannels(),
      dataProvider.listTreatmentCategories(),
      dataProvider.listPlAccounts(),
      dataProvider.getKpiTargets(year),
      dataProvider.getStudioConfig(year),
      // se la migration 0010 non e' ancora applicata la dashboard resta utilizzabile (senza valori manuali)
      dataProvider.getManualValues(year).catch(() => [] as ManualValue[]),
      dataProvider.getKpiPriorYearBaseline(year - 1),
      dataProvider.getPlPriorYearBaseline(year - 1),
      loadYear(year),
      loadYear(year - 1),
    ])
      .then(([channels, categories, accounts, targets, config, manual, kpiBaseline, afpBaseline, current, prior]) => {
        if (!cancelled) setData({ channels, categories, accounts, targets, config, manual, kpiBaseline, afpBaseline, current, prior })
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore nel caricamento dei dati.')
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const sections: SheetSection[] = useMemo(() => (data ? buildAnalyticSheet({ year, ...data, cfmpTarget: data.config?.cfmpTarget ?? null }) : []), [data, year])

  /** Salva (o, con null, elimina) un valore manuale e aggiorna subito la vista. */
  const saveManual = useCallback(
    async (rowKey: string, colKey: ManualColKey, value: number | null) => {
      if (value == null) await dataProvider.deleteManualValue(year, rowKey, colKey)
      else await dataProvider.upsertManualValue({ fiscalYear: year, rowKey, colKey, value })
      setData((d) => {
        if (!d) return d
        const rest = d.manual.filter((m) => !(m.rowKey === rowKey && m.colKey === colKey))
        return { ...d, manual: value == null ? rest : [...rest, { fiscalYear: year, rowKey, colKey, value }] }
      })
    },
    [year],
  )

  /** Salva (o, con null, elimina) l'obiettivo di un mese (1-12) per una metrica e aggiorna subito la vista. */
  const saveTarget = useCallback(
    async (metricKey: string, month: number, value: number | null) => {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
      if (value == null) await dataProvider.deleteKpiTarget(metricKey, periodStart)
      else await dataProvider.upsertKpiTarget({ periodStart, metricKey, targetValue: value })
      setData((d) => {
        if (!d) return d
        const rest = d.targets.filter((t) => !(t.metricKey === metricKey && t.periodStart === periodStart))
        return { ...d, targets: value == null ? rest : [...rest, { periodStart, metricKey, targetValue: value }] }
      })
    },
    [year],
  )

  /** Salva i parametri di studio dell'anno (poltrone, minuti di apertura, target CFMP/saturazione). */
  const saveConfig = useCallback(
    async (patch: Partial<Omit<StudioConfig, 'year'>>) => {
      const current = data?.config
      const next: StudioConfig = {
        year,
        numChairs: patch.numChairs ?? current?.numChairs ?? 0,
        theoreticalOpeningMinutes: patch.theoreticalOpeningMinutes !== undefined ? patch.theoreticalOpeningMinutes : (current?.theoreticalOpeningMinutes ?? null),
        cfmpTarget: patch.cfmpTarget !== undefined ? patch.cfmpTarget : (current?.cfmpTarget ?? null),
      }
      await dataProvider.upsertStudioConfig(next)
      setData((d) => (d ? { ...d, config: next } : d))
    },
    [data?.config, year],
  )

  return { data, error, sections, manual: data?.manual ?? [], saveManual, saveTarget, config: data?.config ?? null, saveConfig }
}
