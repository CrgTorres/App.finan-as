/**
 * Snapshots e contratos importados do portal ConsigFácil (Governo do AM).
 *
 * Modelagem:
 *  - `consigfacil_snapshots`: uma linha por captura (print/HTML/PDF). Guarda o
 *    bruto + metadados para reprocessamento futuro.
 *  - `consigfacil_contratos`: contratos extraídos, deduplicados por
 *    (`user_id`, `id_consignacao`). Sempre que um novo snapshot é processado
 *    a entrada é UPSERT — a captura mais recente vence.
 *  - `consigfacil_margens`: snapshot de margem por competência e tipo.
 *  - `consigfacil_cartoes`, `consigfacil_historico`, `consigfacil_refinanciamentos`:
 *    abas auxiliares para Power BI / auditoria.
 *
 * Caso a migration NÃO esteja aplicada, o app continua funcionando via
 * fallback localStorage (lib `consigfacil-service`).
 */

create table if not exists public.consigfacil_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  documento_origem text not null,
  origem text not null check (
    origem in (
      'consigfacil_html',
      'consigfacil_print',
      'consigfacil_pdf_ocr',
      'consigfacil_api',
      'manual'
    )
  ),
  capturado_em timestamptz not null default now(),
  bruto text not null,
  avisos text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists consigfacil_snapshots_user_idx
  on public.consigfacil_snapshots (user_id, capturado_em desc);

alter table public.consigfacil_snapshots enable row level security;
create policy "Users manage own consigfacil snapshots"
  on public.consigfacil_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Contratos canônicos
create table if not exists public.consigfacil_contratos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id uuid references public.consigfacil_snapshots (id) on delete set null,
  id_consignacao text not null,
  instituicao text not null,
  codigo_instituicao text,
  data_contrato date not null,
  competencia text not null,
  valor_parcela numeric(18,2) not null default 0,
  parcela_atual integer not null default 0,
  parcelas_total integer not null default 0,
  tipo_margem text not null,
  status text not null,
  averbado_por text,
  origem text not null,
  situacao_importacao text,
  eh_cartao boolean not null default false,
  eh_rmc boolean not null default false,
  eh_rcc boolean not null default false,
  eh_cartao_beneficio boolean not null default false,
  eh_refinanciamento boolean not null default false,
  modalidade_slug text,
  grupo_canonico text,
  modalidade_original text,
  instituicao_original text,
  instituicao_oficial text,
  classificacao_anterior text,
  divergencia_classificacao boolean not null default false,
  contrato_substituido text,
  confianca numeric(4,2) not null default 0,
  observacao text,
  texto_bruto text,
  loan_id uuid references public.loans (id) on delete set null,
  fonte_principal text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists consigfacil_contratos_user_id_consignacao_uidx
  on public.consigfacil_contratos (user_id, id_consignacao);

create index if not exists consigfacil_contratos_user_idx
  on public.consigfacil_contratos (user_id, updated_at desc);

alter table public.consigfacil_contratos enable row level security;
create policy "Users manage own consigfacil contratos"
  on public.consigfacil_contratos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Margem por competência/tipo
create table if not exists public.consigfacil_margens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id uuid references public.consigfacil_snapshots (id) on delete set null,
  competencia text not null,
  tipo_margem text not null,
  margem_total numeric(18,2) not null default 0,
  margem_utilizada numeric(18,2) not null default 0,
  margem_disponivel numeric(18,2) not null default 0,
  percentual_comprometido numeric(5,2) not null default 0,
  documento_origem text not null,
  capturado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists consigfacil_margens_user_competencia_tipo_uidx
  on public.consigfacil_margens (user_id, competencia, tipo_margem);

alter table public.consigfacil_margens enable row level security;
create policy "Users manage own consigfacil margens"
  on public.consigfacil_margens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cartões
create table if not exists public.consigfacil_cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id uuid references public.consigfacil_snapshots (id) on delete set null,
  id_consignacao text not null,
  tipo_cartao text not null,
  consignataria text not null,
  valor_mensal numeric(18,2) not null default 0,
  parcelas_total integer,
  parcela_atual integer,
  competencia_inicio text,
  situacao text not null,
  documento_origem text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists consigfacil_cartoes_user_id_consignacao_uidx
  on public.consigfacil_cartoes (user_id, id_consignacao);

alter table public.consigfacil_cartoes enable row level security;
create policy "Users manage own consigfacil cartoes"
  on public.consigfacil_cartoes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Histórico
create table if not exists public.consigfacil_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id uuid references public.consigfacil_snapshots (id) on delete set null,
  id_consignacao text not null,
  competencia text not null,
  evento text not null,
  detalhe text,
  documento_origem text not null,
  capturado_em timestamptz not null default now()
);

create index if not exists consigfacil_historico_user_idx
  on public.consigfacil_historico (user_id, capturado_em desc);

alter table public.consigfacil_historico enable row level security;
create policy "Users manage own consigfacil historico"
  on public.consigfacil_historico
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Refinanciamentos detectados
create table if not exists public.consigfacil_refinanciamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contrato_origem text not null,
  contrato_destino text not null,
  banco text not null,
  distancia_dias integer not null default 0,
  tipo_refinanciamento text not null,
  evidencias_refinanciamento text[] not null default '{}',
  grau_confianca numeric(4,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists consigfacil_refinanciamentos_user_par_uidx
  on public.consigfacil_refinanciamentos (user_id, contrato_origem, contrato_destino);

alter table public.consigfacil_refinanciamentos enable row level security;
create policy "Users manage own consigfacil refinanciamentos"
  on public.consigfacil_refinanciamentos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
