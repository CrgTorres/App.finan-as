-- Perfil do titular (nome + CPF) — execute no SQL Editor do Supabase (uma vez).
-- Necessário para «Guardar perfil» em /dashboard/perfil.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome_completo text not null,
  cpf_digits text not null check (char_length(cpf_digits) = 11 and cpf_digits ~ '^[0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is 'Nome e CPF do titular da conta para validar consumidor em contratos.';

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute procedure public.touch_user_profiles_updated_at();
