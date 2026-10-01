/** Come NumberField, ma l'utente digita un numero intero (72) che
 * corrisponde a una frazione salvata (0.72) — coerente con come lo schema
 * memorizza le percentuali (0-1, vedi docs/data-model.md). */
export function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const displayValue = Number.isFinite(value) ? Math.round(value * 1000) / 10 : 0
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <input
          type="number"
          step={0.1}
          value={displayValue}
          onChange={(e) => onChange((e.target.valueAsNumber || 0) / 100)}
          className="w-full bg-transparent px-2.5 py-1.5 text-sm text-slate-900 outline-none"
        />
        <span className="pr-2.5 text-sm text-slate-400">%</span>
      </div>
    </label>
  )
}
