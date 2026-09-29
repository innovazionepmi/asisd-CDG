# Stato del progetto — ASISD Controllo di Gestione

Ultimo aggiornamento: 2026-09-15

## Contesto

Iniziativa di partnership tra Emilio (innovazione/AI/automazione) e Andrea
Grassi (fondatore ASISD, accademia per lo sviluppo imprenditoriale dello
studio dentistico). Obiettivo: sostituire gli strumenti Excel del metodo
proprietario **PMOS** (Profit Monday Operating System) dati in dotazione ai
clienti ASISD con applicazioni web più fruibili. Primo strumento: il
**Controllo di Gestione**.

Punto di partenza: analisi approfondita del file
`(ASISD) AV. CoGe - Cruscotto (Esempio Completo) - R15 Nov25.xlsx` (6 fogli:
Dashboard, Aggregato Trimestrale, Co.Ge Trimestrale, Saturazione, Customer
Experience, CashFlow) — funnel completo Traffico → Preventivi → Produzione →
Economics (MDC/MOL) → Cashflow.

## Decisioni di prodotto confermate

- **Multi-tenant**: un solo DB Supabase condiviso con Row Level Security,
  non un'istanza per studio (scelta esplicita, per aggiornare tutti i
  clienti ASISD da un'unica codebase).
