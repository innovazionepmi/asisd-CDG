import type { VercelRequest, VercelResponse } from '@vercel/node'
import { HttpError, handleError, requireAdmin } from './_shared.js'

// GET  /api/admin/studios       -> elenco studi
// POST /api/admin/studios       -> crea uno studio + invita il titolare
//
// Richiede header Authorization: Bearer <access_token dell'admin loggato>.
// Tutte le scritture passano dalla service_role key (bypassa RLS): l'unico
// controllo di autorizzazione è requireAdmin(), esplicito in codice.

interface CreateStudioBody {
  name: string
  vatNumber?: string
  numChairs: number
  year: number
  theoreticalOpeningMinutes?: number
  cfmpTarget?: number
  ownerEmail: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { admin } = await requireAdmin(req)

    if (req.method === 'GET') {
      const { data: studios, error } = await admin
        .from('studios')
        .select('id, name, vat_number, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new HttpError(500, error.message)

      const { data: members, error: membersError } = await admin
        .from('studio_members')
        .select('studio_id, role, user_id')
        .eq('role', 'owner')
      if (membersError) throw new HttpError(500, membersError.message)

      const ownerIds = [...new Set((members ?? []).map((m) => m.user_id))]
      const emailByUserId = new Map<string, string>()
      for (const id of ownerIds) {
        const { data } = await admin.auth.admin.getUserById(id)
        if (data.user?.email) emailByUserId.set(id, data.user.email)
      }

      const result = (studios ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        vatNumber: s.vat_number,
        createdAt: s.created_at,
        ownerEmail: (members ?? []).find((m) => m.studio_id === s.id)?.user_id
          ? emailByUserId.get((members ?? []).find((m) => m.studio_id === s.id)!.user_id)
          : null,
      }))

      res.status(200).json({ studios: result })
      return
    }

    if (req.method === 'POST') {
      const body = req.body as CreateStudioBody
      if (!body?.name || !body?.ownerEmail || !body?.numChairs || !body?.year) {
        throw new HttpError(400, 'Campi obbligatori mancanti: name, numChairs, year, ownerEmail.')
      }

      const { data: studio, error: studioError } = await admin
        .from('studios')
        .insert({ name: body.name, vat_number: body.vatNumber ?? null })
        .select('id, name, vat_number, created_at')
        .single()
      if (studioError) throw new HttpError(500, studioError.message)

      const { error: configError } = await admin.from('studio_configs').insert({
        studio_id: studio.id,
        year: body.year,
        num_chairs: body.numChairs,
        theoretical_opening_minutes: body.theoreticalOpeningMinutes ?? null,
        cfmp_target: body.cfmpTarget ?? null,
      })
      if (configError) throw new HttpError(500, configError.message)

      // Invita il titolare via email (Supabase Auth). Se l'utente esiste
      // già (email riusata su un altro studio), l'invito fallisce con
      // "already been registered": in quel caso recuperiamo l'utente
      // esistente e lo aggiungiamo comunque come owner del nuovo studio.
      // redirectTo punta a /reset-password: stessa pagina usata per il
      // "password dimenticata", riusata qui per impostare la prima password.
      const origin = `https://${req.headers['x-forwarded-host'] ?? req.headers.host}`
      const invite = await admin.auth.admin.inviteUserByEmail(body.ownerEmail, { redirectTo: `${origin}/reset-password` })
      let ownerId = invite.data.user?.id ?? null
      let inviteSent = !invite.error

      if (invite.error) {
        const { data: list } = await admin.auth.admin.listUsers()
        const existing = list?.users.find((u) => u.email?.toLowerCase() === body.ownerEmail.toLowerCase())
        if (!existing) throw new HttpError(500, `Invito fallito e nessun utente esistente trovato: ${invite.error.message}`)
        ownerId = existing.id
        inviteSent = false
      }

      if (!ownerId) throw new HttpError(500, 'Impossibile determinare l\'utente titolare.')

      const { error: memberError } = await admin.from('studio_members').insert({
        studio_id: studio.id,
        user_id: ownerId,
        role: 'owner',
      })
      if (memberError) throw new HttpError(500, memberError.message)

      res.status(201).json({
        studio: { id: studio.id, name: studio.name, vatNumber: studio.vat_number, createdAt: studio.created_at },
        ownerEmail: body.ownerEmail,
        inviteSent,
      })
      return
    }

    res.status(405).json({ error: 'Metodo non consentito.' })
  } catch (err) {
    handleError(res, err)
  }
}
