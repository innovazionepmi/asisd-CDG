import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'
import { useStudio } from '../../lib/studio/StudioContext'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

/**
 * Guardia per le pagine "normali" (Dashboard/Traffico/...). In modalita demo
 * (Supabase non configurato) non richiede nulla: l'app usa il provider
 * fixture come sempre. Con Supabase reale, richiede login + che l'utente
 * risulti membro di uno studio (studio_members) — altrimenti mostra un
 * messaggio invece di lasciare la pagina a interrogare un provider senza
 * studio_id.
 */
export function RequireStudioSession({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const studio = useStudio()
  const location = useLocation()

  if (!isSupabaseConfigured) return children

  if (authLoading) return <p className="p-6 text-sm text-stone-500">Verifica sessione…</p>
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (studio.loading) return <p className="p-6 text-sm text-stone-500">Caricamento studio…</p>

  if (!studio.studioId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="max-w-sm rounded-xl border border-stone-300 bg-white p-6 text-center shadow-card-sm">
          <p className="text-sm font-semibold text-navy-900">Nessuno studio associato</p>
          <p className="mt-2 text-sm text-stone-500">
            Il tuo account non risulta collegato a nessuno studio. Se fai parte del team ASISD, prova l'area
            amministrazione; altrimenti contatta chi gestisce la piattaforma.
          </p>
          <Link to="/admin" className="mt-4 inline-block text-sm text-navy-700 hover:underline">
            Vai all'amministrazione
          </Link>
        </div>
      </div>
    )
  }

  return children
}
