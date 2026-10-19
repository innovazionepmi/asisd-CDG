import clsx from 'clsx'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatEur, formatPct } from '../../lib/calc'
import {
  buildColumns,
  buildRowDefs,
  cellFor,
  higherIsBetter,
  type PlCell,
  type PlColumn,
  type PlRowDef,
  type PlViewMode,
  type ResolvedAfp,
} from '../../lib/plStatement'
import type { PlAccount, PlQuarterly } from '../../lib/types'

const MODES: { id: PlViewMode; short: string; long: string }[] = [
  { id: 'cumulative', short: 'Cumulato', long: 'Cumulato da inizio anno' },
  { id: 'quarter', short: 'Per trimestre', long: 'Per trimestre' },
  { id: 'forecast', short: 'Previsione', long: 'Previsione a fine anno' },
]

type GroupId = 'variable' | 'fixed'

type DisplayItem = { type: 'group'; id: GroupId; label: string } | { type: 'row'; def: PlRowDef }

const deltaFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })

function DeltaChip({ cell, kind }: { cell: PlCell; kind: PlRowDef['kind'] }) {
  if (cell.delta == null) return null
  const rounded = Math.round(cell.delta * 1000) / 10
  const flat = rounded === 0
  const good = higherIsBetter(kind) ? cell.delta > 0 : cell.delta < 0
  const text = `${deltaFmt.format(cell.delta * 100)}%`
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-badge px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
        flat ? 'bg-stone-100 text-stone-600' : good ? 'bg-success-100 text-success-600' : 'bg-danger-100 text-danger-600',
      )}
    >
      {text}
    </span>
  )
}

function ValueCell({ def, col, afp }: { def: PlRowDef; col: PlColumn; afp: PlColumn | null }) {
  const emphasized = def.kind === 'mdc' || def.kind === 'mol'
  const isTotal = def.kind === 'variable_total' || def.kind === 'fixed_total'
  const isDetail = def.kind === 'variable' || def.kind === 'fixed'
  if (!col.available) {
    return <span className="text-stone-300">—</span>
  }
  const cell = cellFor(def, col, afp)
  if (cell.value == null) return <span className="text-stone-300">—</span>
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={clsx(
          'tabular-nums',
          emphasized || isTotal || def.kind === 'revenue' ? 'font-bold text-navy-900' : 'text-stone-900',
          isDetail ? 'text-[13px]' : 'text-sm',
        )}
      >
        {formatEur(cell.value)}
      </span>
      {(cell.pct != null || cell.delta != null) && (
        <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-[11px] text-stone-500">
          {def.kind !== 'revenue' && cell.pct != null && <span className="tabular-nums">{formatPct(cell.pct)}</span>}
          <DeltaChip cell={cell} kind={def.kind} />
        </span>
      )}
    </div>
  )
}

