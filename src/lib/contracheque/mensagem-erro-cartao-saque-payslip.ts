/** Mensagem amigável quando colunas `cartao_saque_*` ou RLS impedem gravar no Supabase. */
export function mensagemErroCartaoSaquePayslip(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (
    /could not find the table|schema cache/i.test(mensagem) &&
    /payslips/i.test(mensagem)
  ) {
    return "Tabela payslips inacessível. Verifique a ligação ao Supabase.";
  }
  if (
    /column.*cartao_saque|cartao_saque.*does not exist|schema cache/i.test(m) ||
    /cartao_saque_embutido_detectado/i.test(m)
  ) {
    return "Colunas cartao_saque_* ausentes. Execute no SQL Editor: supabase/patch_payslips_cartao_saque_embutido.sql";
  }
  if (/row-level security|rls|permission denied|42501/i.test(m)) {
    return "Sem permissão para atualizar contracheques (RLS). Confirme que está autenticado.";
  }
  return mensagem.slice(0, 280);
}
