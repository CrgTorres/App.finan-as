-- Create transactions table
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  date date not null,
  type text not null check (type in ('receita', 'despesa')),
  category text not null check (
    category in (
      'Alimentação', 'Transporte', 'Moradia', 'Lazer',
      'Saúde', 'Educação', 'Salário', 'Freelance', 'Outros'
    )
  ),
  created_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table public.transactions enable row level security;

-- Policies: users can only access their own transactions
create policy "Users can select own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Index for performance on date filters
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc);
