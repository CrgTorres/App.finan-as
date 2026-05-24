/** DBs que ainda tinham coluna `source` tipo enum — remover e padronizar rastreio via source_ref / arquivo. */

alter table public.transactions drop constraint if exists transactions_source_check;

alter table public.transactions drop column if exists source;

comment on column public.transactions.source_ref is 'Fingerprints de extrato, NF-e, contracheque:, etc.';
