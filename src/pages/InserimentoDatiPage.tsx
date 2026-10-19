import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { ManualField } from '../components/ui/ManualField'
import { YearSelect } from '../components/ui/PeriodSelect'
import { SectionCard } from '../components/ui/SectionCard'
import { formatEur, formatPct } from '../lib/calc'
import type { RefSource, SheetRow } from '../lib/analyticSheet'
import { useStudio } from '../lib/studio/StudioContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import type { ManualColKey } from '../lib/types'
import { useAnalyticData } from '../lib/useAnalyticData'
import { DEFAULT_YEAR, SELECTABLE_YEARS } from '../lib/years'

type TabId = 'refs' | 'traffico' | 'preventivi' | 'produzione' | 'cashflow' | 'parametri'

const TABS: { id: TabId; label: string }[] = [
  { id: 'refs', label: 'Riferimenti (AFP e budget)' },
  { id: 'traffico', label: 'Traffico' },
  { id: 'preventivi', label: 'Preventivi' },
  { id: 'produzione', label: 'Produzione' },
  { id: 'cashflow', label: 'Cashflow' },
  { id: 'parametri', label: 'Parametri studio' },
]

// Dati nuovi per area: trimestrali (T1-T4) e annuali (una volta l'anno)
const AREAS: Record<Exclude<TabId, 'refs' | 'parametri'>, { quarterly: string[]; yearly: string[]; note: string }> = {
  traffico: {
    quarterly: ['families', 'cac', 'vmp'],
    yearly: [],
    note: 'Le visite per canale e i pazienti riattivati si inseriscono, per ora, nella pagina Traffico.',
  },
  preventivi: {
    quarterly: ['q_expected_value'],
    yearly: ['q_portfolio_count', 'q_portfolio_count_pv', 'q_portfolio_value', 'q_portfolio_value_pv'],
    note: 'I preventivi in corso (numero e €) non si digitano: la Dashboard analitica li calcola dal portafoglio di inizio anno più emessi, meno confermati e persi. Emessi, confermati e persi restano nella pagina Preventivi.',
  },
  produzione: {
    quarterly: ['production_to_execute'],
    yearly: ['production_portfolio'],
    note: 'Produzione per tipologia, quota titolare, igiene e saturazione restano, per ora, nelle pagine Produzione e Saturazione.',
  },
  cashflow: {
    quarterly: [],
    yearly: ['credit_portfolio'],
    note: 'Incassi anticipati e crediti mensili restano, per ora, nella pagina Cashflow.',
  },
}

const SOURCE_TAG: Record<Exclude<RefSource, null | 'manual'>, string> = {
  real: 'da dati reali',
  targets: 'da obiettivi mensili',
  derived: 'calcolato',
}

const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const show = (v: number | null, format: 'count' | 'currency' | 'percent') =>
  v == null ? '—' : format === 'currency' ? formatEur(v) : format === 'percent' ? formatPct(v) : decimal.format(v)

