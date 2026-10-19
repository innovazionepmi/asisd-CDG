-- ============================================================
-- Parametri studio modificabili dal titolare (nodo "Inserimento dati",
-- scheda "Parametri studio"): numero poltrone, minuti complessivi di apertura
-- teorici, target CFMP/saturazione. Fino ad ora studio_configs si scriveva solo
-- alla creazione dello studio (service_role dall'area admin).
-- Lettura per tutti i membri; inserimento e modifica solo per role = owner.
-- Idempotente (drop policy if exists).
-- ============================================================

drop policy if exists "members_can_read_studio_configs" on studio_configs;
create policy "members_can_read_studio_configs" on studio_configs
  for select using (studio_id in (select my_studio_ids()));

drop policy if exists "owner_can_insert_studio_configs" on studio_configs;
create policy "owner_can_insert_studio_configs" on studio_configs
  for insert with check (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));

drop policy if exists "owner_can_update_studio_configs" on studio_configs;
create policy "owner_can_update_studio_configs" on studio_configs
  for update using (studio_id in (
    select studio_id from studio_members where user_id = auth.uid() and role = 'owner'
  ));
