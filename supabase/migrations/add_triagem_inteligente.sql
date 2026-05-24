/**
 * Triagem inteligente — respostas do formulário e padrões aprendidos.
 */

create table if not exists public.triagem_respostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo_problema text not null,
  nivel text not null,
  entidade_tipo text not null,
  entidade_id text not null,
  pergunta_id text not null,
  pergunta text not null,
  resposta jsonb not null default '{}'::jsonb,
  resultado jsonb not null default '{}'::jsonb,
  resolvido boolean not null default false,
  remover_pendencia boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists triagem_respostas_user_criado_idx
  on public.triagem_respostas (user_id, criado_em desc);

create index if not exists triagem_respostas_entidade_idx
  on public.triagem_respostas (user_id, entidade_id);

create table if not exists public.triagem_padroes_aprendidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo_problema text not null,
  condicoes jsonb not null default '{}'::jsonb,
  acao_recomendada text not null,
  nivel_confianca numeric not null default 0.5,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists triagem_padroes_user_tipo_idx
  on public.triagem_padroes_aprendidos (user_id, tipo_problema, ativo);

alter table public.triagem_respostas enable row level security;
alter table public.triagem_padroes_aprendidos enable row level security;

create policy "Users manage own triagem respostas"
  on public.triagem_respostas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own triagem padroes"
  on public.triagem_padroes_aprendidos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
