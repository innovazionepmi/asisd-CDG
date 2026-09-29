import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Helper condivisi dalle funzioni serverless in api/admin/*. Girano SOLO
// lato server (Vercel Function), mai nel bundle del browser: qui è l'unico
// posto in cui è legittimo usare SUPABASE_SERVICE_ROLE_KEY.
//
// Variabili d'ambiente richieste (da impostare in Vercel Project Settings,
// MAI in un file .env con prefisso VITE_ che finirebbe nel bundle client):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

export function serviceRoleClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new HttpError(500, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurate sul server.')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Verifica che la richiesta porti il token di sessione (header
 * Authorization: Bearer <access_token>) di un utente autenticato che è
 * anche in platform_admins. Lancia HttpError altrimenti.
 */
export async function requireAdmin(req: VercelRequest) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) throw new HttpError(401, 'Non autenticato.')

  const admin = serviceRoleClient()
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) throw new HttpError(401, 'Sessione non valida.')

  const { data: adminRow, error: adminError } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (adminError) throw new HttpError(500, adminError.message)
  if (!adminRow) throw new HttpError(403, 'Utente non abilitato alla dashboard amministrativa.')

  return { user: userData.user, admin }
}

export function handleError(res: VercelResponse, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Errore interno.' })
}
