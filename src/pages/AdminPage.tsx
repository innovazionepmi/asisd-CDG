import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { NumberField } from '../components/ui/NumberField'
import { SectionCard } from '../components/ui/SectionCard'
import { AdminApiError, createAdminStudio, listAdminStudios, type AdminStudio } from '../lib/adminApi'
import { useAuth } from '../lib/auth/AuthContext'

const CURRENT_YEAR = new Date().getFullYear()

const EMPTY_FORM = {
  name: '',
  vatNumber: '',
  numChairs: 1,
  year: CURRENT_YEAR,
  theoreticalOpeningMinutes: 0,
  cfmpTarget: 1,
  ownerEmail: '',
}

export function AdminPage() {
  const { signOut } = useAuth()
  const [studios, setStudios] = useState<AdminStudio[]>([])
  const [accessDenied, setAccessDenied] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    setLoadError(null)
    try {
      setStudios(await listAdminStudios())
      setAccessDenied(false)
    } catch (err) {
      if (err instanceof AdminApiError && /non abilitato/i.test(err.message)) {
        setAccessDenied(true)
      } else {
        setLoadError(err instanceof Error ? err.message : 'Errore imprevisto.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    setSuccessMessage(null)
    try {
      const { inviteSent } = await createAdminStudio(form)
      setSuccessMessage(
        inviteSent
          ? `Studio creato. Invito inviato a ${form.ownerEmail}.`
          : `Studio creato. ${form.ownerEmail} era già registrato: aggiunto come titolare senza nuovo invito.`,
      )
      setForm(EMPTY_FORM)
      await reload()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Errore imprevisto.')
    } finally {
      setSubmitting(false)
    }
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="max-w-sm rounded-xl border border-stone-300 bg-white p-6 text-center shadow-card-sm">
          <img src="/logo-asisd-transparent.png" alt="ASISD" className="mx-auto h-9 w-auto" />
          <p className="mt-3 text-sm font-semibold text-navy-900">Accesso negato</p>
          <p className="mt-2 text-sm text-stone-500">
            Il tuo account non è abilitato alla dashboard amministrativa. Contatta chi gestisce la piattaforma per essere
            aggiunto a <code className="rounded bg-stone-100 px-1">platform_admins</code>.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link to="/" className="text-sm text-navy-700 hover:underline">
              Vai all'app
            </Link>
            <button onClick={signOut} className="text-sm text-navy-700 hover:underline">
              Esci
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 md:px-8 md:py-6">
      <PageHeader
        title="Amministrazione ASISD"
        subtitle="Istanzia nuovi studi clienti e crea le credenziali per il titolare"
        actions={
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-stone-500 hover:text-navy-900">
              ← Torna all'app
            </Link>
            <button onClick={signOut} className="text-sm text-stone-500 hover:text-navy-900">
              Esci
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        <SectionCard title="Nuovo studio" subtitle="Il titolare riceverà un'email di invito per impostare la password">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-stone-600">Nome studio</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-card border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600">P.IVA (opzionale)</span>
              <input
                value={form.vatNumber}
                onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                className="w-full rounded-card border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs font-medium text-stone-600">Email titolare</span>
              <input
                type="email"
                required
                value={form.ownerEmail}
                onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                className="w-full rounded-card border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <NumberField label="Nr. poltrone" value={form.numChairs} onChange={(v) => setForm((f) => ({ ...f, numChairs: v }))} />
            <NumberField label="Anno di configurazione" value={form.year} onChange={(v) => setForm((f) => ({ ...f, year: v }))} />
            <NumberField
              label="Minuti apertura teorici (anno)"
              value={form.theoreticalOpeningMinutes}
              onChange={(v) => setForm((f) => ({ ...f, theoreticalOpeningMinutes: v }))}
            />
            <NumberField label="Target CFMP/saturazione" value={form.cfmpTarget} onChange={(v) => setForm((f) => ({ ...f, cfmpTarget: v }))} step={0.1} />

            <div className="sm:col-span-2 lg:col-span-3">
              {submitError && <p className="mb-2 text-sm text-danger-600">{submitError}</p>}
              {successMessage && <p className="mb-2 text-sm text-success-600">{successMessage}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover disabled:opacity-60"
              >
                {submitting ? 'Creazione…' : 'Crea studio e invita titolare'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Studi attivi" subtitle={`${studios.length} studi nel sistema`}>
          {loading ? (
            <p className="text-sm text-stone-500">Caricamento…</p>
          ) : loadError ? (
            <p className="text-sm text-danger-600">{loadError}</p>
          ) : studios.length === 0 ? (
            <p className="text-sm text-stone-500">Nessuno studio ancora creato.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-4">Studio</th>
                    <th className="py-2 pr-4">P.IVA</th>
                    <th className="py-2 pr-4">Titolare</th>
                    <th className="py-2">Creato il</th>
                  </tr>
                </thead>
                <tbody>
                  {studios.map((s) => (
                    <tr key={s.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-1.5 pr-4 font-medium text-navy-900">{s.name}</td>
                      <td className="py-1.5 pr-4 text-stone-600">{s.vatNumber ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-stone-600">{s.ownerEmail ?? '—'}</td>
                      <td className="py-1.5 text-stone-600">{new Date(s.createdAt).toLocaleDateString('it-IT')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
