-- ============================================================
-- ASISD CdG — Controllo di Gestione — Schema iniziale
-- ============================================================
-- Principi di design:
--  - Grana mensile come unica fonte di verita': trimestre/YTD/proiezione
--    fine anno sono VISTE calcolate (vedi 0002_views.sql), mai righe duplicate.
--  - "AFP" (Anno Fiscale Precedente) non esiste come concetto a se':
--    e' semplicemente l'anno N-1 nelle stesse tabelle (vedi v_kpi_year_over_year).
--  - Canali/categorie/voci di costo sono dimensioni (righe), non colonne fisse:
--    default condivisi ASISD (studio_id null) + personalizzabili per studio.
--  - Target/budget e baseline "AFP" centralizzati in kpi_targets +
--    kpi_prior_year_baseline + metric_catalog, invece di colonne
--    BDGT/AFP sparse in ogni foglio.
--  - Grana del periodo per area: mensile per traffico/preventivi/
--    produzione/cashflow, trimestrale per il conto economico
--    (pl_quarterly) — i dati contabili non sono disponibili a mese.

create extension if not exists pgcrypto;

-- ---------- ENUM ----------

create type studio_member_role as enum ('owner', 'staff', 'asisd_coach', 'admin');
create type channel_type as enum ('organic_spontaneous', 'convenzione', 'ricerca_web', 'marketing_campaign', 'reactivation', 'other');
create type patient_segment as enum ('new_patient', 'returning_patient');
create type pl_account_type as enum ('revenue', 'variable_cost', 'fixed_cost');
create type cashflow_status as enum ('positivo', 'negativo', 'pareggio');
create type metric_unit as enum ('count', 'currency', 'percent');
create type funnel_stage as enum ('traffico', 'preventivi', 'produzione', 'economics', 'cashflow');
create type metric_grain as enum ('month', 'quarter');

-- ---------- TENANCY ----------

create table studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_number text,
  created_at timestamptz not null default now()
);
comment on table studios is 'Uno studio dentistico cliente ASISD (tenant).';

create table studio_configs (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  year int not null,
  num_chairs numeric not null,
  theoretical_opening_minutes numeric,
  cfmp_target numeric,
  created_at timestamptz not null default now(),
  unique (studio_id, year)
);
comment on table studio_configs is 'Parametri operativi per anno: nr poltrone, minuti apertura teorici, target CFMP/saturazione.';

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table studio_members (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role studio_member_role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (studio_id, user_id)
);
comment on table studio_members is 'Appartenenza utente-studio con ruolo. Un asisd_coach puo appartenere a piu studi.';

-- ---------- DIMENSIONI (condivise + personalizzabili per studio) ----------

create table acquisition_channels (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references studios(id) on delete cascade, -- null = default globale ASISD
  name text not null,
  type channel_type not null,
  active_from date,
  active_to date,
  sort_order int not null default 0
);
comment on table acquisition_channels is 'Canali di acquisizione traffico: spontanea, convenzioni, ricerche web, campagne mktg (dinamiche per studio), riattivazioni.';

create table treatment_categories (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references studios(id) on delete cascade, -- null = default globale ASISD
  name text not null,
  sort_order int not null default 0
);
comment on table treatment_categories is 'Tipologie di trattamento per la produzione: Chirurgia, Implantologia, Protesi, ecc.';

create table pl_accounts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references studios(id) on delete cascade, -- null = piano dei conti default ASISD
  name text not null,
  account_type pl_account_type not null,
  sort_order int not null default 0
);
comment on table pl_accounts is 'Piano dei conti semplificato PMOS: ricavi, costi variabili, costi fissi. MDC/MOL sono calcolati, mai salvati.';

create table metric_catalog (
  metric_key text primary key,
  label text not null,
  unit metric_unit not null,
  stage funnel_stage not null,
  grain metric_grain not null default 'month'
);
comment on table metric_catalog is 'Catalogo dei KPI targettabili. grain determina se il target/baseline si inserisce per mese o per trimestre (economics = quarter, tutto il resto = month) — vedi kpi_targets e kpi_prior_year_baseline.';

-- ---------- FATTI (grana mensile) ----------

create table monthly_visits (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  channel_id uuid not null references acquisition_channels(id),
  visit_count int not null default 0,
  unique (studio_id, period_month, channel_id),
  check (extract(day from period_month) = 1)
);
comment on table monthly_visits is 'Nuove visite/riattivazioni mensili per canale. Sostituisce righe 5-13 del foglio Saturazione.';

create table quotes_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  patient_segment patient_segment not null,
  issued_count int not null default 0,
  issued_value numeric not null default 0,
  confirmed_count int not null default 0,
  confirmed_value numeric not null default 0,
  lost_count int not null default 0,
  lost_value numeric not null default 0,
  unique (studio_id, period_month, patient_segment),
  check (extract(day from period_month) = 1)
);
comment on table quotes_monthly is 'Preventivi mensili per segmento paziente. "Generali" = somma new_patient + returning_patient. NB: nell''Excel originale i preventivi "generali" erano inseriti solo a livello trimestrale; qui si assume grana mensile per coerenza — da confermare.';

