/** Memória automática por documento / favorecido / palavra-chave. */
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
