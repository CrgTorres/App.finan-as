# FinançaHub

App de gestão financeira pessoal construído com Next.js 16, Supabase e shadcn/ui.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** (PostgreSQL + Auth + Row Level Security)
- **shadcn/ui** (Base UI) + Tailwind CSS
- **Recharts** para gráficos
- Deploy na **Vercel**

## Funcionalidades

- Autenticação com e-mail e senha (Supabase Auth)
- CRUD completo de transações (receitas e despesas)
- Categorias pré-definidas com cores
- Dashboard com cards de resumo e gráficos de pizza por categoria
- Filtros por mês, ano e categoria
- Busca por descrição
- Exportação em CSV
- Interface responsiva (desktop e mobile)

## Setup

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Acesse **SQL Editor** e execute o arquivo `supabase/schema.sql`
3. Copie a **Project URL** e a **anon key** em **Project Settings → API**

### 2. Variáveis de ambiente

Renomeie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 3. Rodar localmente

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### 4. Deploy na Vercel

1. Importe o repositório na Vercel
2. Adicione as variáveis de ambiente
3. Deploy automático a cada push

## Estrutura

```
src/
├── app/
│   ├── (auth)/          # login e register
│   ├── dashboard/       # dashboard e transações
│   └── page.tsx         # landing page
├── components/
│   ├── dashboard/       # cards, gráfico, recentes
│   ├── layout/          # sidebar, mobile nav
│   └── transactions/    # form, tabela, filtros
├── lib/
│   ├── supabase/        # client e server
│   ├── constants.ts     # categorias, meses, cores
│   └── utils/           # format, csv
├── types/               # Transaction, Category, etc.
└── proxy.ts             # proteção de rotas
supabase/
└── schema.sql           # DDL + RLS policies
```
