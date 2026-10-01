import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'

/**
 * Raggiunta cliccando il link ricevuto via email (sia dal flusso "password
 * dimenticata" sia dall'invito iniziale del titolare — entrambi usano lo
 * stesso meccanismo di Supabase Auth). supabase-js legge automaticamente
 * il token dall'URL e stabilisce una sessione temporanea di recupero,
 * sufficiente per chiamare updatePassword().
 */
export function ResetPasswordPage() {
  const { session, loading: authLoading, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La password deve avere almeno 8 caratteri.')
      return
    }
    if (password !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }
    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    setDone(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-300 bg-white p-6 shadow-card-sm">
        <img src="/logo-asisd-transparent.png" alt="ASISD" className="h-9 w-auto" />
        <h1 className="mt-3 text-lg font-semibold text-navy-900">Imposta una nuova password</h1>

        {!isSupabaseConfigured ? (
          <p className="mt-4 rounded-card bg-amber-100 px-3 py-2 text-xs text-amber-700">
            Supabase non è configurato in questo ambiente (modalità demo): questa pagina non è disponibile.
          </p>
        ) : done ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-card bg-success-100 px-3 py-2 text-sm text-success-600">Password aggiornata con successo.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover"
            >
              Vai all'app
            </button>
          </div>
        ) : authLoading ? (
          <p className="mt-4 text-sm text-stone-500">Verifica del link in corso…</p>
        ) : !session ? (
          <p className="mt-4 rounded-card bg-danger-100 px-3 py-2 text-sm text-danger-600">
            Link non valido o scaduto. Richiedi un nuovo link di reset dalla pagina di accesso.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600">Nuova password</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-card border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-stone-600">Conferma password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-card border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </label>
            {error && <p className="text-xs text-danger-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-card bg-navy-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-800-hover disabled:opacity-60"
            >
              {loading ? 'Salvataggio…' : 'Salva nuova password'}
            </button>
          </form>
        )}

        {!done && session && (
          <button onClick={signOut} className="mt-4 w-full text-center text-xs text-stone-500 hover:text-navy-700 hover:underline">
            Esci
          </button>
        )}
      </div>
    </div>
  )
}
