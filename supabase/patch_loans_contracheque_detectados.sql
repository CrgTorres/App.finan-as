-- Campos extras para cadastro automático a partir da análise de contracheque (`emprestimosPorContrato`).
-- Rode no SQL Editor do Supabase se ainda não existirem na sua tabela `public.loans`.

alter table public.loans add column if not exists rubrica_code text;
alter table public.loans add column if not exists institution_name text;
alter table public.loans add column if not exists parcela_inicial_detectada integer;
alter table public.loans add column if not exists parcela_final_detectada integer;
alter table public.loans add column if not exists primeira_aparicao text;
alter table public.loans add column if not exists ultima_aparicao text;
alter table public.loans add column if not exists quantidade_aparicoes integer;
alter table public.loans add column if not exists total_pago_detectado numeric(12, 2);
alter table public.loans add column if not exists tipo_contrato text;
alter table public.loans add column if not exists origem text default 'manual';
alter table public.loans add column if not exists status_analise_contracheque text;
