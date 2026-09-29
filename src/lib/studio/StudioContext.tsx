import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { setCurrentStudioId } from '../supabaseProvider'
import { supabase } from '../supabaseClient'

interface StudioState {
  studioId: string | null
  studioName: string | null
  role: string | null
  loading: boolean
  error: string | null
}

const initialState: StudioState = { studioId: null, studioName: null, role: null, loading: true, error: null }

const StudioContext = createContext<StudioState | null>(null)

/**
 * Risolve lo studio dell'utente loggato (prima riga di studio_members) e lo
 * comunica a supabaseProvider via setCurrentStudioId(), cosi le pagine
 * dell'app normale (Dashboard/Traffico/...) leggono/scrivono solo i dati
 * del proprio studio. v1: un solo studio per utente, nessuno switcher.
 */
export function StudioProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [state, setState] = useState<StudioState>(initialState)

  useEffect(() => {
    if (!supabase) {
      // Modalita demo: nessuna risoluzione studio, la pagina usa il provider fixture.
      setState({ ...initialState, loading: false })
      return
    }
    if (!session) {
      setCurrentStudioId(null)
      setState({ ...initialState, loading: false })
      return
    }

    let cancelled = false
    async function resolve() {
      const client = supabase!
      const { data, error } = await client
        .from('studio_members')
        .select('studio_id, role, studios(name)')
        .eq('user_id', session!.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (cancelled) return

      if (error) {
        setCurrentStudioId(null)
        setState({ ...initialState, loading: false, error: error.message })
        return
      }
      if (!data) {
        setCurrentStudioId(null)
        setState({ ...initialState, loading: false, error: null })
        return
      }

      const studioName = (data.studios as unknown as { name: string } | null)?.name ?? null
      setCurrentStudioId(data.studio_id)
      setState({ studioId: data.studio_id, studioName, role: data.role, loading: false, error: null })
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [session])

  return <StudioContext.Provider value={state}>{children}</StudioContext.Provider>
}

export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio deve essere usato dentro <StudioProvider>.')
  return ctx
}
