import { adicionarMesesIso } from "@/lib/contratos/datas-texto-br";
import { cpfSoDigitos, type PerfilTitularApp } from "@/lib/contratos/perfil-titular-app";
import type { ContratoExtraido } from "@/types/contrato-extraido";

function nomePareceAtendente(nomeTitular: string, atendente?: string | null): boolean {
  if (!atendente?.trim()) return false;
  const t = nomeTitular.trim().toLowerCase();
  const a = atendente.trim().toLowerCase();
  if (t === a) return true;
  const prim = t.split(/\s+/)[0];
  return prim.length > 2 && a.startsWith(prim);
}

/** Completa campos derivados após extração + convergência de datas (sem duplicar vencimento como documento). */
export function enriquecerContratoExtraido(
  extraido: ContratoExtraido,
  titular?: PerfilTitularApp | null,
): ContratoExtraido {
  const out: ContratoExtraido = { ...extraido };

  if (!out.cliente?.trim() && titular?.nome?.trim() && titular.cpfDigitos) {
    const cpfCons = cpfSoDigitos(out.cpf);
    if (cpfCons === titular.cpfDigitos && !nomePareceAtendente(titular.nome, out.atendenteNome)) {
      out.cliente = titular.nome.trim();
    }
  }

  if (
    !out.ultimoVencimento &&
    out.primeiroVencimento?.match(/^\d{4}-\d{2}-\d{2}/) &&
    out.parcelas != null &&
    out.parcelas > 0
  ) {
    out.ultimoVencimento = adicionarMesesIso(out.primeiroVencimento, Math.round(out.parcelas) - 1);
  }

  if (
    !out.dataContratacao &&
    out.dataDocumento &&
    out.dataDocumento !== out.primeiroVencimento
  ) {
    out.dataContratacao = out.dataDocumento;
  }

  if (
    !out.dataAssinatura &&
    out.dataDocumento &&
    out.dataDocumento !== out.primeiroVencimento
  ) {
    out.dataAssinatura = out.dataDocumento;
  }

  return out;
}
