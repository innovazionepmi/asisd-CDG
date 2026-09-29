import { supabase } from './supabaseClient'

export interface AdminStudio {
  id: string
  name: string
  vatNumber: string | null
  createdAt: string
  ownerEmail: string | null
}

export interface CreateStudioInput {
  name: string
  vatNumber?: string
  numChairs: number
  year: number
  theoreticalOpeningMinutes?: number
  cfmpTarget?: number
  ownerEmail: string
}

export class AdminApiError extends Error {}

async function authHeader(): Promise<Record<string, string>> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  if (!token) throw new AdminApiError('Sessione non valida: effettua di nuovo il login.')
  return { Authorization: `Bearer ${token}` }
}

export async function listAdminStudios(): Promise<AdminStudio[]> {
  const res = await fetch('/api/admin/studios', { headers: await authHeader() })
  const body = await res.json()
  if (!res.ok) throw new AdminApiError(body.error ?? 'Errore nel caricamento degli studi.')
  return body.studios
}

export async function createAdminStudio(input: CreateStudioInput): Promise<{ inviteSent: boolean }> {
  const res = await fetch('/api/admin/studios', {
    method: 'POST',
    headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (!res.ok) throw new AdminApiError(body.error ?? 'Errore nella creazione dello studio.')
  return { inviteSent: body.inviteSent }
}
