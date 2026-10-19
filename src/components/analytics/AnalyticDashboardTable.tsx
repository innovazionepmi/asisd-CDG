import clsx from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { formatEur, formatPct } from '../../lib/calc'
import type { DashCell, DashFormat, DashRow, DashSection, DashTone, Dev } from '../../lib/analyticDashboard'

const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const signedDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const signedCompact = new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1, signDisplay: 'exceptZero' })

const QUARTER_SUB = ['gen – mar', 'apr – giu', 'lug – set', 'ott – dic']

type ColKey = 'afp' | 'budget' | 'year' | 'q0' | 'q1' | 'q2' | 'q3'

function formatValue(v: number | null, format: DashFormat): string {
  if (v == null) return '—'
  if (format === 'currency') return formatEur(v)
  if (format === 'percent') return formatPct(v)
  return decimal.format(v)
}

function formatDev(dev: Dev, format: DashFormat): string {
  if (dev.kind === 'pp') return `${signedDecimal.format(dev.value * 100)} pp`
  if (dev.kind === 'rel') return `${signedDecimal.format(dev.value * 100)}%`
  if (format === 'currency') return `${signedCompact.format(dev.value)} €`
  return signedDecimal.format(dev.value)
}

function devTone(dev: Dev, tone: DashTone): string {
  const flat = dev.kind === 'abs' ? Math.abs(dev.value) < 0.05 : Math.abs(dev.value) < 0.0005
  if (flat || tone === 'neutral') return 'text-stone-500'
  const good = tone === 'higher' ? dev.value > 0 : dev.value < 0
  return good ? 'text-success-600' : 'text-danger-600'
}

function DevLine({ label, dev, row }: { label: string; dev: Dev | null; row: DashRow }) {
  if (!dev) return null
  return (
    <span className={clsx('whitespace-nowrap font-semibold tabular-nums', devTone(dev, row.tone))}>
      <span className="font-medium text-stone-400">{label}</span> {formatDev(dev, row.format)}
    </span>
  )
}

function DataCell({ row, cell, showProgressive }: { row: DashRow; cell: DashCell; showProgressive: boolean }) {
  if (cell.value == null) return <span className="text-stone-300">—</span>
  const strong = row.emphasis || row.level === 0
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={clsx('text-[13px] tabular-nums', strong ? 'font-bold text-navy-900' : 'font-semibold text-stone-900')}>
        {formatValue(cell.value, row.format)}
      </span>
      {(cell.pct != null || cell.dAfp || cell.dBdgt) && (
        <span className="flex flex-wrap items-center justify-end gap-x-1.5 text-[11px]">
          {cell.pct != null && !row.hidePct && (
            <span className="tabular-nums text-stone-500">{formatPct(cell.pct)}</span>
          )}
          <DevLine label="AFP" dev={cell.dAfp} row={row} />
          <DevLine label="BDGT" dev={cell.dBdgt} row={row} />
        </span>
      )}
      {showProgressive && cell.progressive != null && (
        <span className="whitespace-nowrap text-[10.5px] tabular-nums text-stone-400">Progr. {formatValue(cell.progressive, row.format)}</span>
      )}
    </div>
  )
}

