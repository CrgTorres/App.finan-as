export const ANALISE_DASHBOARD_ABAS = [
  "diagnostico",
  "emprestimos",
  "consolidacao",
  "pendencias",
  "evidencias",
  "juridico",
] as const;

export type AnaliseDashboardAbaId = (typeof ANALISE_DASHBOARD_ABAS)[number];
