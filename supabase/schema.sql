-- Create transactions table
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  date date not null,
  type text not null check (type in ('receita', 'despesa')),
  category text not null check (
    category in (
      'Alimentação', 'Transporte', 'Moradia', 'Lazer',
      'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
      'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
      'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
    )
  ),
  source_ref text,
  source_file_name text,
  source_file_hash text,
  source_imported_at timestamptz default now(),
  created_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table public.transactions enable row level security;

-- Policies: users can only access their own transactions
create policy "Users can select own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Index for performance on date filters
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);

create index if not exists transactions_source_ref_idx
  on public.transactions (source_ref);

create index if not exists transactions_source_file_hash_idx
  on public.transactions (source_file_hash);

-- Memória de classificação (regras persistidas ao ajustar categoria manualmente)
create table if not exists public.transaction_classification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_ref text,
  payee_name text,
  keyword text,
  category text not null check (
    category in (
      'Alimentação', 'Transporte', 'Moradia', 'Lazer',
      'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
      'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
      'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
    )
  ),
  rule_type text not null check (rule_type in ('documento', 'favorecido', 'palavra_chave')),
  created_at timestamptz not null default now()
);

create index if not exists transaction_classification_rules_user_idx
  on public.transaction_classification_rules (user_id, created_at desc);

create unique index if not exists transaction_classification_rules_documento_uidx
  on public.transaction_classification_rules (user_id, document_ref)
  where rule_type = 'documento' and document_ref is not null and length(trim(document_ref)) > 0;

create unique index if not exists transaction_classification_rules_favorecido_uidx
  on public.transaction_classification_rules (user_id, payee_name)
  where rule_type = 'favorecido' and payee_name is not null and length(trim(payee_name)) > 0;

create unique index if not exists transaction_classification_rules_keyword_uidx
  on public.transaction_classification_rules (user_id, keyword)
  where rule_type = 'palavra_chave' and keyword is not null and length(trim(keyword)) > 0;

alter table public.transaction_classification_rules enable row level security;

create policy "Users manage own classification rules"
  on public.transaction_classification_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
