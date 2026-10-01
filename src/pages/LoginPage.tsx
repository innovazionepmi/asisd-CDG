import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'

export function LoginPage() {
  const { session, signIn, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  if (session) return <Navigate to={from} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    navigate(from, { replace: true })
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await requestPasswordReset(email)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    setResetSent(true)
  }

  function switchMode(next: 'login' | 'forgot') {
    setMode(next)
    setError(null)
    setResetSent(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">ASISD · Controllo di Gestione</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">{mode === 'login' ? 'Accesso' : 'Recupera password'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login'
            ? "Con le credenziali del tuo studio, o del team ASISD per l'amministrazione."
            : 'Inserisci la tua email: ti mandiamo un link per impostare una nuova password.'}
        </p>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Supabase non è configurato in questo ambiente (modalità demo): il login non è disponibile.
          </p>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Accesso…' : 'Accedi'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="w-full text-center text-xs text-slate-500 hover:text-blue-600 hover:underline"
            >
              Password dimenticata?
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetRequest} className="mt-5 space-y-3">
            {resetSent ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Se l'indirizzo esiste, ti abbiamo inviato un'email con il link per reimpostare la password.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                {error && <p className="text-xs text-rose-600">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !isSupabaseConfigured}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {loading ? 'Invio…' : 'Invia link di reset'}
                </button>
              </>
            )}
            <button type="button" onClick={() => switchMode('login')} className="w-full text-center text-xs text-slate-500 hover:text-blue-600 hover:underline">
              ← Torna al login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
