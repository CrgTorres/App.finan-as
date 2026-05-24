-- RLS em `loans` (sincronização após confirmar contrato na página «Contrato empréstimo»).
-- Execute se o UPDATE ao cadastro falhar silenciosamente ou com erro de permissão.

alter table public.loans enable row level security;

drop policy if exists "Users can select own loans" on public.loans;
create policy "Users can select own loans"
  on public.loans for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own loans" on public.loans;
create policy "Users can insert own loans"
  on public.loans for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own loans" on public.loans;
create policy "Users can update own loans"
  on public.loans for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own loans" on public.loans;
create policy "Users can delete own loans"
  on public.loans for delete
  to authenticated
  using (auth.uid() = user_id);
