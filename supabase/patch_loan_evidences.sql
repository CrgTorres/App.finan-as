-- Evidências documentais ligadas a empréstimos (cadastro `loans` ou contrato inferido na análise).
-- Execute no SQL Editor do Supabase. Requer tabela `public.loans` existente.

create table if not exists public.loan_evidences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid references public.loans(id) on delete cascade,
  -- Quando ainda não existe linha em `loans`, usa-se o mesmo fingerprint gerado na app (inf|...).
  contrato_inferido_fingerprint text,
  tipo_evidencia text not null check (tipo_evidencia in (
    'contrato_formal',
    'extrato_bancario',
    'autorizacao_desconto',
    'comprovante_quitacao',
    'decisao_judicial',
    'taxa_seguro',
    'outro'
  )),
  nome_arquivo text not null,
  storage_path text not null,
  data_documento date,
  observacao text,
  created_at timestamptz not null default now(),
  constraint loan_evidences_target_ck check (
    loan_id is not null
    or (contrato_inferido_fingerprint is not null and length(trim(contrato_inferido_fingerprint)) > 0)
  )
);

create index if not exists loan_evidences_user_idx on public.loan_evidences (user_id);
create index if not exists loan_evidences_loan_idx on public.loan_evidences (loan_id);
create index if not exists loan_evidences_fingerprint_idx on public.loan_evidences (contrato_inferido_fingerprint);

alter table public.loan_evidences enable row level security;

create policy "Users can select own loan_evidences"
  on public.loan_evidences for select
  using (auth.uid() = user_id);

create policy "Users can insert own loan_evidences"
  on public.loan_evidences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own loan_evidences"
  on public.loan_evidences for update
  using (auth.uid() = user_id);

create policy "Users can delete own loan_evidences"
  on public.loan_evidences for delete
  using (auth.uid() = user_id);

-- Bucket + políticas Storage: execute também supabase/patch_loan_evidences_storage_rls.sql
-- (sem isso o upload devolve «new row violates row-level security policy»).
-- Conferência / sem vínculo: supabase/patch_loan_evidences_conferencia.sql
