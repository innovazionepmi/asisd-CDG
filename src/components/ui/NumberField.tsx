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
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        {prefix && <span className="pl-2.5 text-sm text-slate-400">{prefix}</span>}
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.valueAsNumber || 0)}
          className="w-full bg-transparent px-2.5 py-1.5 text-sm text-slate-900 outline-none"
        />
      </div>
    </label>
  )
}
