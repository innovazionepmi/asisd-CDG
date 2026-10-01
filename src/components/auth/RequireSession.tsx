import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'

/**
 * Richiede solo che ci sia una sessione loggata (redirect a /login altrimenti,
 * ricordando da dove si veniva cosi il login puo tornarci). L'autorizzazione
 * vera e propria (è un platform admin?) è verificata server-side dalle
 * funzioni api/admin/* — questo componente non decide nulla in materia di
 * sicurezza, evita solo di mostrare la UI admin a chi non è nemmeno loggato.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p className="p-6 text-sm text-stone-500">Verifica sessione…</p>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}
