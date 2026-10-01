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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">ASISD · Controllo di Gestione</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Imposta una nuova password</h1>

        {!isSupabaseConfigured ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Supabase non è configurato in questo ambiente (modalità demo): questa pagina non è disponibile.
          </p>
        ) : done ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password aggiornata con successo.</p>
            <button
              onClick={() => navigate('/')}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Vai all'app
            </button>
          </div>
        ) : authLoading ? (
          <p className="mt-4 text-sm text-slate-400">Verifica del link in corso…</p>
        ) : !session ? (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Link non valido o scaduto. Richiedi un nuovo link di reset dalla pagina di accesso.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Nuova password</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Conferma password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Salvataggio…' : 'Salva nuova password'}
            </button>
          </form>
        )}

        {!done && session && (
          <button onClick={signOut} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-blue-600 hover:underline">
            Esci
          </button>
        )}
      </div>
    </div>
  )
}
