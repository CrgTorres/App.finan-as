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

1. **Importar o projeto** em [vercel.com](https://vercel.com) (GitHub/GitLab/Bitbucket).

2. **Root Directory**  
   Se este app está numa subpasta do monorepo (ex.: `financa-pessoal`), configure em **Settings → General → Root Directory** para essa pasta. Assim o build usa o `package-lock.json` correto.

3. **Variáveis de ambiente** (Production / Preview / Development, conforme precisar):

   | Nome | Valor |
   |------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (Settings → API → Project URL) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave **anon** **public** (nunca use service_role no frontend) |

   Opcional: `NEXT_PUBLIC_SITE_URL` = URL da Vercel (ex. `https://meu-app.vercel.app`) para consistência em redirects.

4. **Supabase Auth → URLs**  
   Em **Authentication → URL Configuration**, adicione em **Redirect URLs** (e **Site URL** em produção):

   - `https://SEU-DOMINIO.vercel.app/**`
   - `http://localhost:3000/**` (para testes locais)

5. Faça **Redeploy** após alterar variáveis.

**Node.js:** o `package.json` define `engines.node >= 20.9.0`; a Vercel usa Node 20+ por padrão nas builds recentes.

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
└── proxy.ts             # middleware Next.js 16 — auth Supabase e rotas protegidas
supabase/
└── schema.sql           # DDL + RLS policies
```
