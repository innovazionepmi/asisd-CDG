-- ============================================================
-- Ruolo amministrativo globale (non legato a un singolo studio) +
-- auto-provisioning di app_users alla creazione di un utente Auth.
-- ============================================================

create table platform_admins (
  user_id uuid primary key references app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table platform_admins is
  'Utenti con accesso alla dashboard amministrativa ASISD (creazione studi e '
  'credenziali) — ruolo di piattaforma, non legato a un singolo studio. '
  'Nessuna policy RLS di lettura/scrittura per client anon/authenticated: '
  'tutte le operazioni passano dalle funzioni serverless (api/admin/*) che '
  'usano la service_role key, mai dal browser con la anon key. Il primo '
  'admin va inserito manualmente via SQL — vedi docs/STATUS.md.';

alter table platform_admins enable row level security;
-- Nessuna policy creata deliberatamente: default deny per anon/authenticated,
-- accessibile solo alla service_role (che bypassa RLS).

-- Popola automaticamente public.app_users quando viene creato un utente
-- Supabase Auth (signup diretto, invito admin, ecc.) — senza questo trigger
-- la FK app_users.id -> auth.users.id andrebbe popolata a mano ogni volta.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.app_users (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
