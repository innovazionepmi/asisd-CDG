# Data model — Controllo di Gestione ASISD (v1)

Schema SQL in `supabase/migrations/0001_schema.sql` → `0004_seed_defaults.sql`.
Decisioni confermate: DB multi-tenant condiviso con RLS; v1 a livello studio
(titolare vs collaboratori aggregato, senza dettaglio per singolo operatore).

## Principi

1. **Una sola grana per fatto, mai duplicata.** L'Excel ripete la stessa
   struttura 3 volte per ogni voce (cumulato YTD / delta trimestrale /
   proiezione fine anno). Nel nuovo schema esiste una sola riga per
   studio+periodo; trimestre, YTD e proiezione sono query/viste
   (`0002_views.sql`), mai dati duplicati da tenere sincronizzati.
   **La grana del periodo varia per area, seguendo quanto è operativamente
   rilevabile:**
   - Traffico, preventivi, produzione, cashflow → **mensile**
     (`monthly_visits`, `quotes_monthly`, `production_monthly`,
     `cashflow_monthly`).
   - Costi e ricavi (conto economico) → **trimestrale** (`pl_quarterly`):
     i dati contabili arrivano dal commercialista a trimestre, un valore
     mensile "corretto" non è operativamente ottenibile — esattamente
     come nell'Excel originale.
