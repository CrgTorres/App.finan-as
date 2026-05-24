-- =============================================================================
-- EXECUTE ESTE FICHEIRO INTEIRO DE UMA VEZ (Supabase SQL Editor → Run)
-- Ordem correta: colunas → preencher → deduplicar → índice único
-- =============================================================================

-- PASSO 1 — Colunas (obrigatório antes de qualquer UPDATE)
alter table public.payslips
  add column if not exists document_kind text;

alter table public.payslips
  add column if not exists folha_emit_kind text;

-- PASSO 2 — Valores padrão nas linhas antigas
update public.payslips
set folha_emit_kind = 'mensal_principal'
where folha_emit_kind is null;

update public.payslips
set document_kind = 'ficha_financeira',
    folha_emit_kind = 'ficha_import'
where document_kind is null
  and (
    lower(coalesce(file_name, '')) like '%ficha%'
    or length(coalesce(raw_text, '')) > 8000
  );

-- Ficha corrida gravada em lote (só mensal_principal, muitas competências)
update public.payslips p
set document_kind = 'ficha_financeira',
    folha_emit_kind = 'ficha_import'
where coalesce(p.document_kind, '') = ''
  and coalesce(p.folha_emit_kind, 'mensal_principal') = 'mensal_principal'
  and exists (
    select 1
    from public.payslips g
    where g.user_id = p.user_id
    group by g.user_id
    having count(*) >= 24 and max(g.year) - min(g.year) >= 2
  );

alter table public.payslips
  alter column folha_emit_kind set default 'mensal_principal';

-- PASSO 3 — Ver duplicatas (só leitura)
select user_id, month, year, folha_emit_kind, count(*) as qtd
from public.payslips
group by user_id, month, year, folha_emit_kind
having count(*) > 1
order by qtd desc;

-- PASSO 4 — Remove duplicatas (fica o mais recente / mais completo)
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

-- PASSO 5 — Índice único
alter table public.payslips drop constraint if exists payslips_user_id_month_year_key;

alter table public.payslips drop constraint if exists payslips_user_month_year_emit_unique;

alter table public.payslips
  add constraint payslips_user_month_year_emit_unique
  unique (user_id, month, year, folha_emit_kind);

create index if not exists payslips_user_year_month_idx
  on public.payslips (user_id, year desc, month desc);

-- PASSO 6 — Confirmação (deve listar document_kind e folha_emit_kind)
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payslips'
  and column_name in ('document_kind', 'folha_emit_kind')
order by column_name;

select count(*) as total_payslips from public.payslips;
