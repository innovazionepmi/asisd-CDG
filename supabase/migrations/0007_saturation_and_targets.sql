-- ============================================================
-- Saturazione: ultimo dei 6 macro-blocchi dell'Excel originale ancora
-- mancante nell'app. Due parti:
--  1. saturation_monthly: "% Saturazione (Progressiva)" dal foglio
--     Saturazione — un valore inserito a mano ogni mese (NON calcolato da
--     poltrone/minuti apertura: verificato rileggendo l'Excel originale),
--     stessa grana/pattern di hygiene_sessions_monthly.
--  2. Estende metric_catalog con le chiavi mancanti per finalmente
--     attivare kpi_targets (esisteva dalla prima migration ma nessuna
--     pagina lo usava): obiettivi mensili per produzione titolare, quota
--     titolare, e saturazione stessa — gli altri (nuovi pazienti,
--     riattivati, produzione totale, sedute igiene) erano gia' nel
--     catalogo dalla migration 0004.
-- ============================================================

create table saturation_monthly (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  period_month date not null,
  saturation_pct numeric not null default 0,
  unique (studio_id, period_month),
  check (extract(day from period_month) = 1)
);
comment on table saturation_monthly is
  '"% Saturazione (Progressiva)" del foglio Saturazione — valore inserito a mano mensilmente, non derivato da studio_configs.';

create index on saturation_monthly (studio_id, period_month);

alter table saturation_monthly enable row level security;

create policy "members_can_read_saturation_monthly" on saturation_monthly
  for select using (studio_id in (select my_studio_ids()));
create policy "owner_staff_admin_can_insert_saturation_monthly" on saturation_monthly
  for insert with check (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));
create policy "owner_staff_admin_can_update_saturation_monthly" on saturation_monthly
  for update using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role in ('owner', 'staff', 'admin')
  ));

insert into metric_catalog (metric_key, label, unit, stage, grain) values
  ('production.titolare', 'Produzione del titolare', 'currency', 'produzione', 'month'),
  ('production.titolare_share', 'Quota di produzione del titolare', 'percent', 'produzione', 'month'),
  ('production.saturation_pct', '% Saturazione', 'percent', 'produzione', 'month');