create table quotes_portfolio_opening (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  fiscal_year int not null,
  patient_segment patient_segment not null,
  opening_count int not null default 0,
  opening_value numeric not null default 0,
  unique (studio_id, fiscal_year, patient_segment)
);
comment on table quotes_portfolio_opening is 'Portafoglio preventivi in corso a inizio anno. Il portafoglio corrente si calcola in vista (opening + emessi - confermati - persi, cumulato).';

create table quotes_pipeline_forecast_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  expected_value numeric not null default 0,
  unique (studio_id, period_month),
  check (extract(day from period_month) = 1)
);
comment on table quotes_pipeline_forecast_monthly is 'Stima manuale del valore atteso dai preventivi in corso (giudizio del titolare, non derivabile dai dati).';

create table production_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  treatment_category_id uuid not null references treatment_categories(id),
  production_value numeric not null default 0,
  unique (studio_id, period_month, treatment_category_id),
  check (extract(day from period_month) = 1)
);
comment on table production_monthly is 'Valore produzione eseguita mensile per tipologia trattamento.';

create table production_titolare_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  production_value numeric not null default 0,
  unique (studio_id, period_month),
  check (extract(day from period_month) = 1)
);
comment on table production_titolare_monthly is 'Quota di produzione eseguita direttamente dal titolare (aggregata, non per categoria — coerente con v1 studio-level).';

create table hygiene_sessions_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  session_count int not null default 0,
  unique (studio_id, period_month),
  check (extract(day from period_month) = 1)
);
comment on table hygiene_sessions_monthly is 'Numero sedute di igiene nel mese (conteggio, distinto dal valore economico gia in production_monthly).';

create table pl_quarterly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_quarter date not null, -- primo giorno del trimestre: 01/01, 01/04, 01/07, 01/10
  account_id uuid not null references pl_accounts(id),
  amount numeric not null default 0,
  unique (studio_id, period_quarter, account_id),
  check (extract(day from period_quarter) = 1 and extract(month from period_quarter) in (1, 4, 7, 10))
);
comment on table pl_quarterly is 'Conto economico per voce di piano dei conti, a grana TRIMESTRALE (non mensile): operativamente i dati di costi/ricavi arrivano dal commercialista a trimestre, non e'' realistico un valore mensile corretto. Sostituisce Co.Ge Trimestrale (le 3 viste cumulato/trimestrale/proiezione diventano query su questa unica tabella).';

create table cashflow_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  status cashflow_status,
  advance_payments_value numeric not null default 0,
  planned_receivables numeric not null default 0,
  unplanned_receivables numeric not null default 0,
  overdue_receivables numeric not null default 0,
  third_party_payer_receivables numeric not null default 0,
  unique (studio_id, period_month),
  check (extract(day from period_month) = 1)
);
comment on table cashflow_monthly is 'Fotografia mensile di cassa e crediti. Sostituisce il foglio CashFlow.';

create table kpi_targets (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_start date not null, -- primo del mese o del trimestre, a seconda di metric_catalog.grain
  metric_key text not null references metric_catalog(metric_key),
  target_value numeric not null,
  unique (studio_id, period_start, metric_key),
  check (extract(day from period_start) = 1)
);
comment on table kpi_targets is 'Obiettivi/budget per KPI, a mese o trimestre secondo metric_catalog.grain. Sostituisce le colonne BDGT sparse nell''Excel. Un piano annuale si popola lato applicazione distribuendo sui periodi.';

create table kpi_prior_year_baseline (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  fiscal_year int not null, -- l'anno CUI si riferisce il valore (es. 2025, per confronti nel 2026)
  metric_key text not null references metric_catalog(metric_key),
  annual_value numeric not null,
  unique (studio_id, fiscal_year, metric_key)
);
comment on table kpi_prior_year_baseline is
  'Valore annuale "AFP" inserito manualmente per uno studio/anno/KPI — esattamente come la colonna "Totale AFP" dell''Excel. '
  'E'' il punto di ingresso per il confronto anno-su-anno quando lo storico dettagliato (mensile/trimestrale) di quell''anno non e'' ancora nel sistema '
  '(tipicamente: primo anno di utilizzo dell''app, o onboarding da Excel). Le viste di confronto (v_*_year_over_year) usano prima i dati reali '
  'nelle tabelle fatti e, solo se assenti per quel periodo, ripiegano su questo valore (diviso per 4 se il confronto e'' trimestrale) — cosi'' il '
  'confronto funziona da subito e migliora automaticamente quando i dati reali si accumulano, senza piu'' bisogno di questa tabella.';

-- ---------- INDICI ----------

create index on studio_members (user_id);
create index on monthly_visits (studio_id, period_month);
create index on quotes_monthly (studio_id, period_month);
create index on production_monthly (studio_id, period_month);
create index on pl_quarterly (studio_id, period_quarter);
create index on cashflow_monthly (studio_id, period_month);
create index on kpi_targets (studio_id, period_start);
create index on kpi_prior_year_baseline (studio_id, fiscal_year);
