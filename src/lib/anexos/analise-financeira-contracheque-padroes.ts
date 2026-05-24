/**
 * Camada complementar de análise financeira a partir de rubricas já extraídas dos contracheques.
 * Não altera parsers, classificações nem regras de gravação existentes — apenas consome dados estruturados.
 */

import type { Payslip, PayslipItem } from "@/types/contracheque";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import { parseParcela } from "@/lib/anexos/analise-descontos-contracheque";

// ── Entrada ───────────────────────────────────────────────────────────────

export type TipoRubricaAnalise = "ganho" | "desconto";

export type ItemContrachequeAnalise = {
  mes: number;
  ano: number;
  codigo: string;
  descricao: string;
  tipo: TipoRubricaAnalise;
  valor: number;
  /** Ex.: "01/48", "56/60", "01/01" */
  parcela?: string;
};

// ── Saída: contratos / empréstimos ─────────────────────────────────────────

export type StatusContratoAnalise = "ativo/em andamento" | "finalizado" | "inconsistente";

export type TipoContratoAnalise = "parcelado" | "recorrente_01_01" | "recorrente_sem_parcela";

export type NivelRiscoAnalise = "baixo" | "medio" | "alto";

export type EmprestimoContratoAnalise = {
  codigo: string;
  descricao: string;
  valorParcela: number;
  parcelaInicialDetectada: number | null;
  parcelaFinalDetectada: number | null;
  totalParcelas: number | null;
  primeiraAparicao: string;
  ultimaAparicao: string;
  quantidadeAparicoes: number;
  mesesDetectados: string[];
  mesesFaltantesProvaveis: string[];
  totalPago: number;
  valorProjetadoContrato: number | null;
  saldoEstimado: number | null;
  status: StatusContratoAnalise;
  tipoContrato: TipoContratoAnalise;
  risco: NivelRiscoAnalise;
  observacoes: string[];
  instituicaoDetectada: string | null;
};

export type ResumoFinanceiroAnalise = {
  primeiroMes: string | null;
  ultimoMes: string | null;
  totalMesesNaBase: number;
  somaGanhos: number;
  somaDescontos: number;
  somaLiquido: number;
  somaEmprestimosDescontos: number;
  pctEmprestimosSobreGanhos: number | null;
  pctDescontosSobreGanhos: number | null;
};

export type PadroesMesAnalise = {
  competencia: string;
  mes: number;
  ano: number;
  ganhos: number;
  descontos: number;
  emprestimos: number;
  liquido: number;
  pctEmprestimoGanhos: number | null;
  pctDescontoGanhos: number | null;
  contratosSimultaneos: number;
};

export type PadroesAnoAnalise = {
  ano: number;
  ganhos: number;
  descontos: number;
  emprestimos: number;
  liquido: number;
  mediaMensalEmprestimos: number;
};

export type InstituicaoRecorrencia = {
  nome: string;
  aparicoes: number;
  valorTotalSomado: number;
};

export type PadroesConsumoAnalise = {
  porMes: PadroesMesAnalise[];
  porAno: PadroesAnoAnalise[];
  maiorMesComprometimento: { competencia: string; pctEmprestimoGanhos: number } | null;
  evolucaoAnualEmprestimos: { ano: number; total: number }[];
  instituicoesMaisRecorrentes: InstituicaoRecorrencia[];
  mesesContratosSimultaneosMax: { competencia: number; quantidade: number }[];
  mesesPossivelExcessoComprometimento: string[];
};

export type AlertaFinanceiroAnalise = {
  id: string;
  nivel: "info" | "aviso" | "critico";
  titulo: string;
  detalhe: string;
};

export type HipoteseJuridicaAnalise = {
  id: string;
  tema:
    | "revisao_consignado"
    | "cobranca_indevida"
    | "duplicidade_desconto"
    | "desconto_nao_reconhecido"
    | "superendividamento"
    | "repactuacao"
    | "cartao_consignado_rmc_rcc"
    | "margem_consignavel";
  titulo: string;
  textoInformativo: string;
  severidade: "informativo" | "atencao";
};

export type ChecklistItemMelhoria = {
  id: string;
  pergunta: string;
  respondidoOk: boolean;
  detalhe?: string;
};

export type AnaliseFinanceiraContrachequeResultado = {
  resumoFinanceiro: ResumoFinanceiroAnalise;
  emprestimosPorContrato: EmprestimoContratoAnalise[];
  padroesConsumo: PadroesConsumoAnalise;
  alertas: AlertaFinanceiroAnalise[];
  hipotesesJuridicas: HipoteseJuridicaAnalise[];
  checklistMelhoriaDados: ChecklistItemMelhoria[];
  sugestoesProximosDocumentos: string[];
  avisoJuridico: string;
};

/** Texto fixo — triagem, sem substituto de assessoria jurídica. */
export const AVISO_ANALISE_NAO_SUBSTITUI_ADVOGADO = `Esta análise é automática e meramente informativa. Não substitui orientação de advogado ou contador. Decisões de juízos e tribunais variam conforme prova, legislação local e entendimento jurisprudencial.`;

