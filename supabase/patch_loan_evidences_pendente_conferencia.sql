-- Status «pendente_conferencia» após upload automático de contrato (Radar do Contrato).
-- Executar no SQL Editor do Supabase (após patch_loan_evidences_conferencia.sql).

alter table public.loan_evidences drop constraint if exists loan_evidences_status_conferencia_check;

alter table public.loan_evidences add constraint loan_evidences_status_conferencia_check check (
  status_conferencia is null
  or status_conferencia in (
    'pendente',
    'pendente_conferencia',
    'confirmado',
    'ajustado_manual',
    'sem_vinculo',
    'ignorado'
  )
);

comment on column public.loan_evidences.status_conferencia is
  'Conferência humana: pendente_conferencia = aguarda revisão após OCR/análise automática.';

-- Permite evidência só com status pendente_conferencia (sem loan_id ainda).
alter table public.loan_evidences drop constraint if exists loan_evidences_target_ck;

alter table public.loan_evidences add constraint loan_evidences_target_ck check (
  loan_id is not null
  or (
    contrato_inferido_fingerprint is not null
    and length(trim(contrato_inferido_fingerprint)) > 0
  )
  or status_conferencia in ('sem_vinculo', 'pendente_conferencia')
);
