import type { PayslipItem } from "@/types/contracheque";
import {
  BANCOS_CARTAO_SAQUE,
  TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE,
} from "@/lib/contracheque/termos-cartao-saque-embutido";
import type {
  AnaliseCartaoSaqueContracheque,
  NivelRiscoCartaoSaqueEmbutido,
  RubricaCartaoSaqueContracheque,
} from "@/types/cartao-saque-embutido";
import {
  ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE,
  RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE,
} from "@/types/cartao-saque-embutido";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";

export type PayslipHistoricoRubricaMin = {
  mes: number;
  ano: number;
  items: PayslipItem[];
};

export function normalizarRubricaCartaoSaque(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escRegexLiteral(termo: string): string {
  return termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termoNaDescricao(descNorm: string, termo: string): boolean {
  const t = normalizarRubricaCartaoSaque(termo);
  if (t.length <= 3) return new RegExp(`\\b${escRegexLiteral(t)}\\b`).test(descNorm);
  return descNorm.includes(t);
}

/** Primeiro termo prioritário que bate na descrição da rubrica. */
export function termoPrioritarioNaRubrica(descricao: string): { termo: string; riscoBase: "medio" | "alto" } | null {
  const descNorm = normalizarRubricaCartaoSaque(descricao);
  for (const entry of TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE) {
    if (termoNaDescricao(descNorm, entry.termo)) return entry;
  }
  return null;
}

function inferirBancoRubrica(descricao: string): string | null {
  const inst = detectarInstituicaoNaDescricao(descricao);
  if (inst?.nome) return inst.nome;
  const descNorm = normalizarRubricaCartaoSaque(descricao);
  for (const b of BANCOS_CARTAO_SAQUE) {
    for (const rot of b.rotulos) {
      const r = normalizarRubricaCartaoSaque(rot);
      if (r.length <= 3) {
        if (new RegExp(`\\b${escRegexLiteral(r)}\\b`).test(descNorm)) return b.nome;
      } else if (descNorm.includes(r)) return b.nome;
    }
  }
  return null;
}

function bancoDoItemOuRubrica(it: PayslipItem): string | null {
  return it.banco?.nome ?? it.bancoConfirmacao?.nome ?? inferirBancoRubrica(it.description);
}

function chaveRecorrenciaRubrica(descricao: string, termo: string): string {
  const d = normalizarRubricaCartaoSaque(descricao)
    .replace(/\d{1,3}\/\d{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${normalizarRubricaCartaoSaque(termo)}|${d.slice(0, 80)}`;
}

function ordComp(ano: number, mes: number): number {
  return ano * 12 + (mes - 1);
}

/** Meses distintos (incluindo competência atual) com a mesma rubrica normalizada. */
function mesesComMesmaChave(
  chave: string,
  competencia: { mes: number; ano: number },
  historico: PayslipHistoricoRubricaMin[],
  rubricasAtuaisComChave: Set<string>,
): number {
  const presente = new Set<number>();
  const atualOrd = ordComp(competencia.ano, competencia.mes);
  if (rubricasAtuaisComChave.has(chave)) presente.add(atualOrd);

  for (const p of historico) {
    const ord = ordComp(p.ano, p.mes);
    for (const it of p.items) {
      if (it.type !== "desconto" || it.value <= 0) continue;
      const hit = termoPrioritarioNaRubrica(it.description);
      if (!hit) continue;
      if (chaveRecorrenciaRubrica(it.description, hit.termo) === chave) {
        presente.add(ord);
        break;
      }
    }
  }
  return presente.size;
}

function riscoFinal(
  riscoBase: "medio" | "alto",
  descontoRecorrente: boolean,
): NivelRiscoCartaoSaqueEmbutido {
  if (descontoRecorrente) return "alto";
  if (riscoBase === "alto") return "alto";
  return "medio";
}

function maxRisco(riscos: NivelRiscoCartaoSaqueEmbutido[]): NivelRiscoCartaoSaqueEmbutido {
  if (riscos.some((r) => r === "alto")) return "alto";
  if (riscos.some((r) => r === "medio")) return "medio";
  return "baixo";
}

/**
 * Analisa rubricas de desconto do contracheque (pós-OCR/parser).
 * Não classifica como empréstimo comum — gera pendência de conferência.
 */
export function detectarCartaoSaqueEmRubricasContracheque(
  items: PayslipItem[],
  competencia: { mes: number; ano: number },
  historico: PayslipHistoricoRubricaMin[] = [],
): AnaliseCartaoSaqueContracheque {
  const rubricas: RubricaCartaoSaqueContracheque[] = [];
  const chavesAtuais = new Set<string>();
  const ocorrenciasAtuais = new Set<string>();

  for (const it of items) {
    if (it.type !== "desconto" || it.value <= 0) continue;
    const hit = termoPrioritarioNaRubrica(it.description);
    if (!hit) continue;

    const chave = chaveRecorrenciaRubrica(it.description, hit.termo);
    const valor = Math.round(it.value * 100) / 100;
    const assinaturaOcorrencia = [
      competencia.ano,
      competencia.mes,
      normalizarRubricaCartaoSaque(it.description),
      valor.toFixed(2),
    ].join("|");
    if (ocorrenciasAtuais.has(assinaturaOcorrencia)) continue;
    ocorrenciasAtuais.add(assinaturaOcorrencia);
    chavesAtuais.add(chave);

    const riscoInicial = riscoFinal(hit.riscoBase, false);
    console.info("[cartao-saque] rubrica detectada", {
      rubrica: it.description.trim(),
      competencia,
      risco: riscoInicial,
      termos: [hit.termo],
      codigo: it.code ?? null,
      banco: bancoDoItemOuRubrica(it),
      valorMensal: valor,
      parcela: it.parcelaAtual ?? null,
      totalParcelas: it.parcelaTotal ?? null,
    });

    rubricas.push({
      mes: competencia.mes,
      ano: competencia.ano,
      nomeRubrica: it.description.trim(),
      codigoRubrica: it.code?.trim() || null,
      valorDescontado: valor,
      termoEncontrado: hit.termo,
      bancoPossivel: bancoDoItemOuRubrica(it),
      risco: riscoInicial,
      descontoRecorrente: false,
      mesesRecorrencia: 1,
      status: "pendente_conferencia",
      chaveRecorrencia: chave,
      naoTratarComoEmprestimoComum: true,
    });
  }

  for (const r of rubricas) {
    const meses = mesesComMesmaChave(r.chaveRecorrencia, competencia, historico, chavesAtuais);
    r.mesesRecorrencia = meses;
    r.descontoRecorrente = meses >= 2;
    const hit = TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE.find(
      (t) => normalizarRubricaCartaoSaque(t.termo) === normalizarRubricaCartaoSaque(r.termoEncontrado),
    );
    r.risco = riscoFinal(hit?.riscoBase ?? "medio", r.descontoRecorrente);
  }

  const encontrado = rubricas.length > 0;
  const nivel_risco_global = encontrado ? maxRisco(rubricas.map((r) => r.risco)) : "baixo";
  const temRecorrente = rubricas.some((r) => r.descontoRecorrente);
  const recomendacao = encontrado
    ? [
        RECOMENDACAO_CARTAO_SAQUE_CONTRACHEQUE,
        temRecorrente
          ? "Desconto de cartão/saque localizado no contracheque sem contrato vinculado."
          : null,
        "Sugestão: localizar contrato/cartão vinculado e revisar juridicamente antes de classificar como empréstimo comum.",
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return {
    versao: 2,
    foco: "rubricas_desconto_contracheque",
    encontrado,
    nivel_risco_global,
    alerta: encontrado ? ALERTA_RUBRICA_CARTAO_SAQUE_CONTRACHEQUE : null,
    recomendacao,
    rubricas,
    competencia,
    status: encontrado ? "pendente_conferencia" : null,
  };
}
