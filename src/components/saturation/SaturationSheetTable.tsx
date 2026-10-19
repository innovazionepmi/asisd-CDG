import { Fragment } from 'react'
import clsx from 'clsx'
import { formatEur, formatInt, formatPct } from '../../lib/calc'
import { MONTH_LABELS_SHORT_IT } from '../../lib/periods'
import type { SheetBlock, SheetFormat, SheetMonth } from '../../lib/saturationSheet'

const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })
const signedDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const signedInt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, signDisplay: 'exceptZero' })

function formatActual(v: number | null, format: SheetFormat): string {
  if (v == null) return '—'
  if (format === 'currency') return formatEur(v)
  if (format === 'percent') return formatPct(v)
  return formatInt(v)
}

// obiettivi e scostamenti dei conteggi possono avere decimali (es. 9,8 riattivati)
function formatTarget(v: number | null, format: SheetFormat): string {
  if (v == null) return '—'
  if (format === 'currency') return formatEur(v)
  if (format === 'percent') return formatPct(v)
  return decimal.format(v)
}

function formatDeviation(v: number | null, format: SheetFormat): string {
  if (v == null) return '—'
  if (format === 'percent') return `${signedDecimal.format(v * 100)}%`
  if (format === 'currency') return `${signedInt.format(v)} €`
  return signedDecimal.format(v)
}

function deviationTone(m: SheetMonth, judged: boolean): string {
  if (m.deviation == null) return 'text-stone-300'
  if (!judged || Math.abs(m.deviation) < 0.0005) return 'text-stone-600'
  return m.deviation > 0 ? 'text-success-600' : 'text-danger-600'
}

export function SaturationSheetTable({ blocks, year }: { blocks: SheetBlock[]; year: number }) {
  const hasData = blocks.some((b) => b.months.some((m) => m.actual != null))

  return (
    <div>
      {!hasData && (
        <p className="mb-3 rounded-card bg-stone-100 px-3 py-2 text-xs text-stone-600">Nessun dato per il {year}: inseriscili nelle pagine Traffico, Produzione e Saturazione.</p>
      )}
      <div className="overflow-x-auto rounded-card border border-stone-300">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[128px] max-w-[140px] border-b border-stone-300 bg-white px-2.5 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 md:w-[250px] md:min-w-[250px] md:max-w-[250px] md:px-3">
                KPI
              </th>
              <th className="min-w-[96px] border-b border-r border-stone-300 bg-navy-50 px-2.5 py-2.5 text-right align-bottom md:sticky md:left-[250px] md:z-20 md:px-3">
                <div className="text-sm font-bold text-navy-900">Anno</div>
                <div className="text-[11px] font-medium text-stone-500">totale / media</div>
              </th>
              {MONTH_LABELS_SHORT_IT.map((label) => (
                <th key={label} className="min-w-[84px] border-b border-stone-300 bg-white px-2.5 py-2.5 text-right align-bottom text-sm font-bold text-navy-900">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map((block, bi) => {
              const rowBase = 'border-b border-stone-100 px-2.5 py-1.5 text-right align-middle md:px-3'
              const labelBase =
                'sticky left-0 z-10 max-w-[140px] bg-white px-2.5 py-1.5 text-left align-middle md:w-[250px] md:max-w-[250px] md:px-3'
              const totalBase = 'border-r border-stone-300 bg-navy-50 md:sticky md:left-[250px] md:z-10'
              const topBorder = bi > 0 ? 'border-t border-stone-300' : ''
              return (
                <Fragment key={block.key}>
                  <tr key={`${block.key}-v`}>
                    <th scope="row" className={clsx(labelBase, 'border-b border-stone-100 text-xs font-bold text-navy-900 md:text-sm', topBorder)}>
                      {block.label}
                    </th>
                    <td className={clsx(rowBase, totalBase, 'text-sm font-bold tabular-nums text-navy-900', topBorder)}>
                      {formatActual(block.total.actual, block.format)}
                    </td>
                    {block.months.map((m, i) => (
                      <td key={i} className={clsx(rowBase, 'text-sm tabular-nums', m.actual == null ? 'text-stone-300' : 'font-semibold text-navy-900', topBorder)}>
                        {formatActual(m.actual, block.format)}
                      </td>
                    ))}
                  </tr>
                  <tr key={`${block.key}-t`}>
                    <th scope="row" className={clsx(labelBase, 'border-b border-stone-100 pl-5 text-[11px] font-medium text-stone-500 md:pl-6 md:text-xs')}>
                      → Obiettivo
                    </th>
                    <td className={clsx(rowBase, totalBase, 'text-xs tabular-nums text-stone-600')}>{formatTarget(block.total.target, block.format)}</td>
                    {block.months.map((m, i) => (
                      <td key={i} className={clsx(rowBase, 'text-xs tabular-nums', m.target == null ? 'text-stone-300' : 'text-stone-500')}>
                        {formatTarget(m.target, block.format)}
                      </td>
                    ))}
                  </tr>
                  <tr key={`${block.key}-d`}>
                    <th scope="row" className={clsx(labelBase, 'border-b border-stone-100 pl-5 text-[11px] font-medium text-stone-500 md:pl-6 md:text-xs')}>
                      → Scostamento su obiettivo
                    </th>
                    <td className={clsx(rowBase, totalBase, 'text-xs font-semibold tabular-nums', deviationTone(block.total, block.judged))}>
                      {formatDeviation(block.total.deviation, block.format)}
                    </td>
                    {block.months.map((m, i) => (
                      <td key={i} className={clsx(rowBase, 'text-xs font-semibold tabular-nums', deviationTone(m, block.judged))}>
                        {formatDeviation(m.deviation, block.format)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-xs text-stone-500">
        <p>
          Colonna Anno: somma dei mesi per conteggi e valori, media dei mesi con dato per le percentuali; l'obiettivo è quello dell'intero anno. Lo
          scostamento è calcolato solo sui mesi con dato (un mese a zero o non inserito resta "—") e, per le percentuali, è la differenza in punti percentuali (es. +1,2% = 1,2 punti in più).
          Verde = sopra obiettivo, rosso = sotto.
        </p>
        <p>
          L'obiettivo della produzione del titolare si ricava da obiettivo produzione × obiettivo % titolare, come nel file Excel. Per le due righe del
          titolare lo scostamento resta neutro: non è detto che superare l'obiettivo sia meglio.
        </p>
        <p>I dati si inseriscono nelle pagine Traffico (visite), Produzione (produzione e igiene) e qui sotto (saturazione): questa tabella li riunisce.</p>
      </div>
    </div>
  )
}
