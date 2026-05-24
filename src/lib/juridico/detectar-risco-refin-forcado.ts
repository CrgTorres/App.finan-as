/**
 * Detecta padrão de refinanciamento induzido / rolagem consignada:
 *
 *   suspensão → inadimplência → quebra de desconto → nova proposta →
 *   novo contrato → parcela menor → prazo maior
 */

import type { ConsigfacilContrato, ConsigfacilRefinanciamento } from "@/types/consigfacil";
import {
  type EventoOperacionalConsignado,
  chaveBanco,
} from "@/lib/consigfacil/detectar-eventos-operacionais";
import { resolverInstituicaoOficial } from "@/lib/consignacoes-governo/consigfacil-catalogo";

function diasEntre(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs((tb - ta) / 86_400_000);
}

export type EtapaRiscoRefinForcado =
  | "suspensao"
  | "inadimplencia"
  | "quebra_desconto"
  | "bloqueio"
  | "novo_contrato"
  | "parcela_menor"
  | "prazo_maior"
  | "refin_detectado";

export type RiscoRefinForcado = {
  nivel: "baixo" | "medio" | "alto" | "critico";
  score: number;
  banco: string;
  contrato_origem: string | null;
  contrato_destino: string | null;
  etapas: EtapaRiscoRefinForcado[];
  sequencia_texto: string;
  evidencias: string[];
  recomendacao: string;
  /** Quando true, refin automático deve ser bloqueado por justificativa operacional. */
  justificativa_operacional_presente: boolean;
};

export type EntradaDetectarRiscoRefinForcado = {
  contratos: ConsigfacilContrato[];
  eventosOperacionais: EventoOperacionalConsignado[];
  refinanciamentos?: ConsigfacilRefinanciamento[];
  /** Janela máxima (dias) entre contrato antigo e novo no mesmo banco. */
  janelaDias?: number;
};

const PESO_ETAPA: Record<EtapaRiscoRefinForcado, number> = {
  suspensao: 18,
  inadimplencia: 16,
  quebra_desconto: 14,
  bloqueio: 14,
  novo_contrato: 12,
  parcela_menor: 10,
  prazo_maior: 10,
  refin_detectado: 16,
};

function eventosDoContrato(
  eventos: EventoOperacionalConsignado[],
  c: ConsigfacilContrato,
): EventoOperacionalConsignado[] {
  const cod = c.codigo_instituicao ?? c.id_consignacao;
  const bk = chaveBanco(c.instituicao);
  return eventos.filter(
    (e) =>
      e.contrato === cod ||
      e.contrato === c.id_consignacao ||
      (e.banco != null && chaveBanco(e.banco) === bk),
  );
}

function temEtapa(
  evs: EventoOperacionalConsignado[],
  tipos: EventoOperacionalConsignado["tipo"][],
): boolean {
  return evs.some((e) => tipos.includes(e.tipo));
}

