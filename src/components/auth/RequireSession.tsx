import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'

/**
 * Richiede solo che ci sia una sessione loggata (redirect a /login altrimenti).
 * L'autorizzazione vera e propria (è un platform admin?) è verificata
 * server-side dalle funzioni api/admin/* — questo componente non decide
 * nulla in materia di sicurezza, evita solo di mostrare la UI admin a chi
 * non è nemmeno loggato.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-6 text-sm text-slate-400">Verifica sessione…</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}
