-- =============================================================================
-- ConsigFácil — catálogo oficial de modalidades e instituições
-- =============================================================================
-- Base de referência: HTML "ConsigFácil - Amazonas tipo de financiamento em
-- folha.html" exportado do portal ConsigFácil AM.
--
-- 3 tabelas:
--   consigfacil_modalidades            — 4 modalidades oficiais (catálogo)
--   consigfacil_instituicoes           — 23 instituições oficiais (catálogo)
--   consigfacil_modalidade_instituicao — relação N:N (uma instituição pode
--                                        atuar em várias modalidades)
--
-- Carga inicial (seeds) também aplicada aqui — é idempotente (ON CONFLICT).
-- =============================================================================

create table if not exists public.consigfacil_modalidades (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome_oficial text not null,
  grupo_canonico text not null,
  tipo_margem text,
  eh_emprestimo boolean not null default false,
  eh_cartao boolean not null default false,
  eh_cartao_beneficio boolean not null default false,
  eh_contribuicao boolean not null default false,
  ativo boolean not null default true,
  fonte text not null default 'consigfacil',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consigfacil_instituicoes (
  id uuid primary key default gen_random_uuid(),
  nome_oficial text not null,
  nome_normalizado text unique not null,
  modalidade_slug text references public.consigfacil_modalidades (slug),
  grupo_canonico text,
  ativo boolean not null default true,
  fonte text not null default 'consigfacil',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consigfacil_modalidade_instituicao (
  id uuid primary key default gen_random_uuid(),
  modalidade_slug text not null references public.consigfacil_modalidades (slug),
  instituicao_normalizada text not null references public.consigfacil_instituicoes (nome_normalizado),
  ativo boolean not null default true,
  fonte text not null default 'consigfacil',
  created_at timestamptz not null default now(),
  unique (modalidade_slug, instituicao_normalizada)
);

-- ---------------------------------------------------------------------------
-- ALIASES — variações de escrita que mapeiam para a mesma instituição oficial.
-- (ex.: "BCO PAN", "PAN", "Banco Pan" → "banco pan").
--
-- Usado pelo cache do app (`consigfacil_catalogo_cache.ts`) para resolução
-- fuzzy. A coluna `alias_normalizado` é o lookup-key.
-- ---------------------------------------------------------------------------
create table if not exists public.consigfacil_instituicao_aliases (
  id uuid primary key default gen_random_uuid(),
  instituicao_normalizada text not null references public.consigfacil_instituicoes (nome_normalizado) on delete cascade,
  alias_original text not null,
  alias_normalizado text not null,
  fonte text not null default 'consigfacil',
  created_at timestamptz not null default now(),
  unique (alias_normalizado)
);

create index if not exists consigfacil_instituicao_aliases_inst_idx
  on public.consigfacil_instituicao_aliases (instituicao_normalizada);

-- ---------------------------------------------------------------------------
-- RLS — read-only para usuários autenticados (catálogo público da aplicação).
-- Escrita só via service_role (administração do catálogo).
-- ---------------------------------------------------------------------------
alter table public.consigfacil_modalidades enable row level security;
alter table public.consigfacil_instituicoes enable row level security;
alter table public.consigfacil_modalidade_instituicao enable row level security;
alter table public.consigfacil_instituicao_aliases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consigfacil_modalidades' and policyname = 'read_authenticated'
  ) then
    create policy read_authenticated on public.consigfacil_modalidades
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consigfacil_instituicoes' and policyname = 'read_authenticated'
  ) then
    create policy read_authenticated on public.consigfacil_instituicoes
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consigfacil_modalidade_instituicao' and policyname = 'read_authenticated'
  ) then
    create policy read_authenticated on public.consigfacil_modalidade_instituicao
      for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'consigfacil_instituicao_aliases' and policyname = 'read_authenticated'
  ) then
    create policy read_authenticated on public.consigfacil_instituicao_aliases
      for select to authenticated using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SEEDS — 4 modalidades oficiais
-- ---------------------------------------------------------------------------
insert into public.consigfacil_modalidades
  (slug, nome_oficial, grupo_canonico, tipo_margem, eh_emprestimo, eh_cartao, eh_cartao_beneficio, eh_contribuicao)
