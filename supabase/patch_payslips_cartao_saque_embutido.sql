-- Card/RMC/RCC/cash-withdrawal detection for payslips (Supabase SQL Editor).

alter table public.payslips add column if not exists cartao_saque_embutido_detectado boolean default false;
alter table public.payslips add column if not exists cartao_saque_tipo text;
alter table public.payslips add column if not exists cartao_saque_risco text
  check (cartao_saque_risco is null or cartao_saque_risco in ('baixo', 'medio', 'alto'));
alter table public.payslips add column if not exists cartao_saque_termos jsonb;
alter table public.payslips add column if not exists cartao_saque_linhas jsonb;
alter table public.payslips add column if not exists cartao_saque_valor_mensal numeric;
alter table public.payslips add column if not exists cartao_saque_banco_possivel text;
alter table public.payslips add column if not exists cartao_saque_observacao text;
alter table public.payslips add column if not exists cartao_saque_status_conferencia text
  check (
    cartao_saque_status_conferencia is null
    or cartao_saque_status_conferencia in (
      'pendente_conferencia',
      'pendente',
      'confirmado',
      'falso_positivo',
      'contrato_localizado',
      'precisa_revisao_juridica',
      'ignorado'
    )
  );
alter table public.payslips add column if not exists cartao_saque_analise_json jsonb;

comment on column public.payslips.cartao_saque_embutido_detectado is 'Screening flag: card/RMC/RCC/cash-withdrawal signal found in the payslip.';
comment on column public.payslips.cartao_saque_analise_json is 'Full detection JSON produced by the application code.';
