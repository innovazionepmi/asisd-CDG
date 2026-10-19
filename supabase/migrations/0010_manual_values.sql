-- ============================================================
-- Nodo "Inserimento dati": valori manuali che non hanno una fonte nei dati
-- mensili (celle GIALLE del foglio "Aggregato Trimestrale" dell'Excel ASISD):
--   - riferimenti AFP (anno precedente) e budget annuo per ogni KPI della
--     Dashboard analitica, dove non esiste un dato reale o un obiettivo mensile
--   - dati trimestrali senza altra casa: nuclei familiari, C.A.C., V.M.P.,
--     valore atteso dai preventivi in corso, produzione da eseguire
--   - dati annuali: portafogli di inizio anno (preventivi, produzione, crediti)
--   - CFMP dell'anno precedente
-- Una tabella generica invece di una colonna o una migration per riga del foglio.
--
--   fiscal_year  anno analizzato (l'AFP si riferisce sempre all'anno precedente)
--   row_key      riga della Dashboard analitica ('new_patients', 'ch:<uuid canale>',
--                'cac', 'q_portfolio_count', 'cfmp', 'pl:revenue'...)
--   col_key      'afp' | 'budget' | 'q1'..'q4' (valore del trimestre) | 'year'
--
-- Inserimento riservato al titolare di studio (role = 'owner'); lettura per
-- tutti i membri dello studio. L'amministrazione ASISD opera con service_role.
-- ============================================================

create table manual_values (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  fiscal_year int not null,
  row_key text not null,
  col_key text not null check (col_key in ('afp', 'budget', 'q1', 'q2', 'q3', 'q4', 'year')),
  value numeric not null,
  updated_at timestamptz not null default now(),
  unique (studio_id, fiscal_year, row_key, col_key)
);
comment on table manual_values is
  'Valori manuali del nodo Inserimento dati (celle gialle del foglio Aggregato Trimestrale): AFP, budget annuo, dati trimestrali e annuali senza fonte mensile.';

create index on manual_values (studio_id, fiscal_year);

alter table manual_values enable row level security;

create policy "members_can_read_manual_values" on manual_values
  for select using (studio_id in (select my_studio_ids()));
create policy "owner_can_insert_manual_values" on manual_values
  for insert with check (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));
create policy "owner_can_update_manual_values" on manual_values
  for update using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));
create policy "owner_can_delete_manual_values" on manual_values
  for delete using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));
