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
  (produzione, live e in uso) e `staging`. Env vars impostate su Vercel.
  **Workflow temporaneamente semplificato (deciso da Emilio il
  2026-10-01)**: in questa fase di costruzione si pusha diretto su `main`,
  saltando `staging` — si torna alla prassi normale (staging prima, merge
  dopo conferma) quando l'app sarà più stabile/vicina a un uso reale.
- **Dominio custom**: `https://asisd-pmos.innovazionepmi.it/` collegato su
  Vercel (2026-10-01), probabile produzione definitiva al posto/accanto a
  `asisd-cdg.vercel.app`.
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

## Password reset + fix router/email (stesso giorno, 2026-10-01)

Aggiunta la funzione "password dimenticata" al login (`src/pages/
ResetPasswordPage.tsx`, nuovi `requestPasswordReset`/`updatePassword` in
`AuthContext`). Nel farlo, trovato un conflitto architetturale reale prima
che diventasse un bug in produzione: l'app usava `HashRouter` (URL tipo
`#/traffico`), ma Supabase usa **anche lui** il frammento `#` dell'URL per
passare il token nei link via email (sia reset password sia l'invito
titolare) — i due si sarebbero sovrascritti a vicenda.

Fix: **passata a `BrowserRouter`** (URL puliti tipo `/traffico`), aggiunto
`vercel.json` con rewrite SPA (`/(.*) → /index.html`, necessario perché
Vercel sappia servire `index.html` su un refresh di `/traffico` invece di
un 404 — gli `/api/*` non sono toccati, Vercel li risolve prima delle
rewrite). Aggiornato anche `api/admin/studios.ts`: l'invito titolare ora
usa esplicitamente `redirectTo` verso `/reset-password` (prima usava il
default di Supabase, con lo stesso rischio).

**Passo manuale obbligatorio, da fare prima del prossimo test**: su
Supabase, Authentication → URL Configuration → Redirect URLs, aggiungere
gli URL puliti — Supabase rifiuta/ignora un `redirectTo` non in whitelist,
quindi finché non è fatto sia l'invito nuovo titolare sia il reset
password falliscono silenziosamente (redirect al Site URL di default).
Il codice non ha il dominio hardcoded (usa `window.location.origin` lato
client e l'header `host` della richiesta lato server), quindi funziona su
qualunque dominio sia whitelistato — vanno solo aggiunti tutti quelli
realmente in uso:
- `https://asisd-pmos.innovazionepmi.it/reset-password` — **dominio
  custom collegato il 2026-10-01**, probabile produzione definitiva.
- `https://asisd-cdg.vercel.app/reset-password` — dominio Vercel di
  default, resta attivo in parallelo salvo redirect esplicito.
- l'equivalente sull'URL di staging.

Aggiornare anche il campo "Site URL" (sempre in URL Configuration) al
dominio custom, visto che è quello definitivo.

Verificato in demo: toggle login/recupera password, routing diretto su
path puliti (es. `/traffico` senza passare da `/`) funzionano. **Non
ancora verificato il flusso email reale** (serve il passo Supabase sopra).

## % Incassi anticipati configurabile (stesso giorno, 2026-10-01)

Emilio ha testato il flusso titolare invitando un utente reale su uno
studio di prova ("Studio Strappadenti") e ha notato che l'obiettivo del
25% sul foglio CashFlow era modificabile mese per mese nell'Excel (12
celle indipendenti, non un parametro unico) pur essendo stato lasciato
piatto in quel file. Aggiunto di conseguenza:

- `supabase/migrations/0008_advance_payments_pct.sql` — nuova colonna
  `cashflow_monthly.advance_payments_pct` + chiave
  `cashflow.advance_payments_pct` in `metric_catalog`.
- **Scelta esplicita**: valore inserito a mano ogni mese (come la
  Saturazione), non calcolato automaticamente. L'Excel lo calcolava come
  incassi anticipati / "ricavi del periodo", ma quel ricavo mensile era un
  dato tracciato solo in quel foglio e non esiste nel nostro schema (i
  ricavi ufficiali sono trimestrali) — evitato un proxy implicito (es.
  produzione mensile) su richiesta di Emilio.
- `CashflowPage`: nuovo campo per il valore mensile + obiettivo, nuovo
  grafico "% Incassi anticipati: attuale vs obiettivo" (linea attuale +
  linea obiettivo tratteggiata, stesso pattern di Saturazione), colonne
  Obiettivo/Scostamento in tabella.
