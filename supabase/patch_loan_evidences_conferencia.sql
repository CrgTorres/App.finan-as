-- Conferência humana da leitura automática + vínculo opcional sem contrato inferido.
-- Executar no SQL Editor do Supabase (após patch_loan_evidences_leitura_automatica.sql).

alter table public.loan_evidences add column if not exists status_conferencia text
  check (status_conferencia is null or status_conferencia in (
    'pendente',
    'confirmado',
    'ajustado_manual',
    'sem_vinculo',
    'ignorado'
  ));

alter table public.loan_evidences add column if not exists conferencia_realizada_em timestamptz;
alter table public.loan_evidences add column if not exists conferencia_observacao text;

comment on column public.loan_evidences.status_conferencia is 'Resultado da conferência humana sobre OCR / vínculo.';
comment on column public.loan_evidences.conferencia_realizada_em is 'Momento em que o utilizador confirmou, ajustou ou recusou o vínculo.';

-- Permite evidência sem loan_id nem fingerprint quando conferência = sem_vinculo.
alter table public.loan_evidences drop constraint if exists loan_evidences_target_ck;

alter table public.loan_evidences add constraint loan_evidences_target_ck check (
  loan_id is not null
  or (contrato_inferido_fingerprint is not null and length(trim(contrato_inferido_fingerprint)) > 0)
  or (status_conferencia = 'sem_vinculo')
);
