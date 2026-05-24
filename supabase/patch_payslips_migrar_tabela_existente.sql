-- =============================================================================
-- MIGRAÇÃO: tabela payslips JÁ EXISTE no Supabase
-- =============================================================================
-- Preferir executar TUDO de uma vez: patch_payslips_completo_ordem_correta.sql
-- (evita erro "column folha_emit_kind does not exist" ao correr só o dedup).
-- =============================================================================

-- Metadados de tipo de documento (ficha financeira vs contracheque mensal)
alter table public.payslips
  add column if not exists document_kind text;

-- Folha mensal principal vs especial vs importação da ficha corrida
alter table public.payslips
  add column if not exists folha_emit_kind text;

update public.payslips
set folha_emit_kind = coalesce(folha_emit_kind, 'mensal_principal')
where folha_emit_kind is null;

alter table public.payslips
  alter column folha_emit_kind set default 'mensal_principal';

-- Marca registos antigos só de ficha (se file_name ou padrão conhecido)
update public.payslips
set document_kind = 'ficha_financeira',
    folha_emit_kind = 'ficha_import'
where document_kind is null
  and (
    lower(coalesce(file_name, '')) like '%ficha%'
    or length(coalesce(raw_text, '')) > 8000
  );

-- Duplicatas (ex.: Janeiro/2025 gravado 2x) impedem o UNIQUE — mantém o mais recente/completo
delete from public.payslips p
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, month, year, folha_emit_kind
        order by
          created_at desc nulls last,
          length(coalesce(raw_text, '')) desc,
          coalesce(jsonb_array_length(items), 0) desc,
          id desc
      ) as rn
    from public.payslips
  ) ranked
  where ranked.rn > 1
) dup
where p.id = dup.id;

-- Índice único com folha_emit_kind (substitui user_id+month+year antigo)
alter table public.payslips drop constraint if exists payslips_user_id_month_year_key;

alter table public.payslips
  drop constraint if exists payslips_user_month_year_emit_unique;

alter table public.payslips
  add constraint payslips_user_month_year_emit_unique
  unique (user_id, month, year, folha_emit_kind);

create index if not exists payslips_user_year_month_idx
  on public.payslips (user_id, year desc, month desc);

comment on column public.payslips.document_kind is
  'contracheque_mensal | ficha_financeira | …';

comment on column public.payslips.folha_emit_kind is
  'mensal_principal | folha_especial | ficha_import';

-- Verificação (deve listar document_kind e folha_emit_kind)
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payslips'
order by ordinal_position;