- Verificato in demo: i numeri tornano esatti con l'Excel (gennaio 5,4%
  contro obiettivo 25%, scostamento -19,6%, ecc.).

## Obiettivo % chiusura su Preventivi (stesso giorno, 2026-10-01)

Emilio ha chiesto una valutazione su quanto l'app fosse pronta per una
prima demo ad Andrea Grassi. Risposta: sì, con la riserva che Preventivi
era rimasta indietro rispetto alle altre 4 aree (nessun obiettivo
mensile). Sistemato subito: `PreventiviPage` ora ha l'obiettivo mensile di
"% Chiusura" (generale, somma dei due segmenti), grafico attuale vs
obiettivo, colonne Obiettivo/Scostamento in tabella. **Nessuna nuova
migration**: la chiave `quotes.close_rate` esisteva già in `metric_catalog`
dalla migration 0004, mai usata finora. Verificato in demo con numeri
reali dell'Excel (target 69-73% a seconda del trimestre, come da foglio
Customer Experience riga 26).

Con questo, **tutte e 5 le aree con dati mensili hanno gli obiettivi**
(Traffico, Produzione, Saturazione, Cashflow, Preventivi) — solo Economics
non ne ha uno strutturato allo stesso modo (ha il confronto con AFP, un
meccanismo diverso ma concettualmente analogo).

## Design system ASISD applicato (stesso giorno, 2026-10-01)

Emilio ha fornito un design system completo (zip con token, linee guida di
brand e logo) prodotto per il sito/academy ASISD. Applicato alla parte
riutilizzabile a livello di brand (colori, tipografia, spaziature/raggi/
ombre, logo) a tutta l'app — escluso deliberatamente il resto del kit
(componenti marketing tipo Hero/PriceBox/Testimonial, non pertinenti a una
dashboard B2B).

- `src/index.css`: token Tailwind v4 (`@theme`) con palette navy/amber/
  stone + colori di stato (success/warning/danger/info), font Archivo
  (titoli) + Source Serif 4 (enfasi), radii/ombre dedicati
  (`rounded-card`, `rounded-badge`, `shadow-card-sm/md/lg`).
- `src/lib/colors.ts`: palette grafici (10 colori) e mappatura semantica
  (positive/negative/target/...) ricostruite sui soli colori di brand, per
  restare a tema anche con 9 categorie nei donut chart.
- Logo (`public/logo-asisd-transparent.png`/`-white.png`) applicato in
  Sidebar e nelle pagine standalone (Login, Reset password, Admin
  "Accesso negato") al posto della sola scritta testuale.
- Tutte le pagine e i componenti condivisi (KpiCard, SectionCard,
  PageHeader, Number/PercentField, PeriodSelect, DonutChart,
  TrendLineChart, guardie di autenticazione) migrati dai colori Tailwind
  generici (slate/blue/emerald/rose) ai token di brand — inclusi gli assi/
  griglie dei grafici Recharts (prima colori hex hardcoded slate).
- Creato `src/components/ui/Button.tsx` come componente di riferimento per
  il futuro (varianti primary/secondary/ghost) — non ancora adottato nelle
  pagine esistenti, che per ora restano con bottoni inline ricolorati
  (scelta a basso rischio: sono già altamente consistenti tra loro).
- Verificato: build di produzione pulita (`npm run build`, nessun errore
  TS, solo il consueto avviso bundle >500KB), e verifica visiva nel
  browser in modalità demo su Dashboard, Traffico, Preventivi,
  Saturazione, Cashflow, Login, Admin — tutto coerente con la nuova
  identità di brand, nessuna regressione funzionale.

## Economics ribaltata sul modello "Co.Ge Trimestrale" (2026-10-19, branch staging)

Dopo la call con Andrea Grassi: la pagina Economics replica ora la logica
del tab "Co.Ge Trimestrale" del file Excel (rilettura completa del foglio,
formule incluse, prima di scrivere codice).

- **Tabella ribaltata**: periodi nelle colonne, voci nelle righe, con tutte
  le sotto-voci (6 costi variabili + 5 fissi) tra Ricavi, Costi variabili
  totale, MDC, Costi fissi totale, MOL. Tre viste in un solo componente con
  tab: *Cumulato da inizio anno* (al 31/03, 30/06, 30/09, 31/12), *Per
  trimestre*, *Previsione a fine anno*; colonna AFP sempre a sinistra.
  `src/lib/plStatement.ts` (calcolo puro) + `src/components/economics/
  PlStatementTable.tsx` (UI). Verificato contro i numeri dell'Excel in tutte
  e tre le viste (es. MOL cumulato anno 507.423 · +8,00 pp; previsione dal
  1° trim. 2.014.680 · +44,8%).
