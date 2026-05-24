import {
  cpfSoDigitos,
  formatarCpf11,
  type PerfilTitularApp,
} from "@/lib/contratos/perfil-titular-app";
import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";

function normNome(n: string): string {
  return n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nomesParecidos(a: string, b: string): boolean {
  const na = normNome(a);
  const nb = normNome(b);
  if (na.length < 4 || nb.length < 4) return false;
  if (na === nb) return true;
  const wa = na.split(" ").filter((w) => w.length > 2);
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  const inter = wa.filter((w) => wb.has(w)).length;
  return inter >= Math.min(2, Math.min(wa.length, wb.size));
}

/**
 * Cruza consumidor/atendente do contrato com o titular da sessão (env + folha).
 */
export function alertasTitularContrato(
  extraido: ContratoExtraido,
  titular: PerfilTitularApp | null,
): AlertaPlausibilidadeContrato[] {
  const a: AlertaPlausibilidadeContrato[] = [];
  const cpfCons = cpfSoDigitos(extraido.cpf);
  const cpfAtend = cpfSoDigitos(extraido.atendenteCpf);
  const nomeCons = extraido.cliente?.trim();
  const nomeAtend = extraido.atendenteNome?.trim();

  if (!titular?.cpfDigitos) {
    a.push({
      severidade: "aviso",
      codigo: "titular_sem_referencia",
      mensagem:
        "Sem CPF de referência do titular logado. Defina NEXT_PUBLIC_USER_CPF_DIGITS_FOR_PDF (11 dígitos) em .env.local e/ou importe contracheque para o sistema inferir o titular e detectar contrato de terceiros.",
    });
    return a;
  }

  const cpfRef = titular.cpfDigitos;
  const cpfFmt = formatarCpf11(cpfRef);

  if (cpfCons && cpfCons !== cpfRef) {
    a.push({
      severidade: "critico",
      codigo: "cpf_consumidor_terceiro",
      mensagem: `CPF do consumidor no documento (${extraido.cpf}) é diferente do titular da conta (${cpfFmt}). O contrato pode ser de outra pessoa — não confirme como seu sem validar a secção A do PDF.`,
    });
  }

  if (!cpfCons && cpfAtend === cpfRef) {
    a.push({
      severidade: "critico",
      codigo: "titular_no_campo_atendente",
      mensagem: `O CPF do titular (${cpfFmt}) aparece no campo atendente/correspondente, mas o consumidor (sec. A) não foi lido. Provável troca de papéis no OCR — confira nome e CPF no PDF antes de confirmar.`,
    });
  }

  if (cpfCons === cpfRef) {
    a.push({
      severidade: "aviso",
      codigo: "cpf_consumidor_titular_ok",
      mensagem: `CPF do consumidor coincide com o titular da conta (${cpfFmt}). Indício de que o contrato é seu.`,
    });
    if (!nomeCons && titular.nome) {
      a.push({
        severidade: "aviso",
        codigo: "nome_mutuario_nao_lido_cpf_titular",
        mensagem: `O CPF do mutuário (sec. II) confere com o titular, mas o nome não foi lido no OCR — confira a secção II no PDF ou use o nome do perfil se for você.`,
      });
    }
  }

  if (titular.nome && nomeCons && !nomesParecidos(titular.nome, nomeCons)) {
    a.push({
      severidade: "aviso",
      codigo: "nome_consumidor_diferente_titular",
      mensagem: `Nome do consumidor («${nomeCons}») difere do titular de referência («${titular.nome}»). Pode ser abreviatura ou contrato alheio — confira sec. A.`,
    });
  }

  if (titular.nome && nomeAtend && nomesParecidos(titular.nome, nomeAtend) && cpfCons !== cpfRef) {
    a.push({
      severidade: "critico",
      codigo: "titular_como_atendente",
      mensagem: `O nome do titular parece estar como atendente («${nomeAtend}»), não como consumidor. Risco de inclusão errada ou OCR trocado — revisar antes de gravar.`,
    });
  }

  if (!cpfCons && !cpfAtend && titular.cpfDigitos) {
    a.push({
      severidade: "aviso",
      codigo: "cpf_nao_lido_documento",
      mensagem:
        "Nenhum CPF de consumidor/atendente legível no OCR — não foi possível validar se o contrato é do titular. Reprocesse ou confira o PDF.",
    });
  }

  return a;
}
