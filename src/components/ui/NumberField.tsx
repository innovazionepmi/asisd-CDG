export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  prefix?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-stone-600">{label}</span>
      <div className="flex items-center overflow-hidden rounded-card border border-stone-300 focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500">
        {prefix && <span className="pl-2.5 text-sm text-stone-500">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
          className="w-full bg-transparent px-2.5 py-1.5 text-sm text-navy-900 outline-none"
        />
      </div>
    </label>
  )
}