values
  ('cartao_beneficio_compra', 'Cartão Benefício Compra', 'cartao_beneficio', 'margem_cartao_beneficio', false, true, true, false),
  ('cartao_credito',          'Cartão de Crédito',       'cartao_credito',   'margem_cartao',           false, true, false, false),
  ('contribuicao',            'Contribuição',            'contribuicao',     null,                      false, false, false, true),
  ('emprestimo_consignado',   'Empréstimo Consignado',   'emprestimo_consignado', 'margem_consignavel', true,  false, false, false)
on conflict (slug) do update
  set nome_oficial = excluded.nome_oficial,
      grupo_canonico = excluded.grupo_canonico,
      tipo_margem = excluded.tipo_margem,
      eh_emprestimo = excluded.eh_emprestimo,
      eh_cartao = excluded.eh_cartao,
      eh_cartao_beneficio = excluded.eh_cartao_beneficio,
      eh_contribuicao = excluded.eh_contribuicao,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- SEEDS — 23 instituições oficiais (com modalidade primária)
-- nome_normalizado = lowercase + sem acentos + colapso de espaços para 1
-- ---------------------------------------------------------------------------
insert into public.consigfacil_instituicoes
  (nome_oficial, nome_normalizado, modalidade_slug, grupo_canonico)
values
  -- Cartão Benefício Compra
  ('AVANCARD',                                            'avancard',                                            'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Banco Genial',                                        'banco genial',                                        'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Banco Pine',                                          'banco pine',                                          'cartao_beneficio_compra', 'cartao_beneficio'),
  ('BCBR Card',                                           'bcbr card',                                           'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Consigap Card',                                       'consigap card',                                       'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Credcesta',                                           'credcesta',                                           'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Eagle Sociedade de Credito Direto',                   'eagle sociedade de credito direto',                   'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Emprestei Card',                                      'emprestei card',                                      'cartao_beneficio_compra', 'cartao_beneficio'),
  ('FY Digital',                                          'fy digital',                                          'cartao_beneficio_compra', 'cartao_beneficio'),
  ('Meucashcard Serviços Tecnológicos e Financeiros',     'meucashcard servicos tecnologicos e financeiros',     'cartao_beneficio_compra', 'cartao_beneficio'),
  ('PEGCARD LTDA',                                        'pegcard ltda',                                        'cartao_beneficio_compra', 'cartao_beneficio'),
  -- Empréstimo Consignado
  ('Banco Bradesco',                                      'banco bradesco',                                      'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco Daycoval',                                      'banco daycoval',                                      'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco de Minas Gerais',                               'banco de minas gerais',                               'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco do Brasil',                                     'banco do brasil',                                     'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco Industrial do Brasil',                          'banco industrial do brasil',                          'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco Pan',                                           'banco pan',                                           'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco Safra',                                         'banco safra',                                         'emprestimo_consignado',   'emprestimo_consignado'),
  ('Banco Santander',                                     'banco santander',                                     'emprestimo_consignado',   'emprestimo_consignado'),
  ('Cooperativo Sicoob',                                  'cooperativo sicoob',                                  'emprestimo_consignado',   'emprestimo_consignado'),
  ('Olé Bonsucesso Consignado',                           'ole bonsucesso consignado',                           'emprestimo_consignado',   'emprestimo_consignado'),
  ('Valor Sociedade de Crédito Direto',                   'valor sociedade de credito direto',                   'emprestimo_consignado',   'emprestimo_consignado'),
  -- Contribuição
  ('Sindicato dos Fisioterapeutas Serv Publ do Amazonas', 'sindicato dos fisioterapeutas serv publ do amazonas', 'contribuicao',            'contribuicao')
on conflict (nome_normalizado) do update
  set nome_oficial = excluded.nome_oficial,
      modalidade_slug = excluded.modalidade_slug,
      grupo_canonico = excluded.grupo_canonico,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Relação N:N — mapeia cada instituição → sua modalidade primária no portal.
-- Hoje só temos 1:1; mas a tabela é N:N para suportar futuras instituições
-- que operem em múltiplas modalidades.
-- ---------------------------------------------------------------------------
insert into public.consigfacil_modalidade_instituicao
  (modalidade_slug, instituicao_normalizada)
select modalidade_slug, nome_normalizado
  from public.consigfacil_instituicoes
  where modalidade_slug is not null