const RE_INDICIO_EMPRESTIMO =
  /\b(EMPRESTIM|EMPRÉSTIM|CONSIGNAD|BANCO|BMG|CRED|CART[AÃ]O|BANCOOB|BIB|DAYCOVAL|CAIXA|BRADESCO|SANTANDER|CREDCESTA|MILICRED|BB\s*-?\s*EMP|CEF\s*EMP|CONSIG)\b/i;

const RE_EXCLUSAO_PREV_IR =
  /\b(INSS|PREVID|PREV\.|FUNPREV|AMAZONPREV|RPPS|IRRF|I\.?R\.?\s*R\s*E\s*N\s*D\s*A|IMPOSTO\s*DE\s*RENDA|IR\s*SIMPL|DESCONTOS?\s*OBRIG|CONTRIB\.\s*PREV|PENS[AÃ]O\s*ALIM|MANUT\.?\s*FAMIL)\b/i;

const TOKENS_INSTITUICAO: { re: RegExp; label: string }[] = [
  {
    re: /\bJOOSJO\b|\bJOSJO\b|\bJOOSJ\b|\bPAN\s*AMERIC|\bPANAMERICANO\b|\bBANCO\s+PANAMERICANO\b/i,
    label: "Banco Panamericano",
  },
  { re: /\bBMG\b/i, label: "BMG" },
  {
    re: /\bBCO\s+DO\s+BRASIL\b|\bBANCO\s*DO\s*BRASIL\b|\bBB\s*-?\s*EMP\b/i,
    label: "Banco do Brasil",
  },
  { re: /\bBIB\b|\bBANCO\s+INDUSTRIAL(?:\s+DO\s+BRASIL)?\b/i, label: "Banco Industrial do Brasil" },
  { re: /\bCAIXA\b|\bCEF\b/i, label: "Caixa" },
  { re: /\bBRADESCO\b/i, label: "Bradesco" },
  { re: /\bSANTANDER\b/i, label: "Santander" },
  { re: /\bBANCOOB\b|\bBANCO\s*OB\b/i, label: "Bancoob" },
  { re: /\bB\s+DAYCOVAL\b|\bDAYCOVAL\b/i, label: "Daycoval" },
  { re: /\bCRED(I)?CESTA|\bCRED\s*CESTA/i, label: "CrediCesta" },
  { re: /\bMILICRED\b/i, label: "MiliCred" },
  { re: /\bMASTER\b/i, label: "Master" },
];