export function PlStatementTable({
  accounts,
  pl,
  afp,
  year,
}: {
  accounts: PlAccount[]
  pl: PlQuarterly[]
  afp: ResolvedAfp
  year: number
}) {
  const [mode, setMode] = useState<PlViewMode>('cumulative')
  const [collapsed, setCollapsed] = useState<Record<GroupId, boolean>>({ variable: false, fixed: false })

  const columns = useMemo(() => buildColumns(mode, pl, accounts, year), [mode, pl, accounts, year])
  const allColumns = afp.column ? [afp.column, ...columns] : columns
  const rows = useMemo(() => buildRowDefs(accounts), [accounts])
  const hasAnyData = columns.some((c) => c.available)

  const items = useMemo(() => {
    const out: DisplayItem[] = []
    let variableOpen = false
    let fixedOpen = false
    for (const def of rows) {
      if (def.kind === 'variable' && !variableOpen) {
        out.push({ type: 'group', id: 'variable', label: 'Costi variabili' })
        variableOpen = true
      }
      if (def.kind === 'fixed' && !fixedOpen) {
        out.push({ type: 'group', id: 'fixed', label: 'Costi fissi' })
        fixedOpen = true
      }
      out.push({ type: 'row', def })
    }
    return out
  }, [rows])

  const visible = items.filter((item) => {
    if (item.type === 'group') return true
    if (item.def.kind === 'variable') return !collapsed.variable
    if (item.def.kind === 'fixed') return !collapsed.fixed
    return true
  })

  const toggle = (id: GroupId) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  return (
    <div>
      <div role="tablist" className="mb-4 inline-flex rounded-card border border-stone-300 bg-stone-100 p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={clsx(
              'rounded-[6px] px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
              mode === m.id ? 'bg-white text-navy-700 shadow-card-sm' : 'text-stone-600 hover:text-navy-900',
            )}
          >
            <span className="sm:hidden">{m.short}</span>
            <span className="hidden sm:inline">{m.long}</span>
          </button>
        ))}
      </div>

      {!hasAnyData && (
        <p className="mb-3 rounded-card bg-stone-100 px-3 py-2 text-xs text-stone-600">
          Nessun dato trimestrale per il {year}: inserisci almeno un trimestre per vedere il conto economico.
        </p>
      )}

      <div className="overflow-x-auto rounded-card border border-stone-300">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[112px] max-w-[124px] border-b border-stone-300 bg-white px-2.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 sm:min-w-[260px] sm:max-w-none sm:px-3">
                Voce
              </th>
              {allColumns.map((col) => (
                <th
                  key={col.id}
                  className={clsx(
                    'min-w-[104px] border-b border-stone-300 px-2.5 py-2.5 text-right align-bottom sm:min-w-[130px] sm:px-3',
                    col.kind === 'afp' ? 'border-r bg-stone-100' : 'bg-white',
                  )}
                >
                  <div className={clsx('text-sm font-bold', col.available ? 'text-navy-900' : 'text-stone-400')}>{col.title}</div>
                  <div className="text-[11px] font-medium text-stone-500">{col.available ? col.subtitle : 'Da inserire'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              if (item.type === 'group') {
                const isCollapsed = collapsed[item.id]
                return (
                  <tr key={`g-${item.id}`}>
                    <td colSpan={allColumns.length + 1} className="sticky left-0 border-b border-stone-100 bg-stone-100/70 px-3 py-1.5">
                      <button
                        onClick={() => toggle(item.id)}
                        aria-expanded={!isCollapsed}
                        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600 hover:text-navy-900"
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                        {item.label}
                        <span className="font-medium normal-case tracking-normal text-stone-500">
                          {isCollapsed ? '— mostra il dettaglio' : '— nascondi il dettaglio'}
                        </span>
                      </button>
                    </td>
                  </tr>
                )
              }
              const { def } = item
              const emphasized = def.kind === 'mdc' || def.kind === 'mol'
              const isTotal = def.kind === 'variable_total' || def.kind === 'fixed_total'
              const isDetail = def.kind === 'variable' || def.kind === 'fixed'
              const rowBg = emphasized ? 'bg-navy-50' : 'bg-white'
              return (
                <tr key={def.key}>
                  <th
                    scope="row"
                    className={clsx(
                      'sticky left-0 z-10 max-w-[124px] border-b border-stone-100 px-2.5 py-2 text-left align-top text-xs sm:max-w-none sm:px-3 sm:text-sm',
                      rowBg,
                      isDetail ? 'pl-4 font-normal text-stone-600 sm:pl-6' : 'font-bold text-navy-900',
                      def.kind === 'mol' && 'border-b-0',
                    )}
                  >
                    {def.label}
                  </th>
                  {allColumns.map((col) => (
                    <td
                      key={col.id}
                      className={clsx(
                        'border-b border-stone-100 px-2.5 py-2 text-right align-top sm:px-3',
                        col.kind === 'afp' ? 'border-r bg-stone-100/60' : rowBg,
                        isTotal && 'border-t border-stone-300',
                        def.kind === 'mol' && 'border-b-0',
                      )}
                    >
                      <ValueCell def={def} col={col} afp={afp.column} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-xs text-stone-500">
        <p>
          Sotto ogni importo: incidenza sui ricavi del periodo e scostamento rispetto all'AFP. Per i ricavi (periodi di 12 mesi) lo scostamento è la
          variazione %; per le altre voci è la differenza di incidenza in punti percentuali (es. +1,2% = 1,2 punti in più). Verde = meglio dell'AFP, rosso = peggio.
        </p>
        {mode === 'forecast' && (
          <p>
            Previsione = proiezione lineare del cumulato (dal 1° trimestre ×4, dal 2° ×2, dal 3° ×4/3), come nel file Excel: non tiene conto della
            stagionalità.
          </p>
        )}
        {afp.source === 'totals' && (
          <p className="text-warning-700">
            L'AFP è disponibile solo per Ricavi e MOL: inserisci il dettaglio per voce nella sezione "Valore AFP" per vedere gli scostamenti di ogni riga.
          </p>
        )}
        {afp.source === 'none' && (
          <p className="text-warning-700">Nessun AFP disponibile per il {year - 1}: inseriscilo nella sezione "Valore AFP" per vedere gli scostamenti.</p>
        )}
        {afp.source === 'baseline' && <p>AFP {year - 1} inserito a mano (nessun dato trimestrale reale per quell'anno).</p>}
      </div>
    </div>
  )
}
