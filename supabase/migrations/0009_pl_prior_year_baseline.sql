-- ============================================================
-- AFP (Anno Fiscale Precedente) PER VOCE di conto economico.
-- Nel foglio "Co.Ge Trimestrale" la colonna "Anno Fiscale Precedente" ha un
-- valore per ogni voce (materiali, energia, collaboratori, ...), non solo
-- ricavi e MOL: serve per calcolare, voce per voce, l'incidenza sul ricavo
-- dell'anno precedente e quindi lo "Scost vs. AFP" di ogni riga.
-- kpi_prior_year_baseline (solo economics.revenue / economics.mol) resta
-- com'e': l'app continua a scriverci i due totali derivati, cosi la
-- Dashboard e le viste SQL esistenti non cambiano.
-- Come per kpi_prior_year_baseline, questi valori sono una riserva: se per
-- l'anno precedente esistono gia dati trimestrali reali in pl_quarterly,
-- l'app usa quelli.
-- ============================================================

create table pl_prior_year_baseline (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  fiscal_year int not null, -- l'anno CUI si riferisce il valore (es. 2025, per confronti nel 2026)
  account_id uuid not null references pl_accounts(id),
  annual_value numeric not null default 0,
  unique (studio_id, fiscal_year, account_id)
);
comment on table pl_prior_year_baseline is
  'Valore annuale AFP per voce di piano dei conti, inserito a mano (onboarding da Excel o primo anno di utilizzo). Riserva rispetto ai dati reali in pl_quarterly.';

create index on pl_prior_year_baseline (studio_id, fiscal_year);

alter table pl_prior_year_baseline enable row level security;

create policy "members_can_read_pl_prior_year_baseline" on pl_prior_year_baseline
  for select using (studio_id in (select my_studio_ids()));
create policy "owner_staff_admin_can_insert_pl_prior_year_baseline" on pl_prior_year_baseline
  for insert with check (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));
create policy "owner_staff_admin_can_update_pl_prior_year_baseline" on pl_prior_year_baseline
  for update using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));
