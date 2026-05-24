-- Análise jurídico-financeira automática ao anexar contrato (executar no SQL Editor do Supabase).

alter table public.loan_evidences add column if not exists analise_juridica_financeira jsonb;
alter table public.loan_evidences add column if not exists analise_juridica_status text
  check (
    analise_juridica_status is null
    or analise_juridica_status in ('sem_alerta', 'atencao', 'alto_risco', 'revisao_juridica')
  );
alter table public.loan_evidences add column if not exists analise_juridica_conferencia text
  check (
    analise_juridica_conferencia is null
    or analise_juridica_conferencia in (
      'pendente',
      'conferido',
      'ignorado',
      'contrato_anterior_localizado',
      'possivel_refinanciamento',
      'acao_revisao_sugerida'
    )
  );
alter table public.loan_evidences add column if not exists analise_juridica_observacao text;

comment on column public.loan_evidences.analise_juridica_financeira is 'JSON da triagem: indicadores, alertas, recomendações (versão 1).';
comment on column public.loan_evidences.analise_juridica_status is 'Classificação automática: sem_alerta | atencao | alto_risco | revisao_juridica.';
comment on column public.loan_evidences.analise_juridica_conferencia is 'Marcação manual do utilizador sobre o diagnóstico.';
comment on column public.loan_evidences.analise_juridica_observacao is 'Nota livre sobre a análise jurídico-financeira.';
