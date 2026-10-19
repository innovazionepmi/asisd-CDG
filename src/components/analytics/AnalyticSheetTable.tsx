import clsx from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import { formatEur, formatPct } from '../../lib/calc'
import { COL_GROUP, type ColGroup, type SheetCell, type SheetRow, type SheetSection, type Tone } from '../../lib/analyticSheet'

const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const signedDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const signedInt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, signDisplay: 'exceptZero' })

const LABEL_W = 250
const COL_W = 98

const GROUP_LABELS: { group: ColGroup[]; label: string }[] = [
  { group: ['afp'], label: 'AFP' },
  { group: ['year'], label: 'Anno' },
  { group: ['budget'], label: 'Budget' },
  { group: ['q0'], label: 'T1' },
  { group: ['q1'], label: 'T2' },
  { group: ['q2'], label: 'T3' },
  { group: ['q3'], label: 'T4' },
]

function formatCell(cell: SheetCell): string {
  const v = cell.value
  if (v == null) return '—'
  if (cell.dev === 'pp') return `${signedDecimal.format(v * 100)}%`
  if (cell.dev === 'rel') return `${signedDecimal.format(v * 100)}%`
  if (cell.dev === 'abs') return cell.fmt === 'currency' ? `${signedInt.format(v)} €` : signedDecimal.format(v)
  if (cell.fmt === 'currency') return formatEur(v)
  if (cell.fmt === 'percent') return formatPct(v)
  return decimal.format(v)
}

function devTone(cell: SheetCell, tone: Tone): string {
  const v = cell.value
  if (v == null) return 'text-stone-300'
  const flat = cell.dev === 'abs' ? Math.abs(v) < 0.05 : Math.abs(v) < 0.0005
  if (flat || tone === 'neutral') return 'text-stone-500'
  const good = tone === 'higher' ? v > 0 : v < 0
  return good ? 'text-success-600' : 'text-danger-600'
}

function Cell({ row, cell, index, focused }: { row: SheetRow; cell: SheetCell; index: number; focused: boolean }) {
  const strong = row.emphasis || row.level === 0
  const base = 'border-b border-stone-100 px-2 py-1.5 text-right align-middle text-[12px] tabular-nums'
  if (cell.kind === 'na') {
    return <td key={index} className={clsx(base, 'bg-stone-200/70 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(138,134,124,0.12)_4px,rgba(138,134,124,0.12)_8px)]')} aria-label="non applicabile" />
  }
  if (cell.kind === 'blank') return <td className={clsx(base, row.emphasis ? 'bg-navy-50' : 'bg-white')} />
  return (
    <td className={clsx(base, row.emphasis ? 'bg-navy-50' : 'bg-white', focused && 'bg-amber-100/60')}>
      {cell.dev ? (
        <span className={clsx('font-semibold', devTone(cell, row.tone))}>{formatCell(cell)}</span>
      ) : (
        <span className={clsx(cell.value == null ? 'text-stone-300' : strong ? 'font-bold text-navy-900' : 'text-stone-900')}>{formatCell(cell)}</span>
      )}
    </td>
  )
}

