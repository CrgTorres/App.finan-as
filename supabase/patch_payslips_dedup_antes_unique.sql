-- =============================================================================
-- Só use DEPOIS de patch_payslips_completo_ordem_correta.sql (colunas já existem)
-- Ou execute o ficheiro completo acima em vez deste.
-- =============================================================================

alter table public.payslips add column if not exists document_kind text;
alter table public.payslips add column if not exists folha_emit_kind text;

update public.payslips
set folha_emit_kind = 'mensal_principal'
where folha_emit_kind is null;

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

alter table public.payslips drop constraint if exists payslips_user_id_month_year_key;
alter table public.payslips drop constraint if exists payslips_user_month_year_emit_unique;

alter table public.payslips
  add constraint payslips_user_month_year_emit_unique
  unique (user_id, month, year, folha_emit_kind);

select 'ok' as status, count(*) as total_linhas from public.payslips;
