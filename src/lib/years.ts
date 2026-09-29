const now = new Date().getFullYear()
// Anno corrente +/- 1: copre lo storico recente e permette di iniziare a
// inserire dati per l'anno successivo in anticipo.
export const SELECTABLE_YEARS = [now - 1, now, now + 1]
export const DEFAULT_YEAR = now
