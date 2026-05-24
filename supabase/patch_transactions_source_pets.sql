-- Execute no SQL Editor do Supabase se o projeto já existia antes desta atualização:
-- 1) Categorias completas (importação usa Combustível, Transferência para terceiros, etc.)
-- 2) Pets + restantes alinhados a `supabase/schema.sql`
-- 3) Rastreio: source_ref, arquivo (nome/hash) e source_imported_at.
--    A coluna `source` (enum) foi removida do modelo — aplicar também supabase/migrations/remove_transactions_source_column.sql se ainda existir.

alter table public.transactions drop constraint if exists transactions_category_check;

alter table public.transactions add constraint transactions_category_check
  check (
    category in (
      'Alimentação', 'Transporte', 'Moradia', 'Lazer',
      'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
      'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
      'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
    )
  );

alter table public.transaction_classification_rules
  drop constraint if exists transaction_classification_rules_category_check;

alter table public.transaction_classification_rules
  add constraint transaction_classification_rules_category_check
    check (
      category in (
        'Alimentação', 'Transporte', 'Moradia', 'Lazer',
        'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
        'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
        'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
      )
    );

alter table public.transactions drop constraint if exists transactions_source_check;

alter table public.transactions drop column if exists source;

alter table public.transactions
  add column if not exists source_ref text,
  add column if not exists source_file_name text,
  add column if not exists source_file_hash text,
  add column if not exists source_imported_at timestamptz default now();

comment on column public.transactions.source_ref is 'Fingerprint de extrato, chave/resumo NF-e, contracheque:, etc.';
comment on column public.transactions.source_file_name is 'Nome do arquivo de extrato importado (truncado).';
comment on column public.transactions.source_file_hash is 'Hash do arquivo de extrato (ex.: SHA-256 hex).';
