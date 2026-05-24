/** Novas categorias (importação/heurísticas): Receita, Mercado, Combustível, etc. */

alter table public.transactions drop constraint if exists transactions_category_check;

alter table public.transactions add constraint transactions_category_check
  check (
    category in (
      'Alimentação', 'Transporte', 'Moradia', 'Lazer',
      'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
      'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
      'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
    )
  );

alter table public.transaction_classification_rules
  drop constraint if exists transaction_classification_rules_category_check;

alter table public.transaction_classification_rules
  add constraint transaction_classification_rules_category_check
    check (
      category in (
        'Alimentação', 'Transporte', 'Moradia', 'Lazer',
        'Saúde', 'Educação', 'Salário', 'Freelance', 'Pets', 'Outros',
        'Receita', 'Mercado', 'Combustível', 'Conta de consumo', 'Cartão/Fatura', 'Boleto',
        'Transferência própria', 'Transferência para terceiros', 'Empréstimo'
      )
    );