- **Formule replicate dall'Excel**: in ogni cella importo + % di incidenza
  sul ricavo del periodo + scostamento vs AFP. Scostamento = differenza di
  incidenza in punti percentuali (pp) per tutte le voci; solo per i Ricavi,
  e solo sui periodi di 12 mesi (cumulato a fine anno, previsioni), è la
  variazione % in euro. Previsione = proiezione lineare del cumulato (dal
  1° trim. x4, dal 2° x2, dal 3° x4/3): non tiene conto della stagionalità,
  come nel file originale.
- **Meno Excel**: una cella per periodo invece di tre colonne (importo con
  sotto % e chip di scostamento), colori col verso giusto (costi sotto l'AFP
  = verde, ricavi/MDC/MOL sopra = verde), gruppi costi comprimibili (default
  espansi, tutti i dati presenti), colonna voci fissa nello scroll
  orizzontale, colonne ridotte su mobile. I trimestri senza dati mostrano
  "Da inserire".
- **AFP per voce (nuova migration `0009_pl_prior_year_baseline.sql`, da
  applicare su Supabase)**: nell'Excel la colonna AFP ha un valore per ogni
  voce, ma `kpi_prior_year_baseline` teneva solo Ricavi e MOL. Nuova tabella
  `pl_prior_year_baseline` (studio, anno, voce, valore). Ordine di
  risoluzione AFP: dati trimestrali reali dell'anno precedente -> valori per
  voce inseriti a mano -> (riserva storica) soli totali Ricavi/MOL, nel
  qual caso la tabella avvisa che gli scostamenti per riga richiedono il
  dettaglio. Il form "Valore AFP" ora è per voce e a ogni salvataggio
  riscrive anche i due totali in `kpi_prior_year_baseline` (la Dashboard e
  le viste SQL continuano a leggere quelli).
- **Inserimento trimestrale = CUMULATO da inizio anno** (precisato da
  Emilio dopo il test su staging, come nell'Excel e come arrivano i dati
  dal commercialista). Sezione rinominata "Trimestrale inserimento dati";
  nel selettore "Al 30/06 (cumulato)", con hint del cumulato precedente
  sotto ogni voce, avviso se un cumulato risulta inferiore al precedente
  (trimestre negativo) e anteprima del solo trimestre. **A database resta
  il delta del singolo trimestre** (nessuna migrazione dei dati esistenti):
  il form converte in `planCumulativeSave` (`plStatement.ts`) e, se il
  trimestre successivo ha già dati, ne riallinea il delta così che il suo
  cumulato non cambi quando si corregge un trimestre precedente. Prima di
  questa modifica il form salvava il singolo trimestre, non il cumulato.
- La vecchia tabella "Dati completi" (solo macro-voci per trimestre) è
  stata sostituita; ordine pagina: KPI, Conto economico, grafici,
  inserimento trimestre, Valore AFP.
- Script SQL per popolare l'AFP 2024 per voce sullo studio di test
  (`2abe09f6-...`) consegnato a parte, non committato (stessa prassi dei
  seed demo).

## Saturazione ribaltata sul tab "Saturazione" dell'Excel (2026-10-19, branch staging)

Stesso metodo di Economics: rilettura del foglio con le formule, poi
replica. Il tab "Lunedì della Saturazione" riunisce 7 KPI mensili che
nell'app stavano su tre pagine (Traffico, Produzione, Saturazione): ora la
pagina Saturazione mostra la tabella completa (`src/lib/saturationSheet.ts`
+ `src/components/saturation/SaturationSheetTable.tsx`), con mesi nelle
colonne + colonna "Anno" (TOTALE) e, per ogni KPI, tre righe: valore,
obiettivo, scostamento su obiettivo. KPI: prime visite nuovi pazienti,
riattivati, % saturazione, produzione eseguita, produzione titolare, %
produzione titolare, sedute di igiene. Sostituisce la vecchia "Dati
completi" della pagina; l'inserimento dati resta dov'era (visite in
Traffico, produzione/igiene in Produzione, saturazione in Saturazione) e la
tabella è di sola lettura che li riunisce.

