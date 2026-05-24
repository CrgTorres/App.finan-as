-- Extensão auditável: OCR bruto + JSON extraído + sugestões de vínculo (executar no SQL Editor do Supabase).
-- Não altera políticas existentes; apenas colunas opcionais em public.loan_evidences.

alter table public.loan_evidences add column if not exists ocr_texto_bruto text;
alter table public.loan_evidences add column if not exists contrato_extraido jsonb;
alter table public.loan_evidences add column if not exists leitura_confianca_nivel text
  check (leitura_confianca_nivel is null or leitura_confianca_nivel in ('alta', 'media', 'baixa'));
alter table public.loan_evidences add column if not exists leitura_confianca_score integer;
alter table public.loan_evidences add column if not exists vinculo_sugestoes jsonb;
alter table public.loan_evidences add column if not exists leitura_processada_em timestamptz;

comment on column public.loan_evidences.ocr_texto_bruto is 'Texto bruto do OCR (não substitui o ficheiro original no Storage).';
comment on column public.loan_evidences.contrato_extraido is 'Campos inferidos heuristicamente (JSON).';
comment on column public.loan_evidences.vinculo_sugestoes is 'Sugestões de vínculo a contratos inferidos na análise.';
