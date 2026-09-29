-- ============================================================
-- Fix: le tabelle di dimensione condivise erano illeggibili da chiunque.
-- RLS era attiva (0001) ma senza nessuna policy di SELECT: default-deny
-- totale, anche per le righe di default ASISD (studio_id is null), che
-- invece sono dati di riferimento pubblici, non per-tenant.
-- ============================================================

-- acquisition_channels / treatment_categories / pl_accounts: leggibili se
-- sono un default condiviso (studio_id is null) oppure se l'utente
-- autenticato appartiene allo studio proprietario della riga custom.
create policy "shared defaults and own studio channels are readable" on acquisition_channels
  for select using (studio_id is null or studio_id in (select my_studio_ids()));

create policy "shared defaults and own studio categories are readable" on treatment_categories
  for select using (studio_id is null or studio_id in (select my_studio_ids()));

create policy "shared defaults and own studio accounts are readable" on pl_accounts
  for select using (studio_id is null or studio_id in (select my_studio_ids()));

-- metric_catalog non ha studio_id: è interamente un catalogo di riferimento
-- pubblico (chiavi/etichette dei KPI), nessun dato sensibile.
alter table metric_catalog enable row level security;
create policy "metric catalog is publicly readable" on metric_catalog
  for select using (true);

-- ============================================================
-- Completa il pattern read/insert/update già dimostrato su monthly_visits
-- (0003_rls.sql) sulle rimanenti tabelle per-studio: erano RLS-enabled ma
-- senza alcuna policy, quindi completamente illeggibili/inscrivibili anche
-- per i membri legittimi dello studio. Uso un blocco dinamico invece di
-- ripetere 33 policy quasi identiche a mano.
-- ============================================================
do $$
declare
  t text;
  tables text[] := array[
    'quotes_monthly', 'quotes_portfolio_opening', 'quotes_pipeline_forecast_monthly',
    'production_monthly', 'production_titolare_monthly', 'hygiene_sessions_monthly',
    'pl_quarterly', 'cashflow_monthly', 'kpi_targets', 'kpi_prior_year_baseline',
    'studio_configs'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on %I for select using (studio_id in (select my_studio_ids()))',
      'members_can_read_' || t, t
    );
    execute format(
      'create policy %I on %I for insert with check (studio_id in (select studio_id from studio_members where user_id = auth.uid() and role in (''owner'',''staff'',''admin'')))',
      'owner_staff_admin_can_insert_' || t, t
    );
    execute format(
      'create policy %I on %I for update using (studio_id in (select studio_id from studio_members where user_id = auth.uid() and role in (''owner'',''staff'',''admin'')))',
      'owner_staff_admin_can_update_' || t, t
    );
  end loop;
end $$;