- **v1 a livello studio**: nessun dettaglio per singolo operatore
  (titolare vs collaboratori resta aggregato, come nell'Excel). Estendibile
  in futuro senza rompere lo schema.
- **Grana dati per area**: mensile per traffico/preventivi/produzione/
  cashflow; **trimestrale per il conto economico** (`pl_quarterly`) —
  perché i dati contabili arrivano dal commercialista a trimestre, non è
  operativamente fattibile un valore mensile corretto.
- **AFP (Anno Fiscale Precedente)**: non è più un blocco di celle parallelo
  da ricopiare a mano. Le viste di confronto anno-su-anno leggono prima i
  dati reali dell'anno N-1 nelle stesse tabelle; se assenti, ripiegano su
  un valore inserito esplicitamente in `kpi_prior_year_baseline` (stessa
  funzione della colonna "Totale AFP" dell'Excel, ma con un vero punto di
  inserimento in UI — vedi pagina Economics, sezione "Valore AFP").
- **Ruolo admin globale `platform_admins`** (non `asisd_coach` riusato):
  tabella dedicata, non scoped a uno studio, accessibile solo alla
  `service_role` (nessuna policy RLS client-side) — l'autorizzazione è
  verificata sempre lato server nelle funzioni `api/admin/*`.
- **Credenziali titolare via invito email** (Supabase Auth
  `inviteUserByEmail`), non password temporanea generata a mano.
- **Dashboard admin come route protetta nella stessa app** (`/admin`), non
  un'app separata.

Dettagli e mappatura completa Excel → tabelle: [docs/data-model.md](data-model.md).

## Cosa è stato costruito

**Data model** (`supabase/migrations/0001_schema.sql` → `0004_seed_defaults.sql`):
tenancy (studios/studio_configs/studio_members), dimensioni flessibili
(acquisition_channels/treatment_categories/pl_accounts/metric_catalog),
fatti mensili/trimestrali, viste di rollup, RLS dimostrata (non completa su
tutte le tabelle — vedi Prossimi passi).

**Applicazione** (React + TypeScript + Vite + Tailwind + Recharts):
- `src/App.tsx` — routing: Dashboard + Traffico + Preventivi + Produzione +
  Economics + Cashflow.
- Ogni pagina area: KPI card con scostamento → grafici (donut + trend) →
  form di inserimento dati per il periodo selezionato → tabella completa
  dell'anno.
- `src/lib/dataProvider.ts` — interfaccia unica; due implementazioni
  intercambiabili: `localFixtureProvider.ts` (demo, dati reali dell'Excel
  persistiti su localStorage, **attualmente in uso**) e
  `supabaseProvider.ts` (produzione, scritta contro lo schema ma non ancora
  collegata a un progetto Supabase reale).
- Verificato end-to-end nel browser: grafici corretti, inserimento dati
  funzionante e persistente, fallback AFP dimostrato con numeri reali
  (2025 vs baseline 2024 → badge "stimato", scostamenti corretti).
- Bug trovato e risolto in sessione (14/09): i donut chart non disegnavano
  i settori per un'incompatibilità Recharts 3 + React 19 StrictMode
  (animazione) — fix: `isAnimationActive={false}` su Pie e Line.

**Dashboard amministrativa** (aggiunta 2026-09-15):
- `supabase/migrations/0005_platform_admin.sql` — tabella `platform_admins`
  (ruolo globale, RLS senza policy client-side) + trigger che popola
  `app_users` alla creazione di ogni utente Supabase Auth.
- `api/admin/_shared.ts` — helper server-side: client con `service_role`
  key, `requireAdmin()` (verifica token + appartenenza a `platform_admins`).
- `api/admin/studios.ts` — funzione serverless Vercel: `GET` elenca gli
  studi (con email del titolare), `POST` crea uno studio (+ `studio_configs`)
  e invita il titolare via email (`inviteUserByEmail`), aggiungendolo come
  `owner` in `studio_members`. Se l'email esiste già, salta l'invito e
  aggiunge comunque la membership.
- `src/lib/auth/AuthContext.tsx` + `src/pages/LoginPage.tsx` +
  `src/components/auth/RequireSession.tsx` — login email/password via
  Supabase Auth, guardia di rotta (solo richiede una sessione:
  l'autorizzazione admin vera e propria è sempre verificata server-side).
- `src/pages/AdminPage.tsx` — form "nuovo studio" + tabella studi esistenti,
  gestisce esplicitamente il caso "loggato ma non admin" (403 →
  "Accesso negato").
- Verificato nel browser: redirect a `/login` quando non autenticato,
  messaggio corretto in modalità demo (Supabase non configurato). **Non
  ancora testato con credenziali reali** — serve un progetto Supabase con
  le migration applicate (vedi sotto).

## Stato attuale / limiti noti

- **Non è ancora un repository git** — nessun commit fatto finora.
- **Migrations importate da Emilio in Supabase (15/09)**, ma **prima** che
  venisse scritta `0005_platform_admin.sql` in questa sessione: va applicata
  anche quella, altrimenti la dashboard admin non funziona (tabella
  `platform_admins` mancante).
- **App non ancora collegata al progetto Supabase reale**: gira sul
  provider demo (localStorage). Serve creare `.env.local` (mai committato,
  già in `.gitignore`) con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
  per il frontend.
- **Le funzioni `api/admin/*` non girano con `vite dev`** (sono Vercel
  Functions): per testarle serve `vercel dev` con `SUPABASE_URL` e
  `SUPABASE_SERVICE_ROLE_KEY` impostate, oppure deployare su Vercel e
  impostarle in Project Settings (mai in un file nel repo).
- **Bootstrap del primo admin**: nessuno può auto-promuoversi
  `platform_admin` dalla UI (per design). Va fatto a mano una volta sola:
  1. Creare un utente Supabase Auth per Emilio/Andrea (Dashboard Supabase →
     Authentication → Users → Add user, oppure self-signup se abilitato).
  2. Copiare il suo UUID.
  3. `insert into platform_admins (user_id) values ('<uuid>');` nell'SQL
     Editor di Supabase (il trigger di `0005` ha già popolato `app_users`
     per quell'utente).
- Nessuno studio-switcher per i titolari (fuori scope di oggi: oggi si
  parla solo di provisioning admin, non di login del titolare nella propria
  app — quello resta un passo successivo).
- ~~RLS dimostrata solo su `monthly_visits`~~ **completata 2026-09-15**
  (`0006_public_read_shared_dimensions.sql`): tutte le tabelle fact hanno
  ora le policy select/insert/update; le dimensioni condivise
  (canali/categorie/conti/metric_catalog) sono leggibili anche senza
  login quando `studio_id is null` (default ASISD).
- **Le pagine "normali" (Traffico/Preventivi/...) restano bloccate contro
  Supabase reale finché non esiste il login del titolare**: usano la anon
  key senza sessione, quindi `auth.uid()` è sempre null e le policy RLS
  (corrette!) negano lettura/scrittura per dato di studio. Non è un bug,
  è la conseguenza attesa di RLS fatta bene senza ancora il pezzo di login
  — vedi "Prossimo passo".
- Assunzione aperta da validare con Andrea: se i preventivi "generali" (non
  solo prima visita) vadano rilevati mese per mese o a trimestre come il
  conto economico (vedi `docs/data-model.md`, sezione assunzioni).

## Prossimo passo

Per **testare il flusso admin end-to-end**, la palla passa a Emilio:
1. Applicare `0005_platform_admin.sql` sul progetto Supabase.
2. Bootstrap del primo admin (vedi sopra).
3. Creare `.env.local` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
4. Deployare su Vercel (o `vercel dev` in locale) con
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` impostate nelle env vars del
   progetto, per far funzionare `api/admin/studios.ts`.

Una volta fatto questo, prossimo lavoro sul codice: login del titolare
studio nella app "normale" (non solo l'area `/admin`) — oggi un titolare
invitato riceve credenziali ma non ha ancora un modo per accedere ai dati
del proprio studio nelle pagine Traffico/Preventivi/ecc., che restano
legate al provider demo o a `VITE_DEFAULT_STUDIO_ID` fisso. Serve: sessione
utente collegata allo `studio_id` giusto via `studio_members`, e rimuovere
la dipendenza da `VITE_DEFAULT_STUDIO_ID` in `supabaseProvider.ts`.