export function detectarRiscoRefinForcado(
  input: EntradaDetectarRiscoRefinForcado,
): RiscoRefinForcado[] {
  const janela = input.janelaDias ?? 180;
  const porBanco = new Map<string, ConsigfacilContrato[]>();

  for (const c of input.contratos) {
    if (c.eh_cartao_beneficio) continue;
    const k = chaveBanco(c.instituicao);
    const arr = porBanco.get(k) ?? [];
    arr.push(c);
    porBanco.set(k, arr);
  }

  const riscos: RiscoRefinForcado[] = [];

  for (const [bancoKey, lista] of porBanco) {
    if (lista.length < 2) continue;

    const ord = lista.slice().sort((a, b) => a.data_contrato.localeCompare(b.data_contrato));

    for (let i = 0; i < ord.length - 1; i++) {
      for (let j = i + 1; j < ord.length; j++) {
        const antigo = ord[i];
        const novo = ord[j];
        const dias = diasEntre(antigo.data_contrato, novo.data_contrato);
        if (dias > janela) continue;

        const evAntigo = eventosDoContrato(input.eventosOperacionais, antigo);
        const evNovo = eventosDoContrato(input.eventosOperacionais, novo);
        const evs = [...evAntigo, ...evNovo];

        const etapas: EtapaRiscoRefinForcado[] = [];
        const evidencias: string[] = [];

        if (temEtapa(evAntigo, ["suspensao"]) || antigo.status === "suspenso") {
          etapas.push("suspensao");
          evidencias.push(`Suspensão operacional no contrato ${antigo.codigo_instituicao ?? antigo.id_consignacao}.`);
        }
        if (temEtapa(evAntigo, ["inadimplencia"])) {
          etapas.push("inadimplencia");
          evidencias.push("Inadimplência consignada registrada antes do novo contrato.");
        }
        if (
          temEtapa(evAntigo, ["bloqueio", "desconto_nao_processado", "quebra_temporaria"])
        ) {
          etapas.push("quebra_desconto");
          evidencias.push("Quebra de desconto em folha (bloqueio / não processado).");
        }
        if (temEtapa(evAntigo, ["bloqueio"])) {
          etapas.push("bloqueio");
        }

        etapas.push("novo_contrato");
        evidencias.push(
          `Novo contrato ${novo.codigo_instituicao ?? novo.id_consignacao} a ${Math.round(dias)} dias do anterior.`,
        );

        if (
          antigo.valor_parcela > 0 &&
          novo.valor_parcela > 0 &&
          novo.valor_parcela < antigo.valor_parcela * 0.98
        ) {
          etapas.push("parcela_menor");
          evidencias.push(
            `Parcela reduziu: R$ ${antigo.valor_parcela.toFixed(2)} → R$ ${novo.valor_parcela.toFixed(2)}.`,
          );
        }

        if (novo.parcelas_total > antigo.parcelas_total + 6) {
          etapas.push("prazo_maior");
          evidencias.push(
            `Prazo alongado: ${antigo.parcelas_total} → ${novo.parcelas_total} parcelas.`,
          );
        }

        const refinPar = input.refinanciamentos?.find(
          (r) =>
            r.contrato_origem === antigo.id_consignacao &&
            r.contrato_destino === novo.id_consignacao,
        );
        if (refinPar) {
          etapas.push("refin_detectado");
          evidencias.push(
            `Refinanciamento automático detectado (${refinPar.tipo_refinanciamento}, confiança ${refinPar.grau_confianca}).`,
          );
        }

        const etapasUnicas = [...new Set(etapas)];
        if (etapasUnicas.length < 3) continue;

        let score = 0;
        for (const e of etapasUnicas) {
          score += PESO_ETAPA[e] ?? 0;
        }
        score = Math.min(100, score);

        const justificativaOperacional = evs.some((e) => e.remover_falso_positivo_refin);
        if (justificativaOperacional && !etapasUnicas.includes("refin_detectado")) {
          score = Math.max(score, 55);
        }

        const nivel: RiscoRefinForcado["nivel"] =
          score >= 75
            ? "critico"
            : score >= 55
              ? "alto"
              : score >= 35
                ? "medio"
                : "baixo";

        const banco =
          resolverInstituicaoOficial(novo.instituicao)?.nome_normalizado ?? novo.instituicao;

        const sequencia_texto = etapasUnicas
          .map((e) => {
            switch (e) {
              case "suspensao":
                return "suspensão";
              case "inadimplencia":
                return "inadimplência";
              case "quebra_desconto":
                return "quebra de desconto";
              case "bloqueio":
                return "bloqueio";
              case "novo_contrato":
                return "novo contrato";
              case "parcela_menor":
                return "parcela menor";
              case "prazo_maior":
                return "prazo maior";
              case "refin_detectado":
                return "refin detectado";
              default:
                return e;
            }
          })
          .join(" → ");

        riscos.push({
          nivel,
          score,
          banco,
          contrato_origem: antigo.codigo_instituicao ?? antigo.id_consignacao,
          contrato_destino: novo.codigo_instituicao ?? novo.id_consignacao,
          etapas: etapasUnicas,
          sequencia_texto,
          evidencias,
          justificativa_operacional_presente: justificativaOperacional,
          recomendacao:
            nivel === "critico" || nivel === "alto"
              ? "Conferir indício de refinanciamento induzido: suspensão/quebra oficial seguida de novo contrato com parcela menor e prazo maior. Preservar trilha operacional do ConsigFácil e folha antes de concluir refin."
              : "Monitorar sequência operacional; documentar justificativas de suspensão/bloqueio antes de inferir refin.",
        });
      }
    }
  }

  return riscos.sort((a, b) => b.score - a.score);
}