on conflict (modalidade_slug, instituicao_normalizada) do nothing;

-- ---------------------------------------------------------------------------
-- SEED de aliases (variações de escrita observadas em contracheques, extratos
-- e prints do ConsigFácil). Lista pode crescer; cada alias é único.
-- ---------------------------------------------------------------------------
insert into public.consigfacil_instituicao_aliases
  (instituicao_normalizada, alias_original, alias_normalizado)
values
  -- Banco Pan
  ('banco pan',                'BCO PAN',                       'bco pan'),
  ('banco pan',                'PAN',                           'pan'),
  ('banco pan',                'BANCO PAN S.A.',                'banco pan sa'),
  -- Banco Daycoval
  ('banco daycoval',           'DAYCOVAL',                      'daycoval'),
  ('banco daycoval',           'BCO DAYCOVAL',                  'bco daycoval'),
  ('banco daycoval',           'Daycoval Integrador',           'daycoval integrador'),
  -- Banco Bradesco
  ('banco bradesco',           'BRADESCO',                      'bradesco'),
  ('banco bradesco',           'BCO BRADESCO',                  'bco bradesco'),
  -- Banco do Brasil
  ('banco do brasil',          'BB',                            'bb'),
  ('banco do brasil',          'BANCO DO BRASIL S.A.',          'banco do brasil sa'),
  -- Banco Santander
  ('banco santander',          'SANTANDER',                     'santander'),
  ('banco santander',          'BANCO SANTANDER BRASIL',        'banco santander brasil'),
  -- Banco Safra
  ('banco safra',              'SAFRA',                         'safra'),
  -- Banco Industrial do Brasil
  ('banco industrial do brasil','BIB',                          'bib'),
  -- Banco de Minas Gerais
  ('banco de minas gerais',    'BMG',                           'bmg'),
  ('banco de minas gerais',    'BCO BMG',                       'bco bmg'),
  -- Cooperativo Sicoob
  ('cooperativo sicoob',       'SICOOB',                        'sicoob'),
  ('cooperativo sicoob',       'COOP SICOOB',                   'coop sicoob'),
  -- Olé Bonsucesso
  ('ole bonsucesso consignado','OLE CONSIGNADO',                'ole consignado'),
  ('ole bonsucesso consignado','BONSUCESSO',                    'bonsucesso'),
  ('ole bonsucesso consignado','OLE BONSUCESSO',                'ole bonsucesso'),
  -- Banco Pine
  ('banco pine',               'PINE',                          'pine'),
  -- Banco Genial
  ('banco genial',             'GENIAL',                        'genial'),
  -- Credcesta
  ('credcesta',                'CRED CESTA',                    'cred cesta'),
  ('credcesta',                'CRED CESTA CARD',               'cred cesta card'),
  ('credcesta',                'CREDCESTA CARD',                'credcesta card'),
  -- AVANCARD
  ('avancard',                 'AVAN CARD',                     'avan card'),
  -- BCBR Card
  ('bcbr card',                'BCBR',                          'bcbr'),
  -- Consigap Card
  ('consigap card',            'CONSIGAP',                      'consigap'),
  -- Emprestei Card
  ('emprestei card',           'EMPRESTEI',                     'emprestei'),
  -- FY Digital
  ('fy digital',               'FY',                            'fy'),
  ('fy digital',               'FYDIGITAL',                     'fydigital'),
  -- Meucashcard
  ('meucashcard servicos tecnologicos e financeiros', 'MEUCASHCARD', 'meucashcard'),
  ('meucashcard servicos tecnologicos e financeiros', 'MEU CASH CARD', 'meu cash card'),
  -- PEGCARD
  ('pegcard ltda',             'PEGCARD',                       'pegcard'),
  ('pegcard ltda',             'PEG CARD',                      'peg card'),
  -- Eagle SCD
  ('eagle sociedade de credito direto', 'EAGLE SCD',            'eagle scd'),
  ('eagle sociedade de credito direto', 'EAGLE',                'eagle'),
  -- Valor SCD
  ('valor sociedade de credito direto', 'VALOR SCD',            'valor scd'),
  ('valor sociedade de credito direto', 'VALOR S.A.',           'valor sa')
on conflict (alias_normalizado) do nothing;