2. **"AFP" (Anno Fiscale Precedente) non è più un blocco parallelo da
   ricopiare a mano ogni anno**, ma resta un dato che si inserisce
   esplicitamente. Due livelli, in ordine di priorità:
   - Se lo storico dettagliato dell'anno N-1 esiste già nelle tabelle fatti
     (perché lo studio usa l'app da abbastanza tempo, o è stato importato),
     il confronto anno-su-anno lo legge direttamente con un self-join
     (`v_pl_year_over_year` e viste analoghe da costruire per le altre aree).
   - Altrimenti si usa il valore annuale inserito a mano in
     `kpi_prior_year_baseline` — la stessa cosa della colonna "Totale AFP"
     dell'Excel, ma esplicita e con un punto di inserimento dedicato in UI
     invece di essere sepolta in una formula. Il confronto funziona da
     subito (onboarding da Excel) e migliora automaticamente quando i dati
     reali si accumulano, senza bisogno di toccare nulla.
3. **Dimensioni al posto di colonne fisse.** Canali di traffico
   (`acquisition_channels`), tipologie di trattamento
   (`treatment_categories`) e voci di conto economico (`pl_accounts`) sono
   righe di lookup con default condivisi ASISD (`studio_id = null`) più
   estensioni per singolo studio. Aggiungere una campagna marketing o una
   voce di costo non richiede più una modifica di schema.
4. **Target centralizzati.** `kpi_targets` + `metric_catalog` sostituiscono
   le colonne BDGT sparse in ogni foglio: un nuovo KPI diventa targettabile
   aggiungendo una riga al catalogo, non una colonna. `metric_catalog.grain`
   dice se il target (e la baseline AFP) si inseriscono a mese o a
   trimestre, seguendo la stessa regola del punto 1.

## Amministrazione (aggiunto 2026-09-15)

`platform_admins` (migration `0005_platform_admin.sql`) è un ruolo globale,
non legato a uno studio: chi vi appartiene può usare la dashboard `/admin`
per creare nuovi studi e invitare il titolare via email. Nessuna policy RLS
di lettura/scrittura per client anon/authenticated su questa tabella — è
accessibile solo alla `service_role`, usata esclusivamente dalle funzioni
serverless in `api/admin/*` (mai dal browser). L'autorizzazione è quindi
verificata sempre lato server (`requireAdmin()` in `api/admin/_shared.ts`),
non lato client.

Un trigger su `auth.users` (`handle_new_auth_user`) popola automaticamente
`app_users` alla creazione di ogni utente Supabase Auth — necessario perché
`platform_admins.user_id` e `studio_members.user_id` referenziano
`app_users`, che a sua volta referenzia `auth.users`.

Il primo `platform_admin` non può crearsi da solo (problema dell'uovo e
della gallina): va inserito manualmente via SQL la prima volta — vedi
`docs/STATUS.md`.

## Mappatura foglio Excel → tabelle

| Foglio Excel | Tabelle nuove |
|---|---|
| Saturazione (traffico, righe 5-13) | `monthly_visits` + `acquisition_channels` |
| Saturazione (produzione, righe 15-28) | `production_monthly`, `production_titolare_monthly`, `hygiene_sessions_monthly`, `treatment_categories` |
| Customer Experience | `quotes_monthly`, `quotes_portfolio_opening`, `quotes_pipeline_forecast_monthly` |
| Co.Ge Trimestrale | `pl_quarterly` + `pl_accounts`, grana trimestrale (MDC/MOL calcolati in `v_pl_summary_quarterly`) |
| CashFlow | `cashflow_monthly` |
| Aggregato Trimestrale | eliminato: diventa un set di viste sui fatti mensili/trimestrali |
| Dashboard | resta come schermata applicativa, alimentata dalle viste |
| Colonna "Totale AFP" (ovunque) | `kpi_prior_year_baseline` (fallback) + dati reali anno N-1 nelle tabelle fatti (`v_pl_year_over_year` e viste analoghe) |
| Colonne "BDGT" (ovunque) | `kpi_targets` + `metric_catalog` |
| B6/B7/B8 Dashboard (poltrone, minuti apertura, CFMP) | `studio_configs` |

## Decisioni confermate (2026-09-14)

- Grana mensile per traffico/preventivi/produzione/cashflow, **trimestrale
  per costi e ricavi** (`pl_quarterly`) — non operativamente fattibile
  avere valori mensili corretti di conto economico.
- L'"AFP" resta un valore inseribile esplicitamente
  (`kpi_prior_year_baseline`), non solo dedotto dai dati storici in-app.

## Assunzioni ancora da validare con Andrea

- **`quotes_monthly` a grana mensile anche per i preventivi "generali".**
  Nell'Excel originale i preventivi "generali" (tutti i pazienti) esistono
  solo a livello trimestrale in `Aggregato Trimestrale`, senza dettaglio
  mensile; solo il sotto-insieme "prima visita" ha dettaglio mensile nel
  foglio Customer Experience. Ho unificato tutto a grana mensile per
  coerenza (confermato per preventivi in generale). Resta da confermare se
  lo studio rileva davvero i preventivi ai pazienti esistenti mese per
  mese, o se anche questo pezzo va spostato a trimestre come il conto
  economico.
- **`production_titolare_monthly` non è spaccata per categoria di
  trattamento**, esattamente come nell'Excel (dove "Valore Produzione
  Titolare" è un unico totale, non incrociato con chirurgia/protesi/ecc.).
  Coerente con la decisione "v1 a livello studio".
- **Piano dei conti (`pl_accounts`) come dimensione estendibile** invece di
  undici colonne fisse. Più flessibile, ma introduce un livello di
  indirezione in più nelle query — accettabile per il beneficio di non
  dover fare una migrazione ogni volta che cambia un costo da tracciare.

## Prossimi passi possibili

- Schermata di onboarding per popolare `kpi_prior_year_baseline` (i valori
  "AFP" annuali) quando uno studio arriva da Excel senza storico dettagliato
  in-app; opzionalmente import una tantum di dati storici reali se
  disponibili a livello mensile/trimestrale.
- Estendere `0002_views.sql` a coprire il resto dei KPI del cruscotto
  originale (saturazione %, CAC/VMP, produzione da eseguire, ecc.) con lo
  stesso pattern reale+fallback usato in `v_pl_year_over_year`.
- Completare le policy RLS su tutte le tabelle fact (oggi dimostrate solo
  su `monthly_visits`).
- Disegno delle schermate di data-entry: mensili per traffico / preventivi /
  produzione / cashflow, trimestrali per il conto economico.
