import clsx from 'clsx'
import { useEffect, useState } from 'react'

type Format = 'count' | 'currency' | 'percent'

const toText = (value: number | null, format: Format) => {
  if (value == null) return ''
  const v = format === 'percent' ? Math.round(value * 1000) / 10 : Math.round(value * 100) / 100
  return String(v)
}

/**
 * Campo numerico che salva alla perdita del fuoco / invio. Vuoto = elimina il
 * valore. Le percentuali si digitano come 61,4 e si salvano come 0,614.
 */
export function ManualField({
  value,
  format,
  placeholder,
  disabled,
  required,
  onCommit,
  label,
}: {
  value: number | null
  format: Format
  placeholder?: string
  disabled?: boolean
  /** campo obbligatorio: se svuotato torna al valore precedente invece di eliminarlo */
  required?: boolean
  onCommit: (value: number | null) => Promise<void>
  label: string
}) {
  const [text, setText] = useState(toText(value, format))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => setText(toText(value, format)), [value, format])

  async function commit() {
    const trimmed = text.trim().replace(',', '.')
    let next: number | null
    if (trimmed === '') {
      if (required) {
        setText(toText(value, format))
        return
      }
      next = null
    }
    else {
      const n = Number(trimmed)
      if (!Number.isFinite(n)) {
        setText(toText(value, format))
        return
      }
      next = format === 'percent' ? n / 100 : n
    }
    const same = (next == null && value == null) || (next != null && value != null && Math.abs(next - value) < 1e-9)
    if (same) return
    setState('saving')
    try {
      await onCommit(next)
      setState('saved')
      setTimeout(() => setState('idle'), 1200)
    } catch {
      setState('error')
    }
  }

  return (
    <div
      className={clsx(
        'flex w-full min-w-[96px] items-center overflow-hidden rounded-card border bg-white text-sm focus-within:ring-1',
        state === 'error' ? 'border-danger-600 focus-within:ring-danger-600' : state === 'saved' ? 'border-success-600' : 'border-stone-300 focus-within:border-amber-500 focus-within:ring-amber-500',
        disabled && 'bg-stone-100',
      )}
    >
      {format === 'currency' && <span className="pl-2 text-stone-500">€</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled || state === 'saving'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setText(toText(value, format))
        }}
        title={state === 'error' ? 'Salvataggio non riuscito: riprova' : undefined}
        className="w-full bg-transparent px-2 py-1.5 text-right tabular-nums text-navy-900 outline-none placeholder:text-stone-300"
      />
      {format === 'percent' && <span className="pr-2 text-stone-500">%</span>}
    </div>
  )
}
