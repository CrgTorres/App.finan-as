-- JSON consolidado «Radar do Contrato» (analisarContratoEmprestimo, versão 2).
-- Executar no SQL Editor do Supabase após patch_loan_evidences_analise_juridica.sql.

alter table public.loan_evidences add column if not exists analise_contrato_emprestimo jsonb;

comment on column public.loan_evidences.analise_contrato_emprestimo is
  'Análise consolidada do contrato: score, alertas, cálculos, pendências (versão 2).';