export function InserimentoDatiPage() {
  const { role } = useStudio()
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [tab, setTab] = useState<TabId>('refs')
  const { data, error, sections, manual, saveManual, config, saveConfig } = useAnalyticData(year)

  const allowed = !isSupabaseConfigured || role === 'owner'
  const manualMap = useMemo(() => new Map(manual.map((m) => [`${m.rowKey}|${m.colKey}`, m.value])), [manual])
  const getManual = (rowKey: string, col: ManualColKey) => manualMap.get(`${rowKey}|${col}`) ?? null
  const rowsByKey = useMemo(() => new Map(sections.flatMap((s) => s.rows).map((r) => [r.key, r])), [sections])

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Inserimento dati" subtitle="Riferimenti e dati che non nascono dai dati mensili" />
        <p className="rounded-card bg-warning-100 px-4 py-3 text-sm text-warning-700">L'inserimento dei dati è riservato al titolare dello studio.</p>
      </div>
    )
  }

  const field = (rowKey: string, col: ManualColKey, format: 'count' | 'currency' | 'percent', label: string, placeholder?: string, disabled?: boolean) => (
    <ManualField
      key={`${rowKey}-${col}`}
      value={getManual(rowKey, col)}
      format={format}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      onCommit={(v) => saveManual(rowKey, col, v)}
    />
  )

  const refCell = (row: SheetRow, which: 'afp' | 'budget') => {
    const ref = row.ref
    if (!ref) return null
    const info = ref[which]
    const rowKey = ref.rowKey ?? row.key
    const fmt = ref.format
    if (!info.applicable) return <span className="text-stone-300">—</span>
    if (info.src === 'real' || info.src === 'targets') {
      return (
        <div className="text-right">
          <span className="text-sm tabular-nums text-stone-900">{show(info.value, fmt)}</span>
          <span className="block text-[11px] text-stone-500">{SOURCE_TAG[info.src]}</span>
        </div>
      )
    }
    const placeholder = info.src === 'derived' ? `${show(info.value, fmt)} (calcolato)` : undefined
    return field(rowKey, which, fmt, `${row.label} — ${which === 'afp' ? `AFP ${year - 1}` : 'budget'}`, placeholder)
  }

  const refSections = sections.filter((s) => s.rows.some((r) => r.ref && !r.ref.manualQ && !r.ref.manualYear && !r.ref.cfmp && (r.ref.afp.applicable || r.ref.budget.applicable)))

  return (
    <div>
      <PageHeader
        title="Inserimento dati"
        subtitle="Un solo posto per i valori che non nascono dai dati mensili: AFP, budget, C.A.C., V.M.P., portafogli di inizio anno…"
        actions={<YearSelect year={year} onChange={setYear} years={SELECTABLE_YEARS} />}
      />

      <p className="mb-4 rounded-card bg-navy-50 px-4 py-2.5 text-xs text-navy-700">
        Inserisce solo il titolare dello studio. Ogni campo si salva quando esci dalla casella (o con Invio); una casella vuota elimina il valore. I valori
        compaiono subito nella Dashboard analitica.
      </p>

      {error && <p className="rounded-card bg-danger-100 px-4 py-3 text-sm text-danger-600">Errore nel caricamento: {error}</p>}
      {!error && !data && <p className="py-8 text-center text-sm text-stone-500">Caricamento…</p>}

      {data && (
        <>
          <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-stone-300">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                  tab === t.id ? 'border-amber-500 text-navy-700' : 'border-transparent text-stone-500 hover:text-navy-900',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'refs' && (
            <div className="space-y-5">
              <p className="text-xs text-stone-500">
                <span className="font-semibold text-stone-600">AFP {year - 1}</span> (totale annuo) serve dove l'anno precedente non ha dati nel sistema;{' '}
                <span className="font-semibold text-stone-600">budget</span> (totale annuo) dove non esistono obiettivi mensili. Dove il valore arriva già da dati reali o da
                obiettivi mensili la casella non è modificabile. Gli importi in € si digitano in euro, le percentuali come 61,4.
              </p>
              {refSections.map((section) => {
                const rows = section.rows.filter((r) => r.ref && !r.ref.manualQ && !r.ref.manualYear && !r.ref.cfmp && (r.ref.afp.applicable || r.ref.budget.applicable))
                return (
                  <SectionCard key={section.key} title={section.title} subtitle={section.description}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-stone-300 text-xs uppercase tracking-wide text-stone-500">
                            <th className="py-2 pr-3">KPI</th>
                            <th className="w-44 py-2 pr-3 text-right">AFP {year - 1}</th>
                            <th className="w-44 py-2 text-right">Budget {year}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.key} className="border-b border-stone-100 last:border-0">
                              <td className={clsx('py-1.5 pr-3', row.level === 0 ? 'font-semibold text-navy-900' : 'text-stone-600')} style={{ paddingLeft: row.level * 16 }}>
                                {row.label}
                              </td>
                              <td className="py-1.5 pr-3 align-middle">{refCell(row, 'afp')}</td>
                              <td className="py-1.5 align-middle">{refCell(row, 'budget')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )
              })}
            </div>
          )}

          {(tab === 'traffico' || tab === 'preventivi' || tab === 'produzione' || tab === 'cashflow') && (
            <SectionCard title={TABS.find((t) => t.id === tab)?.label ?? ''} subtitle={AREAS[tab].note}>
              <div className="space-y-6">
                {AREAS[tab].quarterly.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-navy-900">Dati trimestrali</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-stone-300 text-xs uppercase tracking-wide text-stone-500">
                            <th className="py-2 pr-3">Voce</th>
                            {['1° trimestre', '2° trimestre', '3° trimestre', '4° trimestre'].map((q) => (
                              <th key={q} className="w-32 py-2 pr-3 text-right">
                                {q}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {AREAS[tab].quarterly.map((key) => {
                            const row = rowsByKey.get(key)
                            if (!row?.ref) return null
                            return (
                              <tr key={key} className="border-b border-stone-100 last:border-0">
                                <td className="py-1.5 pr-3 font-medium text-navy-900">{row.label}</td>
                                {(['q1', 'q2', 'q3', 'q4'] as ManualColKey[]).map((col) => (
                                  <td key={col} className="py-1.5 pr-3">
                                    {field(key, col, row.ref?.format ?? 'count', `${row.label} — ${col.toUpperCase()}`)}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {AREAS[tab].yearly.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-navy-900">Dati annuali ({year})</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {AREAS[tab].yearly.map((key) => {
                        const row = rowsByKey.get(key)
                        if (!row?.ref) return null
                        return (
                          <label key={key} className="block">
                            <span className="mb-1 block text-xs font-semibold text-stone-600">{row.label}</span>
                            {field(key, 'year', row.ref.format, row.label)}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {tab === 'parametri' && (
            <SectionCard title="Parametri studio" subtitle={`Parametri di struttura dell'anno ${year} e dato dell'anno precedente per i calcoli della Dashboard analitica`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">Numero poltrone ({year})</span>
                  <ManualField
                    value={config?.numChairs ?? null}
                    format="count"
                    label={`Numero poltrone ${year}`}
                    onCommit={async (v) => {
                      if (v == null) throw new Error('Il numero di poltrone è obbligatorio')
                      await saveConfig({ numChairs: v })
                    }}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">Minuti complessivi di apertura teorici ({year})</span>
                  <ManualField
                    value={config?.theoreticalOpeningMinutes ?? null}
                    format="count"
                    label={`Minuti di apertura teorici ${year}`}
                    onCommit={(v) => saveConfig({ theoreticalOpeningMinutes: v })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">Target CFMP/saturazione ({year})</span>
                  <ManualField
                    value={config?.cfmpTarget ?? null}
                    format="percent"
                    label={`Target CFMP/saturazione ${year}`}
                    onCommit={(v) => saveConfig({ cfmpTarget: v })}
                  />
                  <span className="mt-1 block text-[11px] text-stone-500">È il budget della riga CFMP/saturazione (100 = CFMP uguale alla saturazione).</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">CFMP dell'anno precedente ({year - 1})</span>
                  {field('cfmp', 'afp', 'percent', `CFMP ${year - 1}`)}
                  <span className="mt-1 block text-[11px] text-stone-500">Si digita come percentuale (es. 78,6). Serve per il rapporto CFMP/saturazione.</span>
                </label>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
