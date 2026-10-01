# Stato del progetto — ASISD Controllo di Gestione

Ultimo aggiornamento: 2026-10-01

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

**Per aggiungere un titolare a uno studio a mano** (bootstrap/test, non
serve più per il flusso normale che ora passa dalla UI admin):
```sql
insert into studio_members (studio_id, user_id, role)
select (select id from studios order by created_at desc limit 1), id, 'owner'
from auth.users where email = '<email>';
```

## Sessione 2026-09-29: deploy, test end-to-end, rifiniture UX

**Tutto verificato funzionante in produzione**, non solo in teoria:
- Repo creato, collegato a Vercel, **login titolare testato con dati reali**
  (non solo modalità demo): il titolare vede solo il proprio studio, logout
  riporta a `/login` e blocca l'accesso finché non si rifà login — esattamente
  il comportamento richiesto.
- **Flusso admin testato end-to-end con invio email reale**: Emilio ha
  collegato Brevo come SMTP custom su Supabase Auth (l'invio email di
  default di Supabase è limitato/inaffidabile per uso oltre il test) — la
  creazione di un nuovo studio dalla dashboard `/admin` invia davvero
  l'invito e il titolare può impostare la password. Confermato funzionante.
- Bug di navigazione trovati durante il test e risolti: nessun modo per
  tornare dall'area `/admin` all'app normale (aggiunto link "← Torna
  all'app"), e un utente admin-ma-non-titolare che finiva sulla schermata
  "Nessuno studio associato" restava bloccato (aggiunto link "Vai
  all'amministrazione").
- Chiarito in UI (non solo a parole) quando il valore AFP manuale non
  serve: la pagina Economics ora mostra una nota esplicita quando per
  l'anno precedente esistono già dati trimestrali reali, invece di
  lasciare il campo a 0 senza spiegazione.
- **Merge completato**: `staging` → `main`, produzione
  (`asisd-cdg.vercel.app`) ora gira sull'ultima versione con login
  obbligatorio. Prassi concordata: d'ora in poi si torna a testare prima
  su `staging` e mergiare solo dopo conferma (oggi fatto diretto su `main`
  in via eccezionale, in fase di costruzione).
- Chiarito con Emilio: i campi "Minuti apertura teorici" e "Target
  CFMP/saturazione" nel form di creazione studio **sono salvati ma non
  ancora usati da nessun calcolo** — servono per la futura pagina
  Saturazione (vedi Prossimo passo). Valori placeholder oggi non hanno
  alcun effetto.

## Sessione 2026-10-01: pagina Saturazione + obiettivi mensili ovunque

Riletto l'Excel originale prima di scrivere codice (non fidarsi della sola
memoria tra sessioni): confermato che "% Saturazione (Progressiva)" nel
foglio Saturazione è un **valore inserito a mano ogni mese**, non calcolato
da poltrone×minuti di apertura come si poteva pensare — quei campi di
`studio_configs` restano dati di contesto non ancora usati da nessun
calcolo, non è cambiato.

Costruito:
- `supabase/migrations/0007_saturation_and_targets.sql` — nuova tabella
  `saturation_monthly` (stesso pattern di `hygiene_sessions_monthly`) +
  nuove chiavi in `metric_catalog` (`production.titolare`,
  `production.titolare_share`, `production.saturation_pct`).
- **`kpi_targets` finalmente usato** (esisteva dallo schema iniziale,
  nessuna pagina lo leggeva/scriveva): `dataProvider.getKpiTargets` /
  `upsertKpiTarget` implementati in entrambi i provider.
- Nuova pagina **Saturazione** (`src/pages/SaturazionePage.tsx`): valore
  mensile + obiettivo + grafico trend + tabella completa.
- **Obiettivi mensili aggiunti anche a Traffico e Produzione** (scelta
  esplicita di Emilio: tutte le pagine insieme invece di partire da una
  sola) — card KPI, form di inserimento e tabella di entrambe le pagine
  ora mostrano Obiettivo/Scostamento, non solo il confronto vs anno
  precedente.
- Nuovo componente `PercentField` (l'utente digita "72", si salva 0.72).
- Verificato in modalità demo (dati fixture reali, stessi numeri
  dell'Excel): i tre nuovi/aggiornati moduli mostrano numeri che tornano
  esatti col foglio originale (media saturazione 2025 = 68,2% come
  B12/AVERAGE dell'Excel). **Non ancora verificato con Supabase reale** —
  serve applicare `0007` sul progetto Supabase.

## Stato attuale / limiti noti

- **Repo git**: `github.com/innovazionepmi/asisd-CDG`, branch `main`
  (produzione, live e in uso) e `staging` (test prima del merge). Env vars
  impostate su Vercel.
- Migrations applicate su Supabase: `0001` → `0006`. **`0007` scritta in
  questa sessione, non ancora applicata** — prossimo passo immediato.
- Superadmin in `platform_admins`; almeno due studi nel sistema (Studio
  Test + almeno uno creato dalla UI admin durante il test email).
- Studio Test popolato con dati demo 2025 (stessi numeri dell'Excel
  originale) via script SQL diretti — **non salvati come migration**
  (sono dati di prova, non schema). I nuovi dati di Saturazione/obiettivi
  non sono stati ancora inseriti per lo Studio Test (serve un nuovo script
  SQL se si vuole vederli popolati anche lì, non solo in demo).
- **Da fare, non urgente**: rimuovere le policy `TEMP_DEMO_anon_read_*`
  (script di pulizia già pronto, vedi cronologia sessione 15/09).
- Nessuno studio-switcher per chi appartiene a più studi (es. un
  `asisd_coach`): si prende sempre il primo `studio_members` trovato.
  Accettabile per v1.
- `studio_configs` (poltrone, minuti apertura, target CFMP) resta raccolto
  ma non consumato da nessun calcolo — confermato di nuovo in questa
  sessione che "% Saturazione" non ne dipende nell'Excel originale.
- Bundle JS ~944KB minificato (avviso di build, non bloccante).
- Assunzione aperta da validare con Andrea: se i preventivi "generali" (non
  solo prima visita) vadano rilevati mese per mese o a trimestre come il
  conto economico (vedi `docs/data-model.md`, sezione assunzioni).

## Prossimo passo

1. Applicare `0007_saturation_and_targets.sql` sul progetto Supabase, poi
   verificare la pagina Saturazione e gli obiettivi di Traffico/Produzione
   con dati reali (non solo in demo).
2. Tutti i 6 macro-blocchi dell'Excel originale sono ora rappresentati
   nell'app (Traffico, Preventivi, Produzione, Saturazione, Economics,
   Cashflow) — buon punto per fare un giro di revisione complessiva con
   Andrea prima di proseguire con nuove funzionalità.
3. Pulizie rimaste in coda (non bloccanti): rimuovere le policy
   `TEMP_DEMO_anon_read_*`; valutare uno studio-switcher reale quando
   servirà a qualcuno con più studi; risolvere l'assunzione aperta sui
   preventivi "generali".

Altre pulizie minori rimaste in coda (non bloccanti): rimuovere le policy
`TEMP_DEMO_anon_read_*`, valutare se aggiungere uno studio-switcher reale
quando servirà a qualcuno con più studi.
