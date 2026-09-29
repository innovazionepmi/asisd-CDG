-- ============================================================
-- Row Level Security — isolamento multi-tenant per studio.
-- Pattern dimostrato su monthly_visits; va replicato identico sulle
-- altre tabelle "fact" (quotes_monthly, production_monthly, pl_quarterly,
-- cashflow_monthly, ecc.) una volta validato lo schema base.
-- ============================================================

alter table studios enable row level security;
alter table studio_configs enable row level security;
alter table studio_members enable row level security;
alter table acquisition_channels enable row level security;
alter table treatment_categories enable row level security;
alter table pl_accounts enable row level security;
alter table monthly_visits enable row level security;
alter table quotes_monthly enable row level security;
alter table quotes_portfolio_opening enable row level security;
alter table quotes_pipeline_forecast_monthly enable row level security;
alter table production_monthly enable row level security;
alter table production_titolare_monthly enable row level security;
alter table hygiene_sessions_monthly enable row level security;
alter table pl_quarterly enable row level security;
alter table cashflow_monthly enable row level security;
alter table kpi_targets enable row level security;
alter table kpi_prior_year_baseline enable row level security;

-- Helper: studi a cui appartiene l'utente autenticato corrente.
create function my_studio_ids() returns setof uuid
language sql security definer stable as $$
  select studio_id from studio_members where user_id = auth.uid()
$$;

-- studio_members: un utente vede solo le proprie righe di appartenenza.
create policy "members see own memberships" on studio_members
  for select using (user_id = auth.uid());

-- studios: visibile solo se membro.
create policy "members see their studios" on studios
  for select using (id in (select my_studio_ids()));

-- Pattern replicabile per ogni tabella "fact" scoped per studio_id
-- (qui mostrato su monthly_visits):
create policy "members can read their studio data" on monthly_visits
  for select using (studio_id in (select my_studio_ids()));

create policy "owner/staff/admin can insert" on monthly_visits
  for insert with check (studio_id in (
    select studio_id from studio_members
    where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));

create policy "owner/staff/admin can update" on monthly_visits
  for update using (studio_id in (
    select studio_id from studio_members
    where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));

-- NB: asisd_coach e' intenzionalmente escluso da insert/update in questo
-- esempio (ruolo di sola consultazione cross-studio) — da confermare come
-- comportamento voluto prima di replicare il pattern ovunque.
