import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

// Bottone condiviso, stile dal design system ASISD (Button.jsx fornito):
// primary = navy pieno, secondary = outline navy, ghost = testo navy senza
// bordo. Raggio e transizioni coerenti col resto dell'app.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-navy-700 text-white border-transparent hover:bg-navy-800-hover',
  secondary: 'bg-white text-navy-700 border-navy-700 hover:bg-navy-50',
  ghost: 'bg-transparent text-navy-700 border-transparent hover:bg-navy-50',
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        'rounded-btn border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
