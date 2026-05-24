-- Anexos da folha (contracheque mensal, meses extraídos da ficha financeira, etc.)
--
-- TABELA NOVA (primeira vez): execute este ficheiro.
-- TABELA JÁ EXISTE: execute patch_payslips_completo_ordem_correta.sql (uma vez, Run inteiro)
-- Opcional depois: patch_payslips_cartao_saque_embutido.sql

create table if not exists public.payslips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  month int not null check (month >= 1 and month <= 12),
  year int not null check (year >= 1990 and year <= 2100),
  gross_salary numeric(14, 2) not null default 0,
  net_salary numeric(14, 2) not null default 0,
  total_discounts numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  raw_text text not null default '',
  file_name text not null default '',
  document_kind text,
  folha_emit_kind text not null default 'mensal_principal',
  created_at timestamptz default now() not null,
  unique (user_id, month, year, folha_emit_kind)
);

alter table public.payslips enable row level security;

drop policy if exists "own_payslips_select" on public.payslips;
drop policy if exists "own_payslips_insert" on public.payslips;
drop policy if exists "own_payslips_update" on public.payslips;
drop policy if exists "own_payslips_delete" on public.payslips;

create policy "own_payslips_select" on public.payslips for select using (auth.uid() = user_id);
create policy "own_payslips_insert" on public.payslips for insert with check (auth.uid() = user_id);
create policy "own_payslips_update" on public.payslips for update using (auth.uid() = user_id);
create policy "own_payslips_delete" on public.payslips for delete using (auth.uid() = user_id);

create index if not exists payslips_user_year_month_idx on public.payslips (user_id, year desc, month desc);

-- Migração de tabela antiga: ver patch_payslips_migrar_tabela_existente.sql