Logica replicata dall'Excel (verificata sui totali del foglio):
- TOTALE valore = somma dei mesi (conteggi e valuta) o **media dei mesi con
  dato** (percentuali); TOTALE obiettivo = somma/media dei 12 obiettivi.
- Scostamento mensile = valore - obiettivo solo se il mese ha un dato
  (`IF(valore>0, ..., "-")`): un mese a zero o non inserito resta "—" (anche
  un 0 reale, es. riattivati di giugno nella demo, come nell'Excel).
- TOTALE scostamento = somma degli scostamenti mensili; per le percentuali
  media dei valori meno media degli obiettivi **degli stessi mesi**. Su un
  anno completo coincide con l'Excel (che per le % fa media-meno-media su
  12 mesi); su un anno in corso evita di confrontare i mesi inseriti con un
  obiettivo di anno intero (scelta nostra, unica deviazione dall'Excel).
- **Obiettivo produzione titolare derivato** = obiettivo produzione x
  obiettivo % titolare (come `C16*C23` dell'Excel); se manca uno dei due si
  usa il valore inserito a mano (`production.titolare`). Il campo manuale
  nella pagina Produzione resta, ma qui prevale la derivazione.
- % produzione titolare del TOTALE = media delle % mensili (come l'Excel),
  non rapporto dei totali: può differire di poco dalla card della pagina
  Produzione (rapporto dei totali).
- Righe del titolare: scostamento in neutro (né verde né rosso) perché non è
  ovvio se superare l'obiettivo sia meglio — **domanda aperta per Andrea**
  (l'obiettivo di quota del titolare scende nell'anno: delega crescente?).

## Dashboard analitica: tutti i parametri del foglio (tab "Aggregato Trimestrale", 2026-10-19, branch staging)

La prima versione (celle "impilate" a 7 colonne) nascondeva molti parametri del
foglio. Riscritta: la pagina `/dashboard-analitica` mostra **tutte le righe e
tutte le 22 colonne** dell'Excel, identiche in ogni sezione (si legge una colonna
dall'alto in basso): AFP (Totale, Media trim.), Anno (Totale/media, Scost. vs AFP),
Budget (Budget, Scost. vs BDGT) e, per ogni trimestre, Valore trimestrale, Scost.
vs media AFP, Scost. vs BDGT, Valore progressivo. Sezioni: Traffico, Preventivi,
Produzione, Cashflow + i tre blocchi Economics (cumulato dal 01/01 con budget, a
trimestre, previsionale) con le intestazioni del foglio. Codice:
`src/lib/analyticSheet.ts` (motore), `src/lib/analyticExcelMap.ts` (tipo di cella
per riga/colonna, generato dai colori del foglio: giallo = input, verde/blu =
calcolata, grigio = non applicabile), `src/components/analytics/AnalyticSheetTable.tsx`,
`src/pages/AnalyticDashboardPage.tsx`.

**Principio (chiarito da Emilio)**: la dashboard MOSTRA i dati, non e' un foglio
Excel da compilare; l'inserimento resta nelle pagine dedicate come prima. I colori
del foglio servono solo a capire cosa e' input e cosa e' calcolato. Le celle grigie
sono rese "non applicabili" (righe grigie); "—" = dato non disponibile.

- **Righe nuove rispetto alla prima versione**: N° pazienti da nuclei familiari,
  C.A.C. / V.M.P. (stato, calcolo, C.A.C., V.M.P.), preventivi in corso, portafogli
  di inizio anno, € in corso, valore atteso, produzione da eseguire, portafoglio
  produzione, CFMP/saturazione, CFMP, % crediti per componente, portafoglio crediti.
  **Sono presenti ma vuote ("—")**: l'app non raccoglie ancora quei dati. Da
  decidere dove inserirli (pagine esistenti o nuove) — domanda aperta.
- **Fonti dati**: valori da dati mensili/trimestrali; AFP dai dati reali dell'anno
  precedente (conto economico: anche AFP per voce); budget da kpi_targets mensili
  (anche `cashflow.advance_payments`), CFMP/saturazione dal parametro
  `cfmp_target` di studio_configs e Ricavi/MOL dagli obiettivi trimestrali
  `economics.revenue` / `economics.mol` se presenti. Dove manca il riferimento
  (AFP o budget) gli scostamenti restano "—": e' il motivo principale per cui sul
  foglio compaiono e nell'app no (l'AFP e il budget del foglio sono input digitati).
- **Regole replicate dall'Excel**: somma dei mesi per conteggi/valuta (media
  trimestrale AFP = AFP/4), media dei mesi con dato per le percentuali (confronto
  con l'AFP sul valore intero, in pp), valore medio = rapporto dei totali del
  trimestre (anno = media dei trimestri), crediti = fotografia di fine periodo,
  proiezione di fine anno della produzione (progressivo x4 / x2 / x4/3), %
  incassi anticipati = incassi / ricavi del trimestre (se manca il conto
  economico, il valore % inserito mese per mese).
- **Scelte diverse dall'Excel (da confermare)**: (1) budget del trimestre =
  somma/media degli obiettivi mensili del trimestre, non budget annuo/4; (2) per
  percentuali e valori medi il budget non si divide per 4; (3) scostamento della
  colonna Anno solo sui trimestri con dato (su anno completo uguale all'Excel);
  (4) "Valore crediti" somma tutte e quattro le componenti (l'Excel esclude i "non
  pianificati"); (5) saturazione e "€ medio prima visita" dei trimestri su mesi
  corretti (nel foglio le formule T2-T4 puntano a mesi sfalsati); (6) nei blocchi
  Economics lo scostamento trimestrale e' sul periodo corretto (il foglio nel
  blocco cumulato richiama le variazioni del singolo trimestre) e lo scostamento
  annuo dei costi e' la variazione % in euro come nella colonna F del foglio.
- **Ottimizzazioni gia' presenti**: una tabella per sezione con intestazioni fisse
  e colonna KPI fissa, colonne raggruppabili/nascondibili (AFP, Anno, Budget, T1-T4),
  sezioni comprimibili, "vai a", "di cui" nascondibili, evidenziazione di una
  colonna con un click, colori col verso giusto (verde meglio / rosso peggio /
  grigio nessun giudizio).

## Nodo "Inserimento dati" — Fase 1 (2026-10-19, branch staging)

Decisioni di Emilio: C.A.C. e V.M.P. **trimestrali** come nel foglio; il CFMP e' un
dato dell'**anno precedente** da inserire a mano; inserisce **solo il titolare** di
studio (per ora). Preventivi "in corso": calcolati, non digitati (proposta non
contestata). Pagina `/inserimento-dati` (voce di menu visibile solo al titolare; in
demo sempre), schede: Riferimenti (AFP e budget), Traffico, Preventivi, Produzione,
Cashflow, Parametri studio. I campi si salvano all'uscita dalla casella; casella
vuota = elimina; i valori compaiono subito nella Dashboard analitica.

- **Migration `0010_manual_values.sql` (da applicare su Supabase)**: tabella
  generica `manual_values` (anno, row_key, col_key afp/budget/q1-q4/year, valore),
  lettura per i membri, inserimento/modifica/cancellazione **solo per role = owner**.
  Scelta rispetto a quanto proposto in chat: una sola tabella invece di aggiungere
  `dimension_id` a kpi_targets/kpi_prior_year_baseline (vincoli di unicita' con NULL,
  nuovo valore di enum per la cadenza annuale): stesso risultato per l'utente, meno
  rischio sulle tabelle esistenti.
- **Cosa si inserisce**: AFP (totale annuo) e budget (totale annuo) per ogni KPI
  della dashboard dove manca il dato reale o l'obiettivo mensile (la casella e'
  bloccata, con l'origine, quando il valore arriva da dati reali dell'anno
  precedente o da obiettivi mensili); budget annuo di Ricavi e MOL; nuclei
  familiari, C.A.C., V.M.P., valore atteso dai preventivi in corso e produzione da
  eseguire (trimestrali); portafogli di inizio anno di preventivi (numero e €, totale
  e prima visita), produzione e crediti (annuali); CFMP dell'anno precedente.
- **Priorita' nella dashboard**: AFP = dati reali anno precedente > valore manuale >
  derivato (somma figli / rapporto); budget = obiettivi mensili > budget manuale >
  derivato; valori delle righe senza fonte mensile = valori trimestrali del nodo.
- **Righe ora calcolate**: preventivi in corso (numero e €, totale e prima visita) =
  portafoglio di inizio anno + emessi - confermati - persi, con i segni corretti
  (nell'Excel la riga "in corso prima visita" ha i segni invertiti); C.A.C./V.M.P.
  (calcolo e stato OK / NON OK) col margine (MDC%) dello stesso periodo; CFMP/
  saturazione = CFMP / % saturazione (budget dal target di studio_configs).
- **Parametri studio modificabili**: nella scheda "Parametri studio" si inseriscono, per anno, numero
  poltrone, minuti complessivi di apertura teorici e target CFMP/saturazione (stessa
  riga di studio_configs: si salvano insieme per non perdere il target), oltre al CFMP
  dell'anno precedente. Serve la migration `0011_studio_configs_owner_policies.sql`
  (lettura per i membri, scrittura solo per il titolare). Poltrone e minuti sono
  raccolti ma non ancora usati da nessun calcolo (come prima).
### Budget mensili nel nodo (2026-10-19)

Come nel foglio Excel (Saturazione, Customer Experience, CashFlow) **i budget si
inseriscono per mese** e il totale annuo e' la somma dei mesi (media per le
percentuali e per i livelli di fine mese). Principio: se per un KPI esiste una chiave
di obiettivo mensile (`kpi_targets`) il budget annuo non si digita piu' (nel
Riferimenti compare la somma/media, in sola lettura).

- **Griglia "Budget mensili"** in ogni scheda area (Gen-Dic + colonna Anno calcolata,
  casella vuota = elimina l'obiettivo del mese):
  Traffico `traffic.new_patients.total`, `traffic.reactivated.total`; Preventivi
  `quotes.issued_count/confirmed_count/issued_value/confirmed_value/issued_value_pv/
  confirmed_value_pv` e `quotes.close_rate` (media); Produzione `production.total`,
  `production.titolare_share` (media, il budget € titolare = produzione x quota),
  `production.hygiene_sessions`, `production.saturation_pct` (media); Cashflow
  `cashflow.advance_payments`, `cashflow.advance_payments_pct` (media),
  `cashflow.credits_overdue` (livello a fine mese, media) e `economics.revenue_monthly`
  (ricavi del periodo, foglio CashFlow riga 17: somma = budget annuo dei ricavi).
- **Ricavi**: il budget dei ricavi di Economics e dei budget % dei crediti usa, in
  ordine, i ricavi mensili > l'obiettivo trimestrale `economics.revenue` > il valore
  manuale. Con i ricavi mensili i budget cumulati dei trimestri sono la somma esatta
  dei mesi (non piu' annuo x n/4). Il MOL resta trimestrale/annuo.
- **Crediti**: solo i crediti scaduti hanno un obiettivo mensile nel foglio CashFlow;
  pianificati, non pianificati e terzo pagante restano budget annui manuali.
  Il budget "% crediti scaduti" = crediti scaduti budget / ricavi budget.
- **Non modellato**: la riga "Situazione CashFlow" (Positivo/Negativo/Pareggio per
  mese) del foglio CashFlow.
- **Migration `0012_quote_budget_metrics.sql` (da applicare, prima del seed SQL)**:
  aggiunge a `metric_catalog` le 6 chiavi dei preventivi, `cashflow.credits_overdue` ed
  `economics.revenue_monthly`, piu' la policy di delete su `kpi_targets` solo per il
  titolare (serve per svuotare un mese).
- Nel codice: `useAnalyticData().saveTarget(metricKey, mese, valore|null)`,
  `dataProvider.deleteKpiTarget`, `ManualField required`.

- **Fase 2 (da fare)**: spostare nel nodo anche gli inserimenti gia' esistenti (visite,
  preventivi, produzione, cashflow, economics) e rendere le pagine di sola lettura.
  Gli inserimenti dell'anno 2025 del foglio Excel sono nei dati demo locali.

## Prossimo passo

1. **Su Supabase**: whitelistare i redirect URL per reset password/inviti
   — senza questo i due flussi email non funzionano.
2. Applicare le migration non ancora eseguite: `0007_saturation_and_
   targets.sql`, `0008_advance_payments_pct.sql`. Verificare con dati
   reali (non solo demo) tutte le aree con obiettivi.
3. Testare end-to-end: reset password di un utente esistente, e un nuovo
   invito titolare.
4. **Demo ad Andrea Grassi**: l'app è nello stato giusto per una prima
   demo — vedi il ragionamento sopra. Preparare 2-3 domande aperte da
   porre direttamente a lui (in particolare: preventivi "generali" mese
   per mese o a trimestre?) invece di nasconderle.
5. Pulizie rimaste in coda (non bloccanti): rimuovere le policy
   `TEMP_DEMO_anon_read_*`; studio-switcher reale se servirà a qualcuno con
   più studi.