export function AnalyticDashboardTable({ sections, year }: { sections: DashSection[]; year: number }) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set())
  const [showDetail, setShowDetail] = useState(true)
  const [focusCol, setFocusCol] = useState<ColKey | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleSet = (setter: typeof setCollapsedSections, key: string) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const allCollapsed = collapsedSections.size === sections.length

  const jumpTo = (key: string) => {
    setCollapsedSections((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    // le intestazioni fisse coprono ~76px: la sezione si ferma subito sotto
    setTimeout(() => {
      const box = scrollRef.current
      const band = document.getElementById(`dash-sec-${key}`)
      if (!box || !band) return
      const delta = band.getBoundingClientRect().top - box.getBoundingClientRect().top
      box.scrollTo({ top: box.scrollTop + delta - 76, behavior: 'smooth' })
    })
  }

  const columns: { key: ColKey; title: string; sub: string }[] = [
    { key: 'afp', title: `AFP ${year - 1}`, sub: 'anno precedente' },
    { key: 'budget', title: 'Budget', sub: `anno ${year}` },
    { key: 'year', title: `Anno ${year}`, sub: 'totale / media' },
    ...QUARTER_SUB.map((sub, i) => ({ key: `q${i}` as ColKey, title: `T${i + 1}`, sub })),
  ]

  const tint = (key: ColKey) => (focusCol === key ? 'bg-amber-100/50' : '')
  const colSpan = columns.length + 1

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Vai a</span>
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => jumpTo(s.key)}
            className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-navy-700 transition-colors hover:bg-navy-50"
          >
            {s.title.replace(/^[^:]+: /, '')}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 font-semibold text-stone-600">
            <input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} className="accent-navy-700" />
            Mostra il dettaglio ("di cui")
          </label>
          <button
            onClick={() => setCollapsedSections(allCollapsed ? new Set() : new Set(sections.map((s) => s.key)))}
            className="font-semibold text-navy-700 hover:underline"
          >
            {allCollapsed ? 'Espandi le sezioni' : 'Comprimi le sezioni'}
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="relative max-h-[74vh] overflow-auto rounded-card border border-stone-300">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-[168px] max-w-[190px] border-b border-r border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 md:w-[236px] md:min-w-[236px] md:max-w-[236px] md:px-3">
                KPI
              </th>
              <th colSpan={2} className="sticky top-0 z-20 h-7 border-b border-stone-200 bg-stone-100 px-3 text-center text-[11px] font-bold uppercase tracking-wide text-stone-500">
                Riferimenti
              </th>
              <th className="sticky top-0 z-20 h-7 border-b border-stone-200 bg-navy-50 px-3 text-center text-[11px] font-bold uppercase tracking-wide text-navy-700">
                Anno
              </th>
              <th colSpan={4} className="sticky top-0 z-20 h-7 border-b border-stone-200 bg-stone-100 px-3 text-center text-[11px] font-bold uppercase tracking-wide text-stone-500">
                Analisi per trimestre
              </th>
            </tr>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    'sticky top-7 z-20 min-w-[112px] border-b border-stone-300 bg-white px-2.5 py-1.5 text-right align-bottom md:min-w-[116px]',
                    col.key === 'budget' && 'border-r',
                    col.key === 'year' && 'border-r bg-navy-50',
                    focusCol === col.key && 'border-b-2 border-b-amber-500',
                  )}
                >
                  <button onClick={() => setFocusCol(focusCol === col.key ? null : col.key)} title="Clicca per evidenziare la colonna" className="block w-full text-right">
                    <span className="block text-sm font-bold text-navy-900">{col.title}</span>
                    <span className="block text-[11px] font-medium text-stone-500">{col.sub}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const sectionCollapsed = collapsedSections.has(section.key)
              return (
                <Fragment key={section.key}>
                  <tr id={`dash-sec-${section.key}`}>
                    <td colSpan={colSpan} className="border-b border-navy-300 bg-navy-700 p-0">
                      <button
                        onClick={() => toggleSet(setCollapsedSections, section.key)}
                        aria-expanded={!sectionCollapsed}
                        className="sticky left-0 flex w-[min(100%,100vw)] items-center gap-2 px-3 py-2 text-left text-white md:w-[min(100%,calc(100vw-340px))]"
                      >
                        {sectionCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
                        <span className="text-sm font-bold">{section.title}</span>
                        <span className="hidden truncate text-xs font-medium text-navy-100 sm:inline">— {section.description}</span>
                      </button>
                    </td>
                  </tr>
                  {!sectionCollapsed &&
                    section.rows
                      .filter((row) => (showDetail || row.level === 0) && !row.ancestors.some((a) => collapsedRows.has(a)))
                      .map((row) => {
                        const rowBg = row.emphasis ? 'bg-navy-50' : 'bg-white'
                        const collapsedHere = collapsedRows.has(row.key)
                        return (
                          <tr key={row.key}>
                            <th
                              scope="row"
                              className={clsx(
                                'sticky left-0 z-10 max-w-[190px] border-b border-r border-stone-100 px-2.5 py-2 text-left align-top text-xs md:max-w-[236px] md:px-3 md:text-[13px]',
                                rowBg,
                                row.level === 0 ? 'font-bold text-navy-900' : 'font-medium text-stone-600',
                              )}
                              style={{ paddingLeft: `${(row.level === 0 ? 0 : row.level === 1 ? 14 : 28) + 10}px` }}
                            >
                              <span className="flex items-start gap-1">
                                {row.hasChildren && showDetail ? (
                                  <button
                                    onClick={() => toggleSet(setCollapsedRows, row.key)}
                                    aria-label={collapsedHere ? 'Mostra il dettaglio' : 'Nascondi il dettaglio'}
                                    aria-expanded={!collapsedHere}
                                    className="mt-0.5 shrink-0 rounded text-stone-400 hover:text-navy-700"
                                  >
                                    {collapsedHere ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                                  </button>
                                ) : null}
                                <span>{row.label}</span>
                              </span>
                            </th>
                            <td className={clsx('border-b border-stone-100 bg-stone-100/60 px-2.5 py-2 text-right align-top', tint('afp'))}>
                              {row.afp.value == null ? (
                                <span className="text-stone-300">—</span>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-[13px] font-semibold tabular-nums text-stone-900">{formatValue(row.afp.value, row.format)}</span>
                                  {row.afp.pct != null && !row.hidePct && <span className="text-[11px] tabular-nums text-stone-500">{formatPct(row.afp.pct)}</span>}
                                  {row.afp.perQuarter != null && (
                                    <span className="whitespace-nowrap text-[10.5px] tabular-nums text-stone-400">media trim. {formatValue(row.afp.perQuarter, row.format)}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className={clsx('border-b border-r border-stone-100 bg-stone-100/60 px-2.5 py-2 text-right align-top', tint('budget'))}>
                              {row.budget == null ? (
                                <span className="text-stone-300">—</span>
                              ) : (
                                <span className="text-[13px] font-semibold tabular-nums text-stone-900">{formatValue(row.budget, row.format)}</span>
                              )}
                            </td>
                            <td className={clsx('border-b border-r border-stone-100 bg-navy-50/70 px-2.5 py-2 text-right align-top', tint('year'))}>
                              {row.forecast ? <span className="text-stone-300">—</span> : <DataCell row={row} cell={row.year} showProgressive={false} />}
                            </td>
                            {row.quarters.map((cell, i) => (
                              <td key={i} className={clsx('border-b border-stone-100 px-2.5 py-2 text-right align-top', rowBg, tint(`q${i}` as ColKey))}>
                                <DataCell row={row} cell={cell} showProgressive />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-xs text-stone-500">
        <p>
          <span className="font-semibold text-stone-600">Come leggere le celle.</span> In alto il valore. Sotto: <span className="font-semibold">AFP</span> = scostamento
          dalla media trimestrale dell'anno precedente (per le percentuali dal valore dell'anno precedente), <span className="font-semibold">BDGT</span> =
          scostamento dal budget del trimestre (somma o media degli obiettivi mensili), <span className="font-semibold">Progr.</span> = progressivo da inizio anno.
          Verde = meglio del riferimento, rosso = peggio, grigio = nessun giudizio. Le percentuali si confrontano in punti percentuali (pp); gli importi grandi sono
          abbreviati (k = migliaia, Mln = milioni).
        </p>
        <p>
          La colonna Anno è il totale (o la media, per percentuali e valori medi) dei trimestri con dato; i suoi scostamenti confrontano solo quei trimestri con
          l'AFP e il budget corrispondenti. I crediti sono fotografie di fine periodo (valore dell'ultimo mese con dato). Nel conto economico gli scostamenti sono
          sull'incidenza sui ricavi (pp), con i ricavi in variazione % sui 12 mesi. Clicca sull'intestazione di una colonna per evidenziarla e scorrerla in verticale.
        </p>
      </div>
    </div>
  )
}