export function AnalyticSheetTable({ sections, year }: { sections: SheetSection[]; year: number }) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set())
  const [showDetail, setShowDetail] = useState(true)
  const [hiddenGroups, setHiddenGroups] = useState<Set<ColGroup>>(new Set())
  const [focusCol, setFocusCol] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggle = <T,>(setter: (fn: (prev: Set<T>) => Set<T>) => void, key: T) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const visibleCols = COL_GROUP.map((g, i) => ({ g, i })).filter((c) => !hiddenGroups.has(c.g))
  const tableWidth = LABEL_W + visibleCols.length * COL_W
  const allCollapsed = collapsedSections.size === sections.length

  const jumpTo = (key: string) => {
    setCollapsedSections((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setTimeout(() => {
      const box = scrollRef.current
      const band = document.getElementById(`dash-sec-${key}`)
      if (!box || !band) return
      const delta = band.getBoundingClientRect().top - box.getBoundingClientRect().top
      box.scrollTo({ top: box.scrollTop + delta, behavior: 'smooth' })
    }, 30)
  }

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
        <button
          onClick={() => setCollapsedSections(allCollapsed ? new Set() : new Set(sections.map((s) => s.key)))}
          className="ml-auto text-xs font-semibold text-navy-700 hover:underline"
        >
          {allCollapsed ? 'Espandi le sezioni' : 'Comprimi le sezioni'}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="font-semibold uppercase tracking-wide text-stone-500">Colonne</span>
        {GROUP_LABELS.map((g) => (
          <label key={g.label} className="flex cursor-pointer items-center gap-1.5 font-semibold text-stone-600">
            <input
              type="checkbox"
              checked={!hiddenGroups.has(g.group[0])}
              onChange={() => toggle(setHiddenGroups, g.group[0])}
              className="accent-navy-700"
            />
            {g.label}
          </label>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 font-semibold text-stone-600">
          <input type="checkbox" checked={showDetail} onChange={(e) => setShowDetail(e.target.checked)} className="accent-navy-700" />
          Mostra il dettaglio ("di cui")
        </label>
      </div>

      <div ref={scrollRef} className="relative max-h-[76vh] overflow-auto rounded-card border border-stone-300">
        <div style={{ width: tableWidth }}>
          {sections.map((section) => {
            const collapsed = collapsedSections.has(section.key)
            const groups = section.headers.groups.filter((g) => !hiddenGroups.has(g.group))
            const sectionCols = visibleCols.filter((c) => c.i < section.headers.cols.length)
            const sectionWidth = LABEL_W + sectionCols.length * COL_W
            return (
              <table key={section.key} className="table-fixed border-separate border-spacing-0 text-left" style={{ width: sectionWidth }}>
                <colgroup>
                  <col style={{ width: LABEL_W }} />
                  {sectionCols.map((c) => (
                    <col key={c.i} style={{ width: COL_W }} />
                  ))}
                </colgroup>
                <thead>
                  <tr id={`dash-sec-${section.key}`}>
                    <th colSpan={sectionCols.length + 1} className="border-b border-navy-300 bg-navy-700 p-0 text-left">
                      <button
                        onClick={() => toggle(setCollapsedSections, section.key)}
                        aria-expanded={!collapsed}
                        className="sticky left-0 flex w-[min(100%,calc(100vw-340px))] items-center gap-2 px-3 py-2 text-left text-white"
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />}
                        <span className="text-sm font-bold">{section.title}</span>
                        <span className="hidden truncate text-xs font-medium text-navy-100 sm:inline">— {section.description}</span>
                      </button>
                    </th>
                  </tr>
                  {!collapsed && (
                    <>
                      <tr>
                        <th rowSpan={2} className="sticky left-0 top-0 z-30 border-b border-r border-stone-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                          KPI
                        </th>
                        {groups.map((g, k) => (
                          <th
                            key={k}
                            colSpan={g.span}
                            className={clsx(
                              'sticky top-0 z-20 h-7 border-b border-stone-200 px-2 text-center text-[11px] font-bold uppercase tracking-wide',
                              g.group === 'afp' ? 'bg-stone-100 text-stone-500' : g.group === 'year' || g.group === 'budget' ? 'bg-navy-50 text-navy-700' : k % 2 ? 'bg-stone-100 text-stone-500' : 'bg-white text-stone-500',
                            )}
                          >
                            {g.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {sectionCols.map((c) => (
                          <th
                            key={c.i}
                            className={clsx(
                              'sticky top-7 z-20 h-12 cursor-pointer border-b border-stone-300 bg-white px-2 text-right align-bottom text-[11px] font-semibold leading-tight text-navy-900',
                              focusCol === c.i && 'border-b-2 border-b-amber-500 bg-amber-100',
                            )}
                            onClick={() => setFocusCol(focusCol === c.i ? null : c.i)}
                            title="Clicca per evidenziare la colonna"
                          >
                            {section.headers.cols[c.i]?.label}
                          </th>
                        ))}
                      </tr>
                    </>
                  )}
                </thead>
                {!collapsed && (
                  <tbody>
                    {section.rows
                      .filter((row) => (showDetail || row.level === 0) && !row.ancestors.some((a) => collapsedRows.has(a)))
                      .map((row) => {
                        const rowBg = row.emphasis ? 'bg-navy-50' : 'bg-white'
                        const isCollapsed = collapsedRows.has(row.key)
                        return (
                          <Fragment key={row.key}>
                            <tr>
                              <th
                                scope="row"
                                className={clsx(
                                  'sticky left-0 z-10 border-b border-r border-stone-100 py-1.5 pr-2 text-left align-middle text-[12px]',
                                  rowBg,
                                  row.level === 0 ? 'font-bold text-navy-900' : 'font-medium text-stone-600',
                                )}
                                style={{ paddingLeft: `${(row.level === 0 ? 0 : row.level === 1 ? 14 : 28) + 10}px` }}
                              >
                                <span className="flex items-start gap-1">
                                  {row.hasChildren && showDetail ? (
                                    <button
                                      onClick={() => toggle(setCollapsedRows, row.key)}
                                      aria-label={isCollapsed ? 'Mostra il dettaglio' : 'Nascondi il dettaglio'}
                                      aria-expanded={!isCollapsed}
                                      className="mt-0.5 shrink-0 text-stone-400 hover:text-navy-700"
                                    >
                                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                                    </button>
                                  ) : null}
                                  <span>{row.label}</span>
                                </span>
                              </th>
                              {sectionCols.map((c) => (
                                <Cell key={c.i} row={row} cell={row.cells[c.i]} index={c.i} focused={focusCol === c.i} />
                              ))}
                            </tr>
                          </Fragment>
                        )
                      })}
                  </tbody>
                )}
              </table>
            )
          })}
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-stone-500">
        <p>
          <span className="font-semibold text-stone-600">Come leggere la tabella.</span> Le colonne sono quelle del foglio Excel "Aggregato Trimestrale",
          identiche in ogni sezione per poter scorrere una colonna dall'alto in basso. Verde = meglio del riferimento, rosso = peggio, grigio = nessun
          giudizio; le percentuali si confrontano come differenza (es. +1,2% = 1,2 punti percentuali in più). Le celle a righe grigie non sono applicabili; "—" indica un dato non disponibile
          (non ancora inserito nelle pagine dedicate o senza riferimento AFP/budget per {year}).
        </p>
        <p>
          Scostamenti dell'anno: confronto solo sui trimestri con dato. Budget del trimestre: somma o media degli obiettivi mensili (per percentuali e valori
          medi non si divide per 4). AFP: dati reali dell'anno precedente. Nel conto economico gli scostamenti sono sull'incidenza sui ricavi (differenza in punti percentuali, mostrata con %), con i ricavi
          in variazione %. Clicca sull'intestazione di una colonna per evidenziarla.
        </p>
      </div>
    </div>
  )
}
