import type {
  ConsigfacilContrato,
  ConsigfacilRefinanciamento,
} from "@/types/consigfacil";
import {
  CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  type ConfigAuditoriaConsigfacil,
} from "@/lib/consignacoes-governo/config-auditoria-consigfacil";
import { temIndicacaoOficialRefinanciamento } from "@/lib/consignacoes-governo/auditoria-contratos-unicos";
import {
  contratoTemJustificativaOperacional,
  type EventoOperacionalConsignado,
} from "@/lib/consigfacil/detectar-eventos-operacionais";
import { contratosDistintosMesmoBanco } from "@/lib/contratos/vinculacao-contextual-contratos";
import { permiteRefinanciamentoEstrutural } from "@/lib/contratos/classificar-estrutura-contrato";

/** Distância máxima em dias para considerar dois contratos no mesmo banco como refin. */
const JANELA_REFIN_DIAS = 90;
/** Diferença mínima de parcelas (novo > antigo) para soar "novo crédito". */
const DELTA_PARCELAS_NOVO = 6;

function diasEntre(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs((tb - ta) / 86_400_000);
}

function chaveBanco(c: ConsigfacilContrato): string {
  return c.instituicao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bs\/?a\b/g, "")
    .replace(/\bs\.a\.?\b/g, "")
    .replace(/\bbanco\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type IndicioRefin = {
  codigo: string;
  forte: boolean;
  evidencia: string;
};

/**
 * Detecta refinanciamentos com regra RÍGIDA:
 * - ≥ `minimo_indicios` indícios (padrão 3);
 * - ≥ 1 indício FORTE (oficial) quando `exigir_indicio_oficial`;
 * - mesmo banco + data próxima + parcela parecida NÃO bastam sozinhos.
 */
export function detectarRefinanciamentosConsigfacil(
  contratos: ConsigfacilContrato[],
  config: ConfigAuditoriaConsigfacil = CONFIG_AUDITORIA_CONSIGFACIL_PADRAO,
  eventosOperacionais: EventoOperacionalConsignado[] = [],
): ConsigfacilRefinanciamento[] {
  const porBanco = new Map<string, ConsigfacilContrato[]>();
  for (const c of contratos) {
    const k = chaveBanco(c);
    const arr = porBanco.get(k) ?? [];
    arr.push(c);
    porBanco.set(k, arr);
  }
  const refs: ConsigfacilRefinanciamento[] = [];

  for (const [, lista] of porBanco) {
    if (lista.length < 2) continue;
    const ord = lista
      .slice()
      .sort((a, b) => a.data_contrato.localeCompare(b.data_contrato));
    for (let i = 0; i < ord.length; i++) {
      for (let j = i + 1; j < ord.length; j++) {
        const antigo = ord[i];
        const novo = ord[j];

        if (antigo.tipo_margem !== novo.tipo_margem) continue;

        const justificativaOperacionalAntigo = contratoTemJustificativaOperacional(
          eventosOperacionais,
          antigo,
        );
        if (justificativaOperacionalAntigo) {
          continue;
        }

        if (contratosDistintosMesmoBanco(antigo, novo)) {
          continue;
        }

        const vinculo = permiteRefinanciamentoEstrutural(antigo, novo);
        if (!vinculo.ok) {
          continue;
        }

        const dias = diasEntre(antigo.data_contrato, novo.data_contrato);
        const indicios: IndicioRefin[] = [];

        // ---- INDÍCIOS FORTES (oficiais) --------------------------------
        const antigoEncerrante =
          antigo.status === "quitado" ||
          antigo.status === "substituido" ||
          antigo.status === "refinanciado" ||
          (antigo.status === "suspenso" && !justificativaOperacionalAntigo);
        if (antigoEncerrante) {
          indicios.push({
            codigo: `antigo_status_${antigo.status}`,
            forte: true,
            evidencia: `Contrato anterior com status oficial ${antigo.status}.`,
          });
        }

        if (novo.contrato_substituido || antigo.contrato_substituido) {
          indicios.push({
            codigo: "vinculo_substituicao_oficial",
            forte: true,
            evidencia: "Vínculo oficial de substituição entre contratos.",
          });
        }

        if (temIndicacaoOficialRefinanciamento(novo) || temIndicacaoOficialRefinanciamento(antigo)) {
          indicios.push({
            codigo: "indicacao_textual_oficial",
            forte: true,
            evidencia: "Indicação textual oficial de refinanciamento/portabilidade.",
          });
        }

        const antigoQuaseQuitado =
          antigo.parcelas_total > 0 &&
          (antigo.parcela_atual ?? 0) >= antigo.parcelas_total * 0.95;
        const novoIniciando = (novo.parcela_atual ?? 0) <= 2;
        if (
          antigoQuaseQuitado &&
          novoIniciando &&
          (antigo.status === "quitado" || antigo.status === "substituido" || antigoEncerrante)
        ) {
          indicios.push({
            codigo: "substitutivo_oficial",
            forte: true,
            evidencia:
              "Contrato anterior encerrado/quase quitado e novo reiniciando parcelas (padrão substitutivo).",
          });
        }

        // ---- INDÍCIOS FRACOS (nunca bastam sozinhos) -------------------
        if (dias <= JANELA_REFIN_DIAS) {
          indicios.push({
            codigo: `datas_proximas_${Math.round(dias)}d`,
            forte: false,
            evidencia: `Datas próximas (${Math.round(dias)} dias) — indício fraco.`,
          });
        }

        const parcelaReiniciada =
          novo.parcela_atual === 1 || novo.parcela_atual === 0 || novo.parcela_atual == null;
        if (parcelaReiniciada) {
          indicios.push({
            codigo: "parcela_reiniciada",
            forte: false,
            evidencia: `Nova consignação em parcela ${novo.parcela_atual}/${novo.parcelas_total}.`,
          });
        }

        indicios.push({
          codigo: "vinculo_estrutural",
          forte: false,
          evidencia: vinculo.motivo,
        });

        const antigoQuaseQuitadoFraco =
          antigo.parcelas_total > 0 &&
          (antigo.parcela_atual ?? 0) >= antigo.parcelas_total * 0.8;
        if (antigoQuaseQuitadoFraco && !antigoEncerrante) {
          indicios.push({
            codigo: "antigo_quase_quitado",
            forte: false,
            evidencia: `Contrato anterior em ${antigo.parcela_atual ?? "?"}/${antigo.parcelas_total}.`,
          });
        }

        // Mesmo banco já está no agrupamento — não conta como indício.

        const fortes = indicios.filter((x) => x.forte);
        const total = indicios.length;

        if (total < config.refinanciamento.minimo_indicios) continue;

        const minFortes = config.refinanciamento.min_indicios_fortes ?? 1;
        if (config.refinanciamento.exigir_indicio_oficial && fortes.length < minFortes) {
          continue;
        }
        if (config.refinanciamento.mesmo_banco_data_proxima_nao_basta) {
          const apenasIndiciosFracos = indicios.length > 0 && indicios.every((i) => !i.forte);
          if (apenasIndiciosFracos) continue;
        }

        if (fortes.length === 0) continue;

        const tipo: ConsigfacilRefinanciamento["tipo_refinanciamento"] = (() => {
          const aTotal = antigo.parcelas_total * antigo.valor_parcela;
          const nTotal = novo.parcelas_total * novo.valor_parcela;
          if (novo.parcelas_total - antigo.parcelas_total >= DELTA_PARCELAS_NOVO) {
            return "refinanciamento_novo_credito";
          }
          if (nTotal < aTotal) return "portabilidade";
          if (nTotal > aTotal * 1.1) return "refinanciamento_novo_credito";
          return "renegociacao";
        })();

        const grau = Math.min(
          1,
          0.2 +
            fortes.length * 0.25 +
            (total >= 4 ? 0.15 : 0) +
            (dias <= 30 ? 0.1 : 0),
        );

        refs.push({
          contrato_origem: antigo.id_consignacao,
          contrato_destino: novo.id_consignacao,
          banco: novo.instituicao,
          distancia_dias: Math.round(dias),
          tipo_refinanciamento: tipo,
          evidencias_refinanciamento: indicios.map((x) => x.evidencia),
          grau_confianca: Math.round(grau * 100) / 100,
        });
      }
    }
  }

  return refs;
}

/**
 * Aplica flags apenas para refinanciamentos CONFIRMADOS (não descartados).
 */
export function aplicarRefinanciamentosNosContratos(
  contratos: ConsigfacilContrato[],
  refs: ConsigfacilRefinanciamento[],
): ConsigfacilContrato[] {
  const substituidoPor = new Map<string, string>();
  const refinDestino = new Set<string>();
  for (const r of refs) {
    if (r.grau_confianca >= 0.55) {
      substituidoPor.set(r.contrato_origem, r.contrato_destino);
      refinDestino.add(r.contrato_destino);
    }
  }
  return contratos.map((c) => {
    if (substituidoPor.has(c.id_consignacao)) {
      return {
        ...c,
        status: "substituido",
        contrato_substituido: substituidoPor.get(c.id_consignacao) ?? null,
      };
    }
    if (refinDestino.has(c.id_consignacao)) {
      return { ...c, eh_refinanciamento: true, status: "refinanciado" };
    }
    return c;
  });
}
