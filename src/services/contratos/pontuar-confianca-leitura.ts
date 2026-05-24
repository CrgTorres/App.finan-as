import type { ContratoExtraido, NivelConfiancaLeitura } from "@/types/contrato-extraido";

/**
 * Critérios pedidos: banco, parcela, CPF, quantidade de parcelas, valor (qualquer valor central).
 */
export function pontuarConfiancaLeitura(extraido: ContratoExtraido): {
  score: number;
  nivel: NivelConfiancaLeitura;
} {
  let s = 0;
  if (extraido.banco?.trim()) s += 20;
  if (extraido.parcela != null && extraido.parcela > 0) s += 20;
  if (extraido.cpf?.trim()) s += 20;
  if (extraido.parcelas != null && extraido.parcelas > 0) s += 20;
  if (
    extraido.valorSolicitado != null ||
    extraido.valorFinanciado != null ||
    extraido.valorTotalPago != null
  ) {
    s += 20;
  }

  const alertas = extraido.alertasPlausibilidade ?? [];
  for (const al of alertas) {
    if (al.severidade === "critico") s -= 18;
    else s -= 6;
  }
  s = Math.max(0, Math.min(100, s));

  const nivel: NivelConfiancaLeitura = s >= 80 ? "alta" : s >= 50 ? "media" : "baixa";
  return { score: s, nivel };
}

export const CHAVES_CONTRATO_EXTRAIDO_PARA_UI: (keyof ContratoExtraido)[] = [
  "banco",
  "cnpj",
  "cliente",
  "cpf",
  "parcela",
  "parcelas",
  "valorSolicitado",
  "valorFinanciado",
  "valorTotalPago",
  "cetAnual",
  "cetMensal",
  "jurosMensal",
  "jurosAnual",
  "iof",
  "dataDocumento",
  "dataContratacao",
  "dataAssinatura",
  "ultimoVencimento",
  "localContratacao",
  "atendenteNome",
  "atendenteCpf",
  "atendenteMatricula",
  "primeiroVencimento",
  "numeroProposta",
  "tipoContrato",
  "refinanciamento",
  "portabilidade",
  "seguro",
  "seguroPrestamistaMencionado",
  "tarifas",
];

export function listarCamposContratoExtraidoAusentes(e: ContratoExtraido): (keyof ContratoExtraido)[] {
  return CHAVES_CONTRATO_EXTRAIDO_PARA_UI.filter((k) => {
    const v = e[k];
    return v === undefined || v === null || (typeof v === "string" && !String(v).trim());
  });
}
