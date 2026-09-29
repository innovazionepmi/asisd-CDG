import type { DataProvider } from './dataProvider'
import { isSupabaseConfigured } from './supabaseClient'
import { localFixtureProvider } from './localFixtureProvider'
import { supabaseProvider } from './supabaseProvider'

// Se VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY sono impostati -> dati reali.
// Altrimenti -> provider di demo con seed realistico su localStorage.
// Le pagine non sanno mai quale dei due e' in uso.
export const dataProvider: DataProvider = isSupabaseConfigured ? supabaseProvider : localFixtureProvider
