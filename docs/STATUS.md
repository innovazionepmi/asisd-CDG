# Stato del progetto — ASISD Controllo di Gestione

Ultimo aggiornamento: 2026-09-29

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

## Login del titolare + risoluzione studio (aggiunto 2026-09-29)

Le pagine "normali" (Dashboard/Traffico/Preventivi/Produzione/Economics/
Cashflow) ora richiedono login quando l'app è collegata a Supabase reale, e
mostrano solo i dati dello studio dell'utente loggato — non più un
`VITE_DEFAULT_STUDIO_ID` fisso uguale per chiunque apra l'URL.

- `src/lib/studio/StudioContext.tsx` — dopo il login, legge la prima riga
  di `studio_members` per l'utente corrente (`user_id = auth.uid()`, RLS
  già lo permette da `0003_rls.sql`) ed espone `studioId`/`studioName`/
  `role`. Comunica lo `studioId` a `supabaseProvider.ts` via
  `setCurrentStudioId()` (variabile di modulo, non più env var).
- `src/components/auth/RequireStudioSession.tsx` — guardia sulle pagine
  normali: **in modalità demo (Supabase non configurato) non chiede nulla**
  (comportamento invariato); con Supabase reale richiede login e uno
  studio associato, altrimenti mostra un messaggio invece di interrogare
  il DB senza `studio_id`.
- `LoginPage` ora torna alla pagina di provenienza dopo il login (non più
  sempre a `/admin`) — serve sia i titolari sia il team ASISD.
- `Sidebar` mostra il nome dello studio loggato e un pulsante "Esci".
- `VITE_DEFAULT_STUDIO_ID` non è più letta dal codice (rimossa da
  `supabaseProvider.ts` e da `.env.example`); se è ancora impostata su
  Vercel è innocua, si può togliere quando si vuole.
- Verificato: la modalità demo (nessun Supabase configurato) resta
  identica a prima — nessuna richiesta di login, dati fixture immediati
  (testato disattivando temporaneamente `.env.local`). **Non ancora
  verificato con un vero titolare loggato** contro Supabase reale (serve
  aggiungere un utente a `studio_members` — vedi sotto).
- Aggiunto anche: la Dashboard ora mostra l'errore reale invece di restare
  bloccata su "Caricamento…" a vita se una chiamata fallisce (bug trovato
  il 15/09 durante il debug del progetto Supabase in pausa — mancava un
  try/catch). Le altre 5 pagine non avevano lo stesso rischio di blocco
  infinito (nessun guard "solo se i dati esistono"), quindi non sono state
  toccate.

**Per testare**: il superadmin creato il 15/09 non è automaticamente
titolare di nessuno studio (sono due ruoli separati per design). Per
vederlo funzionare da titolare, nell'SQL Editor di Supabase:
```sql
insert into studio_members (studio_id, user_id, role)
values (
  (select id from studios order by created_at desc limit 1),
  '<uuid del tuo utente>',
  'owner'
);
```
Poi ricarica l'app da normale (non `/admin`): dovrebbe chiedere login e,
una volta autenticato, mostrare il nome dello Studio Test in sidebar.

## Stato attuale / limiti noti

- **Repo git creato e collegato**: `github.com/innovazionepmi/asisd-CDG`,
  branch `main` (produzione) e `staging` (preview), entrambi deployati su
  Vercel. Env vars impostate su Vercel (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Migrations applicate su Supabase: `0001` → `0006` (inclusa
  `0005_platform_admin.sql` e `0006_public_read_shared_dimensions.sql`,
  che completa tutte le policy RLS rimaste scoperte).
- Superadmin bootstrappato in `platform_admins`, dashboard `/admin`
  testata: crea studio + invito email (verificare che l'invito sia
  arrivato davvero, non ancora confermato in questa sessione).
- Studio di prova ("Studio Test") popolato con dati demo realistici
  (2025, stessi numeri dell'Excel originale) via script SQL diretti — vedi
  cronologia sessione per gli insert usati, non salvati come migration
  perché sono dati di prova, non schema. Una policy RLS temporanea
  (`TEMP_DEMO_anon_read_*`, da rimuovere) permette la lettura anonima solo
  di questo studio, usata per verificare i grafici prima che esistesse il
  login vero.
- Nessuno studio-switcher per chi appartiene a più studi (es. un
  `asisd_coach`): si prende sempre il primo `studio_members` trovato.
  Accettabile per v1, da rivedere se serve davvero a qualcuno.
- Assunzione aperta da validare con Andrea: se i preventivi "generali" (non
  solo prima visita) vadano rilevati mese per mese o a trimestre come il
  conto economico (vedi `docs/data-model.md`, sezione assunzioni).

## Prossimo passo

1. **Verificare il login titolare end-to-end** con Supabase reale (vedi
   riquadro sopra) — non ancora testato in questa sessione, solo la
   modalità demo è stata confermata invariata.
2. Rimuovere le policy `TEMP_DEMO_anon_read_*` (script di pulizia già
   preparato in sessione) una volta finiti i test manuali, prima di
   invitare uno studio vero.
3. Decidere se/come estendere il flusso di creazione studio in `/admin`
   per popolare anche `studio_configs` (oggi lo fa solo per lo Studio Test
   creato a mano via SQL, non ancora per gli studi creati dalla UI admin —
   controllare `api/admin/studios.ts`, che in realtà lo fa già: verificare
   con un vero secondo studio creato dalla UI).
4. Valutare code-splitting: il bundle JS è cresciuto a ~930KB minificato
   (avviso di build, non bloccante) — non urgente per un tool interno, ma
   da tenere d'occhio.
