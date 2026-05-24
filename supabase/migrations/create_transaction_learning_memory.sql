create table if not exists public.transaction_learning_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  document_ref text,
  payee_name text,
  normalized_key text not null,
  category text not null,
  subtype text,
  confidence_score numeric default 0.5,
  confirmations_count integer default 1,
  last_confirmed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists transaction_learning_memory_user_key_idx
on public.transaction_learning_memory (user_id, normalized_key);

create index if not exists transaction_learning_memory_document_ref_idx
on public.transaction_learning_memory (document_ref);

create index if not exists transaction_learning_memory_payee_name_idx
on public.transaction_learning_memory (payee_name);

alter table public.transaction_learning_memory enable row level security;

create policy transaction_learning_memory_select_own
  on public.transaction_learning_memory
  for select
  using (auth.uid() = user_id);

create policy transaction_learning_memory_insert_own
  on public.transaction_learning_memory
  for insert
  with check (auth.uid() = user_id);

create policy transaction_learning_memory_update_own
  on public.transaction_learning_memory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy transaction_learning_memory_delete_own
  on public.transaction_learning_memory
  for delete
  using (auth.uid() = user_id);

create or replace function public.touch_transaction_learning_memory_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transaction_learning_memory_touch_updated_at
  on public.transaction_learning_memory;

create trigger transaction_learning_memory_touch_updated_at
  before update on public.transaction_learning_memory
  for each row
  execute procedure public.touch_transaction_learning_memory_updated_at();
