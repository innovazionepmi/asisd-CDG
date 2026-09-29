import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Creato solo se le variabili sono presenti: in dev/demo senza Supabase
// configurato l'app usa localFixtureProvider e questo client non viene mai
// istanziato (vedi provider.ts).
export const supabase = isSupabaseConfigured ? createClient(url as string, anonKey as string) : null
