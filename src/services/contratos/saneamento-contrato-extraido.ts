import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";

/**
 * Remove valores claramente errados do OCR (ex.: Daycoval cola «Somatório das parcelas»
 * no mesmo R$ que seguro/tarifas).
 */
export function aplicarSaneamentoContratoExtraido(
  e: ContratoExtraido,
): { extraido: ContratoExtraido; notas: AlertaPlausibilidadeContrato[] } {
  const notas: AlertaPlausibilidadeContrato[] = [];
  const out: ContratoExtraido = { ...e };

  const principal = Math.max(out.valorFinanciado ?? 0, out.valorSolicitado ?? 0, 0);
  const seg = out.seguro;
  const tar = out.tarifas;

  if (principal > 0) {
    if (
      seg != null &&
      tar != null &&
      Math.abs(seg - tar) < 0.02 &&
      seg > principal * 1.15
    ) {
      delete out.seguro;
      delete out.tarifas;
      notas.push({
        severidade: "aviso",
        codigo: "ocr_seguro_tarifa_somatorio",
        mensagem:
          "Seguro e tarifas iguais e muito acima do valor do crédito — típico de OCR que leu o «Somatório das parcelas» (sec. D). Valores foram removidos; confira o PDF.",
      });
    } else {
      if (seg != null && seg > principal * 0.42) {
        delete out.seguro;
        notas.push({
          severidade: "critico",
          codigo: "seguro_vs_principal",
          mensagem: `Seguro (${seg.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) é implausível frente ao crédito (~${principal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Removido — acessório costuma ser pequeno vs principal (CDC).`,
        });
      }
      if (tar != null && tar > principal * 0.42) {
        delete out.tarifas;
        notas.push({
          severidade: "critico",
          codigo: "tarifas_vs_principal",
          mensagem:
            "Tarifas muito altas vs valor do crédito — possível leitura de total de parcelas ou outra linha. Valor removido.",
        });
      }
    }
  }

  const iofEsperadoMax = principal > 0 ? principal * 0.12 : Infinity;
  if (out.iof != null && principal > 0 && out.iof > iofEsperadoMax) {
    notas.push({
      severidade: "aviso",
      codigo: "iof_alto",
      mensagem:
        "IOF parece alto vs principal — conferir com tabela oficial (Lei 8.894/94 / normas vigentes) ou erro de OCR.",
    });
  }

  return { extraido: out, notas };
}
