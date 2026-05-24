-- Dois contracheques no mesmo mês/ano (ex.: folha normal + folha especial 13º antecipado).
-- Execute no SQL Editor do Supabase se a tabela já existir com UNIQUE (user_id, month, year).

alter table public.payslips
  add column if not exists folha_emit_kind text not null default 'mensal_principal';

update public.payslips
set folha_emit_kind = 'ficha_import'
where coalesce(document_kind, '') = 'ficha_financeira';

-- Nome típico do UNIQUE em instalações geradas a partir de payslips.sql
alter table public.payslips drop constraint if exists payslips_user_id_month_year_key;

-- Se o DROP acima falhar, localize o nome com:
--   select conname from pg_constraint where conrelid = 'public.payslips'::regclass and contype = 'u';

alter table public.payslips
  add constraint payslips_user_month_year_emit_unique
  unique (user_id, month, year, folha_emit_kind);

comment on column public.payslips.folha_emit_kind is
  'mensal_principal = contracheque mensal completo; folha_especial = 2º extrato mesmo DATA (ex. 13º antec.); ficha_import = importado da ficha financeira.';
