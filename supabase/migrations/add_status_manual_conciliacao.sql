/**
 * Sobrescrita manual do usuário sobre uma linha da `Base_Conciliada`.
 *
 * - Uma linha por (user_id, evento_id) — chave composta.
 * - `evento_id` é o ID lógico do evento gerado por `buildBaseConciliada` (não FK).
 *   Ex.: "transacao:<uuid>", "contracheque:<payslipId>:<idx>", "contrato:<loanId>".
 * - `status` espelha `StatusManualUsuario` (mantém em sincronia caso adicione novos
 *   valores no enum do app — o CHECK abaixo é a fonte da verdade no banco).
 */
create table if not exists public.status_manual_conciliacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  evento_id text not null,
  status text not null check (
    status in (
      'salario',
      'emprestimo_pessoal',
      'transferencia_propria',
      'pix_recebido',
      'pagamento_emprestimo',
      'duplicidade_contracheque',
      'ignorar',
      'precisa_contrato',
      'contrato_localizado'
    )
  ),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists status_manual_conciliacao_user_evento_uidx
  on public.status_manual_conciliacao (user_id, evento_id);

create index if not exists status_manual_conciliacao_user_idx
  on public.status_manual_conciliacao (user_id, updated_at desc);

alter table public.status_manual_conciliacao enable row level security;

create policy "Users manage own conciliacao status"
  on public.status_manual_conciliacao
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