function mesKey(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function ordComp(ano: number, mes: number): number {
  return ano * 12 + (mes - 1);
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function normalizarDescricao(desc: string): string {
  return padronizarTokensRubricaOficiais(rubricaSemParcelaParaChave(desc))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairInstituicao(desc: string): string | null {
  let inst: string | null = null;
  for (const { re, label } of TOKENS_INSTITUICAO) {
    if (re.test(desc)) {
      inst = label;
      break;
    }
  }
  if (!inst && RE_INDICIO_EMPRESTIMO.test(desc)) {
    const m = desc.match(/\b([A-ZÀ-Ü]{3,}(?:\s+[A-ZÀ-Ü]{2,})?)\s*(?:EMP|CONSIG|\d)/i);
    if (m) inst = m[1].slice(0, 32);
  }
  if (!inst) return null;
  return normalizarNomeBanco(inst);
}

/** Heurística complementar — mantém IR/prev fora da pista de empréstimo. */
export function itemIndicaPossivelEmprestimoConsignado(item: ItemContrachequeAnalise): boolean {
  if (item.tipo !== "desconto" || !(item.valor > 0)) return false;
  const u = `${item.codigo} ${item.descricao}`.toUpperCase();
  if (RE_EXCLUSAO_PREV_IR.test(u)) return false;
  const parc = parseParcela(item.parcela);
  if (parc && parc.total > 1) return true;
  return RE_INDICIO_EMPRESTIMO.test(item.descricao);
}

type OcorrParcel = {
  ord: number;
  competencia: string;
  mes: number;
  ano: number;
  valor: number;
  atual: number | null;
  total: number | null;
};

function tipoEChaveGrupo(item: ItemContrachequeAnalise): {
  tipo: TipoContratoAnalise;
  chave: string;
} {
  const cod = (item.codigo ?? "").replace(/\D/g, "").trim();
  const slug = normalizarDescricao(item.descricao).replace(/[^a-z0-9]/g, "").slice(0, 56);
  const val = item.valor.toFixed(2);
  const parc = parseParcela(item.parcela);
  if (parc && parc.total > 1) {
    return {
      tipo: "parcelado",
      chave: `p|${cod}|${slug}|${val}|t${parc.total}`,
    };
  }
  if (parc && parc.total === 1) {
    return { tipo: "recorrente_01_01", chave: `r01|${cod}|${slug}|${val}` };
  }
  return { tipo: "recorrente_sem_parcela", chave: `rs|${cod}|${slug}|${val}` };
}

function inferirMesesFaltantes(
  ocs: OcorrParcel[],
  tipo: TipoContratoAnalise,
  totalParcelas: number | null,
): string[] {
  if (tipo !== "parcelado" || !totalParcelas || totalParcelas <= 1 || ocs.length < 2) return [];
  const sorted = [...ocs].sort((a, b) => a.ord - b.ord);
  const faltantes: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const dMes = cur.ord - prev.ord;
    const aPrev = prev.atual;
    const aCur = cur.atual;
    if (aPrev != null && aCur != null && dMes > 1) {
      const esperadoParc = aCur - aPrev;
      if (esperadoParc !== dMes && dMes > esperadoParc) {
        let o = prev.ord + 1;
        while (o < cur.ord) {
          const y = Math.floor(o / 12);
          const m = (o % 12) + 1;
          faltantes.push(mesKey(y, m));
          o++;
        }
      }
    }
  }
  return [...new Set(faltantes)];
}

function detectarInconsistencias(
  ocs: OcorrParcel[],
  tipo: TipoContratoAnalise,
  valorRef: number,
  totalParcelas: number | null,
): string[] {
  const obs: string[] = [];
  const vals = [...new Set(ocs.map((o) => arredondar(o.valor)))];
  if (vals.length > 1) obs.push("Valores de parcela diferentes ao longo do período.");
  if (tipo === "parcelado" && totalParcelas) {
    const sorted = [...ocs].sort((a, b) => a.ord - b.ord);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (prev.atual != null && cur.atual != null && cur.ord > prev.ord) {
        const deltaP = cur.atual - prev.atual;
        const deltaM = cur.ord - prev.ord;
        if (deltaP > deltaM + 1 || deltaP < 1) {
          obs.push("Possível quebra de sequência de parcelas em relação aos meses.");
          break;
        }
      }
    }
  }
  return obs;
}

function riscoDeComprometimento(pct: number | null): NivelRiscoAnalise {
  if (pct == null || pct < 15) return "baixo";
  if (pct < 30) return "medio";
  return "alto";
}

function montarEmprestimosPorContrato(
  itensEmp: ItemContrachequeAnalise[],
  ultimoMesOrd: number,
): EmprestimoContratoAnalise[] {
  const grupos = new Map<string, { tipo: TipoContratoAnalise; ocs: OcorrParcel[]; exemplo: ItemContrachequeAnalise }>();

  for (const item of itensEmp) {
    const { tipo, chave } = tipoEChaveGrupo(item);
    const parc = parseParcela(item.parcela);
    const oc: OcorrParcel = {
      ord: ordComp(item.ano, item.mes),
      competencia: mesKey(item.ano, item.mes),
      mes: item.mes,
      ano: item.ano,
      valor: item.valor,
      atual: parc?.atual ?? null,
      total: parc?.total ?? null,
    };
    let g = grupos.get(chave);
    if (!g) {
      g = { tipo, ocs: [oc], exemplo: item };
      grupos.set(chave, g);
    } else {
      g.ocs.push(oc);
    }
  }

  const porContratoPctMedio = new Map<string, number>();

  const result: EmprestimoContratoAnalise[] = [];
  for (const { tipo, ocs, exemplo } of grupos.values()) {
    const sorted = [...ocs].sort((a, b) => a.ord - b.ord);
    const primeira = sorted[0]!;
    const ultima = sorted[sorted.length - 1]!;
    const comParc = sorted.filter((o) => o.atual != null && o.total != null);
    const totalParcelas =
      tipo === "parcelado"
        ? comParc[0]?.total ?? null
        : tipo === "recorrente_01_01"
          ? 1
          : null;
    const pIni = comParc.length ? Math.min(...comParc.map((x) => x.atual!)) : null;
    const pFim = comParc.length ? Math.max(...comParc.map((x) => x.atual!)) : null;
    const valorParcela = primeira.valor;
    const qtd = sorted.length;
    const totalPago = arredondar(valorParcela * qtd);
    let valorProjetado: number | null = null;
    let saldoEst: number | null = null;
    if (tipo === "parcelado" && totalParcelas && totalParcelas > 1) {
      valorProjetado = arredondar(valorParcela * totalParcelas);
      saldoEst = arredondar(Math.max(0, valorProjetado - totalPago));
    }
    const mesesDetectados = sorted.map((o) => o.competencia);
    const faltantes = inferirMesesFaltantes(sorted, tipo, totalParcelas);
    const inconsistencias = detectarInconsistencias(sorted, tipo, valorParcela, totalParcelas);
    let status: StatusContratoAnalise = ultima.ord >= ultimoMesOrd ? "ativo/em andamento" : "finalizado";
    const observacoes = [...inconsistencias];
    if (faltantes.length > 0) observacoes.push(`Meses sem lançamento esperado (entre aparições): ${faltantes.slice(0, 8).join(", ")}${faltantes.length > 8 ? "…" : ""}.`);
    if (inconsistencias.length > 0 || faltantes.length > 0) status = "inconsistente";

    const inst = extrairInstituicao(exemplo.descricao);

    result.push({
      codigo: (exemplo.codigo ?? "").replace(/\D/g, "").trim(),
      descricao: rubricaSemParcelaParaChave(exemplo.descricao).replace(/\s+/g, " ").trim(),
      valorParcela,
      parcelaInicialDetectada: pIni,
      parcelaFinalDetectada: pFim,
      totalParcelas,
      primeiraAparicao: primeira.competencia,
      ultimaAparicao: ultima.competencia,
      quantidadeAparicoes: qtd,
      mesesDetectados,
      mesesFaltantesProvaveis: faltantes,
      totalPago,
      valorProjetadoContrato: valorProjetado,
      saldoEstimado: saldoEst,
      status,
      tipoContrato: tipo,
      risco: "medio",
      observacoes,
      instituicaoDetectada: inst,
    });
  }

  return result.sort((a, b) => b.totalPago - a.totalPago);
}

function agregarPorMes(itens: ItemContrachequeAnalise[]): Map<string, PadroesMesAnalise> {
  const map = new Map<string, PadroesMesAnalise>();
  for (const it of itens) {
    const k = mesKey(it.ano, it.mes);
    let row = map.get(k);
    if (!row) {
      row = {
        competencia: k,
        mes: it.mes,
        ano: it.ano,
        ganhos: 0,
        descontos: 0,
        emprestimos: 0,
        liquido: 0,
        pctEmprestimoGanhos: null,
        pctDescontoGanhos: null,
        contratosSimultaneos: 0,
      };
      map.set(k, row);
    }
    if (it.tipo === "ganho") row.ganhos += it.valor;
    else row.descontos += it.valor;
    if (it.tipo === "desconto" && itemIndicaPossivelEmprestimoConsignado(it)) {
      row.emprestimos += it.valor;
    }
  }
  for (const row of map.values()) {
    row.liquido = arredondar(row.ganhos - row.descontos);
    row.ganhos = arredondar(row.ganhos);
    row.descontos = arredondar(row.descontos);
    row.emprestimos = arredondar(row.emprestimos);
    if (row.ganhos > 0) {
      row.pctEmprestimoGanhos = arredondar((row.emprestimos / row.ganhos) * 100);
      row.pctDescontoGanhos = arredondar((row.descontos / row.ganhos) * 100);
    }
  }
  return map;
}

function contarContratosSimultaneosPorMes(
  itensEmp: ItemContrachequeAnalise[],
  ultimoOrd: number,
): Map<number, number> {
  const chavesPorMes = new Map<number, Set<string>>();
  for (const item of itensEmp) {
    const ord = ordComp(item.ano, item.mes);
    const { chave } = tipoEChaveGrupo(item);
    if (!chavesPorMes.has(ord)) chavesPorMes.set(ord, new Set());
    chavesPorMes.get(ord)!.add(chave);
  }
  const out = new Map<number, number>();
  for (const [ord, set] of chavesPorMes) {
    if (ord <= ultimoOrd) out.set(ord, set.size);
  }
  return out;
}

function gerarHipotesesJuridicas(resumo: ResumoFinanceiroAnalise, contratos: EmprestimoContratoAnalise[]): HipoteseJuridicaAnalise[] {
  const h: HipoteseJuridicaAnalise[] = [];
  const pctE = resumo.pctEmprestimosSobreGanhos ?? 0;
  if (pctE >= 35) {
    h.push({
      id: "hj-super",
      tema: "superendividamento",
      titulo: "Comprometimento elevado da renda com descontos «tipo empréstimo»",
      textoInformativo:
        "Quando descontos consignados ou semelhantes pressionam de forma relevante o líquido, podem existir debates sobre abusividade, margem ou renegociação — depende de contrato, data e prova. Use como roteiro de perguntas ao profissional, não como conclusão.",
      severidade: "atencao",
    });
  }
  if (contratos.some((c) => c.observacoes.some((o) => o.includes("duplicidade") || o.includes("quebra")))) {
    h.push({
      id: "hj-dup",
      tema: "duplicidade_desconto",
      titulo: "Indícios de linha de crédito duplicada ou sequência atípica",
      textoInformativo:
        "Se o extrato mostrar valores ou parcelas incoerentes com o contrato, pode haver espaço para apurar cobrança indevida ou erro — apenas após confronto com contrato e extratos.",
      severidade: "informativo",
    });
  }
  if (contratos.some((c) => /CART|RCC|RMC/i.test(c.descricao))) {
    h.push({
      id: "hj-cartao",
      tema: "cartao_consignado_rmc_rcc",
      titulo: "Rubrica compatível com cartão / RCC / RMC",
      textoInformativo:
        "Contratos de cartão consignado costumam ter regras próprias (limite, margem, CET). A triagem automática não valida cláusulas; junte termo e histórico de faturas.",
      severidade: "informativo",
    });
  }
  h.push({
    id: "hj-rev",
    tema: "revisao_consignado",
    titulo: "Revisão de contratos consignados (tema geral)",
    textoInformativo:
      "Em alguns casos há discussão sobre taxas, seguros ou capitalização — depende do contrato e do tempo. Consulta jurídica ajuda a separar rumor de tese viável.",
    severidade: "informativo",
  });
  return h;
}

function aplicarRiscoNosContratos(
  contratos: EmprestimoContratoAnalise[],
  porMes: Map<string, PadroesMesAnalise>,
): EmprestimoContratoAnalise[] {
  return contratos.map((c) => {
    let maxPct = 0;
    for (const comp of c.mesesDetectados) {
      const row = porMes.get(comp);
      if (row?.pctEmprestimoGanhos != null) maxPct = Math.max(maxPct, row.pctEmprestimoGanhos);
    }
    return { ...c, risco: riscoDeComprometimento(maxPct > 0 ? maxPct : null) };
  });
}

function haGapsNaSerieMeses(mesesNaBase: Set<string>): boolean {
  const sortedMeses = [...mesesNaBase].sort();
  for (let i = 1; i < sortedMeses.length; i++) {
    const prev = sortedMeses[i - 1]!;
    const cur = sortedMeses[i]!;
    const [ya, ma] = prev.split("-").map(Number);
    const [yb, mb] = cur.split("-").map(Number);
    if (ordComp(yb, mb) - ordComp(ya, ma) > 1) return true;
  }
  return false;
}

function gerarAlertas(
  contratos: EmprestimoContratoAnalise[],
  porMesArr: PadroesMesAnalise[],
  mesesNaBase: Set<string>,
): AlertaFinanceiroAnalise[] {
  const alertas: AlertaFinanceiroAnalise[] = [];
  for (const c of contratos) {
    if (c.status === "inconsistente") {
      alertas.push({
        id: `alt-inc-${c.codigo}-${c.descricao.slice(0, 12)}`,
        nivel: "aviso",
        titulo: `Contrato possivelmente inconsistente: ${c.descricao.slice(0, 48)}`,
        detalhe: c.observacoes.join(" ") || "Revise parcelas e valores no PDF.",
      });
    }
    if (c.tipoContrato === "parcelado" && c.parcelaFinalDetectada != null && c.totalParcelas) {
      if (c.parcelaFinalDetectada >= c.totalParcelas && c.status === "ativo/em andamento") {
        alertas.push({
          id: `alt-pos-${c.codigo}`,
          nivel: "aviso",
          titulo: "Última parcela alcançada mas ainda marcado como ativo",
          detalhe: `Conferir se o desconto após ${c.parcelaFinalDetectada}/${c.totalParcelas} foi extinto ou renovado.`,
        });
      }
    }
  }
  const sortedMeses = [...mesesNaBase].sort();
  for (let i = 1; i < sortedMeses.length; i++) {
    const prev = sortedMeses[i - 1]!;
    const cur = sortedMeses[i]!;
    const [ya, ma] = prev.split("-").map(Number);
    const [yb, mb] = cur.split("-").map(Number);
    if (ordComp(yb, mb) - ordComp(ya, ma) > 1) {
      alertas.push({
        id: `gap-${prev}-${cur}`,
        nivel: "info",
        titulo: "Intervalo sem competência na base",
        detalhe: `Entre ${prev.replace("-", "/")} e ${cur.replace("-", "/")} há meses sem documento carregado.`,
      });
      break;
    }
  }
  for (const m of porMesArr) {
    if ((m.pctEmprestimoGanhos ?? 0) > 40) {
      alertas.push({
        id: `excesso-${m.competencia}`,
        nivel: "critico",
        titulo: `Comprometimento elevado em ${m.competencia.replace("-", "/")}`,
        detalhe: `Descontos «empréstimo» chegaram a ~${m.pctEmprestimoGanhos?.toFixed(1)}% dos ganhos do mês.`,
      });
    }
  }
  return alertas;
}

function gerarChecklist(
  contratos: EmprestimoContratoAnalise[],
  itens: ItemContrachequeAnalise[],
  mesesNaBase: Set<string>,
  porMesArr: PadroesMesAnalise[],
): ChecklistItemMelhoria[] {
  const codigosVagos = itens.filter(
    (i) => i.tipo === "desconto" && (!i.codigo || !/\d{2,4}/.test(i.codigo)),
  );
  const recorrente01 = contratos.filter((c) => c.tipoContrato === "recorrente_01_01");
  const instCounts = new Map<string, number>();
  for (const c of contratos) {
    const k = c.instituicaoDetectada ?? "—";
    instCounts.set(k, (instCounts.get(k) ?? 0) + 1);
  }
  const multInst = [...instCounts.entries()].filter(([k, n]) => k !== "—" && n > 2);

  const parcelaFinalComDesconto = contratos.filter(
    (c) =>
      c.tipoContrato === "parcelado" &&
      c.totalParcelas &&
      (c.parcelaFinalDetectada ?? 0) >= c.totalParcelas &&
      c.status !== "finalizado",
  );

  return [
    {
      id: "contrato-fisico",
      pergunta: "Falta o contrato formal do empréstimo/consignado (PDF físico ou digital)?",
      respondidoOk: false,
      detalhe: "A análise só usa rubricas do contracheque; o contrato completa taxas e condições.",
    },
    {
      id: "autorizacao",
      pergunta: "Há termo de autorização de desconto em folha assinado e datado?",
      respondidoOk: false,
    },
    {
      id: "extrato-banco",
      pergunta: "Falta extrato bancário para cruzar valores descontados vs. creditados?",
      respondidoOk: false,
    },
    {
      id: "historico-folhas",
      pergunta: "O histórico cobre todos os meses com desconto ativo?",
      respondidoOk: porMesArr.length >= 3 && mesesNaBase.size >= 3,
      detalhe: `${mesesNaBase.size} competência(s) distinta(s) na base.`,
    },
    {
      id: "margem",
      pergunta: "Falta demonstrativo de margem consignável do órgão?",
      respondidoOk: false,
    },
    {
      id: "quitacao",
      pergunta: "Há comprovante de quitação dos contratos encerrados?",
      respondidoOk: contratos.every((c) => c.status !== "finalizado" || (c.saldoEstimado ?? 0) <= 0.02),
      detalhe: "Marcado OK apenas se não há contrato finalizado com saldo projetado positivo (heurística).",
    },
    {
      id: "meses-sem-doc",
      pergunta: "Há meses sem documento entre o primeiro e o último mês da série?",
      respondidoOk: !haGapsNaSerieMeses(mesesNaBase),
    },
    {
      id: "parcelas-fora-seq",
      pergunta: "Há parcelas fora de sequência?",
      respondidoOk: !contratos.some((c) => c.observacoes.some((o) => o.includes("quebra"))),
    },
    {
      id: "desconto-0101",
      pergunta: "Há desconto 01/01 recorrente (avulso mensal)?",
      respondidoOk: recorrente01.length === 0,
      detalhe:
        recorrente01.length > 0
          ? `${recorrente01.length} grupo(s) 01/01 — podem ser taxas ou consignações fixas.`
          : undefined,
    },
    {
      id: "sem-codigo",
      pergunta: "Há descontos sem código claro na folha?",
      respondidoOk: codigosVagos.length === 0,
      detalhe: codigosVagos.length ? `${codigosVagos.length} linha(s) com código fraco.` : undefined,
    },
    {
      id: "multi-contrato-inst",
      pergunta: "Há instituição com muitos contratos simultâneos?",
      respondidoOk: multInst.length === 0,
      detalhe: multInst.map(([nome, n]) => `${nome}: ${n}`).join("; ") || undefined,
    },
    {
      id: "cobranca-pos-final",
      pergunta: "Há possível cobrança após parcela final?",
      respondidoOk: parcelaFinalComDesconto.length === 0,
      detalhe: parcelaFinalComDesconto.length ? "Conferir se houve refinanciamento." : undefined,
    },
    {
      id: "refin",
      pergunta: "Há indícios de renovação/refin (valor ou parcela «reiniciando»)?",
      respondidoOk: !contratos.some((c) => c.observacoes.some((o) => o.includes("Valores"))),
    },
  ];
}

function sugestoesDocumentos(checklist: ChecklistItemMelhoria[]): string[] {
  const s: string[] = [];
  for (const c of checklist) {
    if (c.respondidoOk) continue;
    if (c.id === "contrato-fisico") s.push("Anexar ou arquivar contratos de consignado assinados (todas as aditivas).");
    if (c.id === "extrato-banco") s.push("Importar extratos da conta em que cai o salário para validar descontos.");
    if (c.id === "margem") s.push("Obter demonstrativo oficial de margem consignável (portal do órgão / SRH).");
    if (c.id === "quitacao") s.push("Guardar cartas de quitação ou última parcela com baixa explícita.");
    if (c.id === "autorizacao") s.push("Juntar autorizações de desconto em folha, se existirem.");
  }
  if (s.length === 0) s.push("Base razoável — mantenha novos contracheques mensais para acompanhar evolução.");
  return [...new Set(s)];
}

/** Converte `Payslip` já persistidos ou em revisão para itens de análise (camada complementar). */
export function converterPayslipsParaItensAnalise(payslips: Payslip[]): ItemContrachequeAnalise[] {
  const out: ItemContrachequeAnalise[] = [];
  for (const p of payslips) {
    for (const it of p.items ?? []) {
      const tipo: TipoRubricaAnalise = it.type === "desconto" ? "desconto" : "ganho";
      let parcela: string | undefined;
      if (it.parcelaAtual != null && it.parcelaTotal != null) {
        parcela = `${String(it.parcelaAtual).padStart(2, "0")}/${String(it.parcelaTotal).padStart(2, "0")}`;
      }
      out.push({
        mes: p.month,
        ano: p.year,
        codigo: (it.code ?? "").replace(/\D/g, "").trim(),
        descricao: it.description,
        tipo,
        valor: arredondar(it.value),
        parcela,
      });
    }
  }
  return out;
}

export function itemAnaliseDePayslipItem(p: { month: number; year: number }, it: PayslipItem): ItemContrachequeAnalise {
  const tipo: TipoRubricaAnalise = it.type === "desconto" ? "desconto" : "ganho";
  let parcela: string | undefined;
  if (it.parcelaAtual != null && it.parcelaTotal != null) {
    parcela = `${String(it.parcelaAtual).padStart(2, "0")}/${String(it.parcelaTotal).padStart(2, "0")}`;
  }
  return {
    mes: p.month,
    ano: p.year,
    codigo: (it.code ?? "").replace(/\D/g, "").trim(),
    descricao: it.description,
    tipo,
    valor: arredondar(it.value),
    parcela,
  };
}

/**
 * Objeto agregado: padrões financeiros, contratos inferidos, alertas, triagem jurídica **informativa** e checklist.
 */
export function gerarAnaliseFinanceiraContracheque(
  itens: ItemContrachequeAnalise[],
): AnaliseFinanceiraContrachequeResultado {
  if (itens.length === 0) {
    return {
      resumoFinanceiro: {
        primeiroMes: null,
        ultimoMes: null,
        totalMesesNaBase: 0,
        somaGanhos: 0,
        somaDescontos: 0,
        somaLiquido: 0,
        somaEmprestimosDescontos: 0,
        pctEmprestimosSobreGanhos: null,
        pctDescontosSobreGanhos: null,
      },
      emprestimosPorContrato: [],
      padroesConsumo: {
        porMes: [],
        porAno: [],
        maiorMesComprometimento: null,
        evolucaoAnualEmprestimos: [],
        instituicoesMaisRecorrentes: [],
        mesesContratosSimultaneosMax: [],
        mesesPossivelExcessoComprometimento: [],
      },
      alertas: [],
      hipotesesJuridicas: [],
      checklistMelhoriaDados: [],
      sugestoesProximosDocumentos: [],
      avisoJuridico: AVISO_ANALISE_NAO_SUBSTITUI_ADVOGADO,
    };
  }

  let minOrd = Infinity;
  let maxOrd = -Infinity;
  const mesesNaBase = new Set<string>();
  for (const it of itens) {
    const ord = ordComp(it.ano, it.mes);
    minOrd = Math.min(minOrd, ord);
    maxOrd = Math.max(maxOrd, ord);
    mesesNaBase.add(mesKey(it.ano, it.mes));
  }
  const primeiroY = Math.floor(minOrd / 12);
  const primeiroM = (minOrd % 12) + 1;
  const ultimoY = Math.floor(maxOrd / 12);
  const ultimoM = (maxOrd % 12) + 1;

  const somaGanhos = arredondar(
    itens.filter((i) => i.tipo === "ganho").reduce((s, i) => s + i.valor, 0),
  );
  const somaDescontos = arredondar(
    itens.filter((i) => i.tipo === "desconto").reduce((s, i) => s + i.valor, 0),
  );
  const itensEmp = itens.filter(itemIndicaPossivelEmprestimoConsignado);
  const somaEmp = arredondar(itensEmp.reduce((s, i) => s + i.valor, 0));
  const somaLiquido = arredondar(somaGanhos - somaDescontos);

  const resumo: ResumoFinanceiroAnalise = {
    primeiroMes: mesKey(primeiroY, primeiroM),
    ultimoMes: mesKey(ultimoY, ultimoM),
    totalMesesNaBase: mesesNaBase.size,
    somaGanhos,
    somaDescontos,
    somaLiquido,
    somaEmprestimosDescontos: somaEmp,
    pctEmprestimosSobreGanhos:
      somaGanhos > 0 ? arredondar((somaEmp / somaGanhos) * 100) : null,
    pctDescontosSobreGanhos:
      somaGanhos > 0 ? arredondar((somaDescontos / somaGanhos) * 100) : null,
  };

  const porMesMap = agregarPorMes(itens);
  const simult = contarContratosSimultaneosPorMes(itensEmp, maxOrd);
  for (const [k, row] of porMesMap) {
    const [yy, mm] = k.split("-").map(Number);
    row.contratosSimultaneos = simult.get(ordComp(yy, mm)) ?? 0;
  }
  const porMesArr = [...porMesMap.values()].sort(
    (a, b) => ordComp(a.ano, a.mes) - ordComp(b.ano, b.mes),
  );

  const porAno = new Map<number, PadroesAnoAnalise>();
  for (const m of porMesArr) {
    let a = porAno.get(m.ano);
    if (!a) {
      a = { ano: m.ano, ganhos: 0, descontos: 0, emprestimos: 0, liquido: 0, mediaMensalEmprestimos: 0 };
      porAno.set(m.ano, a);
    }
    a.ganhos += m.ganhos;
    a.descontos += m.descontos;
    a.emprestimos += m.emprestimos;
    a.liquido += m.liquido;
  }
  const porAnoArr = [...porAno.values()].map((a) => {
    const nMeses = porMesArr.filter((x) => x.ano === a.ano).length;
    return {
      ...a,
      ganhos: arredondar(a.ganhos),
      descontos: arredondar(a.descontos),
      emprestimos: arredondar(a.emprestimos),
      liquido: arredondar(a.liquido),
      mediaMensalEmprestimos: nMeses > 0 ? arredondar(a.emprestimos / nMeses) : 0,
    };
  }).sort((x, y) => x.ano - y.ano);

  let maiorMesComp: { competencia: string; pctEmprestimoGanhos: number } | null = null;
  for (const m of porMesArr) {
    if (m.pctEmprestimoGanhos == null) continue;
    if (!maiorMesComp || m.pctEmprestimoGanhos > maiorMesComp.pctEmprestimoGanhos) {
      maiorMesComp = { competencia: m.competencia, pctEmprestimoGanhos: m.pctEmprestimoGanhos };
    }
  }

  const evolucaoAnualEmprestimos = porAnoArr.map((a) => ({ ano: a.ano, total: a.emprestimos }));

  const instMap = new Map<string, { aparicoes: number; valor: number }>();
  for (const it of itensEmp) {
    const nome = extrairInstituicao(it.descricao) ?? "Outras / não identificadas";
    const cur = instMap.get(nome) ?? { aparicoes: 0, valor: 0 };
    cur.aparicoes += 1;
    cur.valor += it.valor;
    instMap.set(nome, cur);
  }
  const instituicoesMaisRecorrentes = [...instMap.entries()]
    .map(([nome, v]) => ({
      nome,
      aparicoes: v.aparicoes,
      valorTotalSomado: arredondar(v.valor),
    }))
    .sort((a, b) => b.aparicoes - a.aparicoes)
    .slice(0, 12);

  const mesesContratosSimultaneosMax = [...simult.entries()]
    .map(([ord, quantidade]) => ({ competencia: ord, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  const mesesPossivelExcessoComprometimento = porMesArr
    .filter(
      (m) =>
        (m.pctEmprestimoGanhos ?? 0) > 30 ||
        (m.pctDescontoGanhos ?? 0) > 50,
    )
    .map((m) => m.competencia);

  let contratos = montarEmprestimosPorContrato(itensEmp, maxOrd);
  contratos = aplicarRiscoNosContratos(contratos, porMesMap);

  const alertas = gerarAlertas(contratos, porMesArr, mesesNaBase);
  const hipoteses: HipoteseJuridicaAnalise[] = gerarHipotesesJuridicas(resumo, contratos);
  if ((resumo.pctDescontosSobreGanhos ?? 0) > 55) {
    hipoteses.push({
      id: "hj-rep",
      tema: "repactuacao",
      titulo: "Endividamento relevante na folha",
      textoInformativo:
        "Em situações de muitos descontos, órgãos e bancos podem discutir renegociação ou portabilidade — depende de regra vigente e documentação.",
      severidade: "atencao",
    });
  }
  if (contratos.some((c) => !c.instituicaoDetectada && c.valorParcela > 50)) {
    hipoteses.push({
      id: "hj-desc",
      tema: "desconto_nao_reconhecido",
      titulo: "Desconto sem instituição clara",
      textoInformativo:
        "Vale confrontar com contrato assinado; desconto não reconhecido costuma exigir prova documental específica.",
      severidade: "informativo",
    });
  }
  if (contratos.some((c) => c.observacoes.some((o) => o.includes("Valores")))) {
    hipoteses.push({
      id: "hj-cob",
      tema: "cobranca_indevida",
      titulo: "Valores de parcela variaram no período",
      textoInformativo:
        "Alterações de valor sem contrato aditivo visível na análise automatizada podem motivar conferência com extrato e instrumento contratual — triagem apenas.",
      severidade: "informativo",
    });
  }
  hipoteses.push({
    id: "hj-margem",
    tema: "margem_consignavel",
    titulo: "Margem consignável",
    textoInformativo:
      "Limites de desconto em folha seguem normas do benefício/órgão e do contrato. Triagem não calcula margem legal exata.",
    severidade: "informativo",
  });

  const checklistMelhoriaDados = gerarChecklist(contratos, itens, mesesNaBase, porMesArr);

  return {
    resumoFinanceiro: resumo,
    emprestimosPorContrato: contratos,
    padroesConsumo: {
      porMes: porMesArr,
      porAno: porAnoArr,
      maiorMesComprometimento: maiorMesComp,
      evolucaoAnualEmprestimos,
      instituicoesMaisRecorrentes,
      mesesContratosSimultaneosMax,
      mesesPossivelExcessoComprometimento,
    },
    alertas,
    hipotesesJuridicas: hipoteses.filter((h, idx, arr) => arr.findIndex((x) => x.id === h.id) === idx),
    checklistMelhoriaDados,
    sugestoesProximosDocumentos: sugestoesDocumentos(checklistMelhoriaDados),
    avisoJuridico: AVISO_ANALISE_NAO_SUBSTITUI_ADVOGADO,
  };
}

