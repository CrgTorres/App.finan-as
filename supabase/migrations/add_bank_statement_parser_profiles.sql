create table if not exists public.bank_statement_parser_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank_name text,
  detector_keywords text[] not null default '{}',
  date_pattern text,
  value_format text,
  columns_map jsonb not null default '{}',
  ignore_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_statement_parser_profiles_user_id_idx
on public.bank_statement_parser_profiles (user_id);

alter table public.bank_statement_parser_profiles enable row level security;

create policy bank_statement_parser_profiles_select_own
  on public.bank_statement_parser_profiles
  for select
  using (auth.uid() = user_id);

create policy bank_statement_parser_profiles_insert_own
  on public.bank_statement_parser_profiles
  for insert
  with check (auth.uid() = user_id);

create policy bank_statement_parser_profiles_update_own
  on public.bank_statement_parser_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy bank_statement_parser_profiles_delete_own
  on public.bank_statement_parser_profiles
  for delete
  using (auth.uid() = user_id);

create or replace function public.touch_bank_statement_parser_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bank_statement_parser_profiles_touch_updated_at
  on public.bank_statement_parser_profiles;

create trigger bank_statement_parser_profiles_touch_updated_at
  before update on public.bank_statement_parser_profiles
  for each row
  execute procedure public.touch_bank_statement_parser_profiles_updated_at();
