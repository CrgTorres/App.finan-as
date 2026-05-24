alter table public.transactions
add column if not exists source_ref text;

alter table public.transactions
add column if not exists source_file_name text;

alter table public.transactions
add column if not exists source_file_hash text;

alter table public.transactions
add column if not exists source_imported_at timestamptz default now();

create index if not exists transactions_source_ref_idx
on public.transactions (source_ref);

create index if not exists transactions_source_file_hash_idx
on public.transactions (source_file_hash);
