/**
 * Camada complementar: consolidação lógica de empréstimos inferidos a partir de
 * `emprestimosPorContrato` (saída já agregada da análise de contracheque).
 * Não altera parsers, rubricas brutas nem a função que monta `EmprestimoContratoAnalise`.
 */

import type {
  EmprestimoContratoAnalise,
  StatusContratoAnalise,
  TipoContratoAnalise,
} from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { normalizarNomeBanco } from "@/lib/auditoria/normalizar-banco";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";

// ── Tipos públicos ─────────────────────────────────────────────────────────

export type NivelConfiancaConsolidacao = "alto" | "medio" | "baixo";

export type TipoConsolidacaoLogica =
  | "mesmo_contrato"
  | "possivel_mesmo_contrato"
  /** Legado: grupos não são mais unidos automaticamente por refinanciamento — use `suspeitasRefinanciamento`. */
  | "possivel_refinanciamento"
  | "recorrente_01_01"
  | "contratos_distintos_mesmo_banco";

/** Hipótese analítica apenas: não consolida contratos nem altera valores. */
export type NivelSuspeitaRefinanciamento = "possivel" | "provavel";

export type SuspeitaRefinanciamento = {
  id: string;
  indiceContratoAnterior: number;
  indiceContratoNovo: number;
  instituicao: string;
  nivel: NivelSuspeitaRefinanciamento;
  /** Critérios heurísticos ligados (auditoria). */
  criterios: string[];
  mensagem: string;
  contratoAnterior: EmprestimoContratoAnalise;
  contratoNovo: EmprestimoContratoAnalise;
};

export type GrupoConsolidadoEmprestimo = {
  grupoId: string;
  instituicao: string;
  descricaoPrincipal: string;
  codigosEnvolvidos: string[];
  descricoesEnvolvidas: string[];
  primeiraAparicao: string;
  ultimaAparicao: string;
  quantidadeAparicoes: number;
  valorMedioParcela: number;
  menorValorParcela: number;
  maiorValorParcela: number;
  totalPagoConsolidado: number;
  totalParcelasDetectado: number | null;
  statusConsolidado: StatusContratoAnalise;
  nivelConfianca: NivelConfiancaConsolidacao;
  scoreConfianca: number;
  tipoConsolidacao: TipoConsolidacaoLogica;
  motivoAgrupamento: string;
  contratosOriginais: EmprestimoContratoAnalise[];
  observacoes: string[];
};

export type AlertaConsolidacaoLogica = {
  id: string;
  nivel: "info" | "aviso" | "critico";
  titulo: string;
  detalhe: string;
};

export type ConsolidacaoLogicaEmprestimosResultado = {
  grupos: GrupoConsolidadoEmprestimo[];
  alertas: AlertaConsolidacaoLogica[];
  /**
   * Pares de contratos inferidos com sinais compatíveis com refinanciamento — somente possibilidade analítica.
   * Linhas permanecem separadas nos grupos; nada aqui confirma operação.
   */
  suspeitasRefinanciamento: SuspeitaRefinanciamento[];
};

const EPS_VALOR = 2;
const EPS_VALOR_REFIN = 5;

/**
 * Ordem explícita: padrões mais específicos primeiro.
 * O `label` é só “âncora” para detecção; o texto exibido na consolidação vem de `normalizarNomeBanco(label|fallback)`.
 */
const REGRAS_INSTITUICAO_LOGICA: { re: RegExp; label: string }[] = [
  { re: /\bBANCO\s+BMG\b|\bBMG\b/i, label: "BMG" },
  {
    re: /\bBANCO\s*DO\s*BRASIL\b|\bBCO\s*DO\s*BRASIL\b|\bBB\s*-?\s*EMP\b|\bBB\s+EMP\b|\bBB\s*-\s*EMP\b|\bbb\b/i,
    label: "Banco do Brasil",
  },
  {
    re: /\bBIB\b|\bBANCO\s*INDUSTRIAL(?:\s*DO\s*BRASIL)?\b/i,
    label: "Banco Industrial do Brasil",
  },
  {
    re: /\bJOOSJO\b|\bJOSJO\b|\bJOOSJ\b|\bJOOJ\b|\bPAN\s*AMERIC|\bPANAMERICANO\b|\bBANCO\s+PANAMERICANO\b/i,
    label: "Panamericano",
  },
  { re: /\bCAIXA\b|\bCEF\b/i, label: "Caixa" },
  { re: /\bBANCOOB\b|\bBANCO\s*OB\b/i, label: "Bancoob" },
  { re: /\bB\s*DAYCOVAL\b|\bDAYCOVAL\b/i, label: "Daycoval" },
  { re: /\bCRED(I)?CESTA\b|\bCRED\s*CESTA\b/i, label: "CrediCesta" },
  { re: /\bMILICRED\b/i, label: "Milicred" },
  { re: /\bBRADESCO\b/i, label: "Bradesco" },
  { re: /\bSANTANDER\b/i, label: "Santander" },
  { re: /\bc6\b/i, label: "C6" },
  { re: /\bMASTER\b/i, label: "Master" },
];

// ── Helpers temporais / conjuntos ───────────────────────────────────────────

function ordMes(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

function arredondar2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mesesSet(c: EmprestimoContratoAnalise): Set<string> {
  return new Set(c.mesesDetectados);
}

export function normalizarInstituicaoLogica(c: EmprestimoContratoAnalise): string {
  const texto = `${c.descricao} ${c.instituicaoDetectada ?? ""}`;
  for (const { re, label } of REGRAS_INSTITUICAO_LOGICA) {
    if (re.test(texto)) return normalizarNomeBanco(label);
  }
  const raw = c.instituicaoDetectada?.trim();
  if (!raw) return "Instituição não identificada";
  return normalizarNomeBanco(raw);
}

function coexistem(a: EmprestimoContratoAnalise, b: EmprestimoContratoAnalise): boolean {
  const sa = mesesSet(a);
  for (const m of b.mesesDetectados) {
    if (sa.has(m)) return true;
  }
  return false;
}

function valorProximo(a: number, b: number, eps = EPS_VALOR): boolean {
  return Math.abs(a - b) <= eps;
}

function slugDesc(c: EmprestimoContratoAnalise): string {
  return normSlugRubricaLoanMatch(c.descricao);
}

function descricoesFortementeAlinhadas(a: EmprestimoContratoAnalise, b: EmprestimoContratoAnalise): boolean {
  const x = slugDesc(a);
  const y = slugDesc(b);
  if (x.length >= 6 && y.length >= 6 && x === y) return true;
  if (x.length >= 10 && y.length >= 10) {
    const shorter = x.length <= y.length ? x : y;
    const longer = x.length <= y.length ? y : x;
    if (longer.includes(shorter)) return true;
  }
  return false;
}

/** Meses entre fim de A e início de B (exclusivo): 0 = mês seguinte imediato. */
function mesesEntreFimEInicio(a: EmprestimoContratoAnalise, b: EmprestimoContratoAnalise): number | null {
  if (ordMes(b.primeiraAparicao) <= ordMes(a.ultimaAparicao)) return null;
  return ordMes(b.primeiraAparicao) - ordMes(a.ultimaAparicao) - 1;
}

// ── Union-find ─────────────────────────────────────────────────────────────

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let p = this.parent[i]!;
    while (p !== this.parent[p]!) {
      this.parent[i] = this.parent[p]!;
      p = this.parent[i]!;
    }
    return p;
  }
  union(i: number, j: number): void {
    const ri = this.find(i);
    const rj = this.find(j);
    if (ri < rj) this.parent[rj] = ri;
    else if (rj < ri) this.parent[ri] = rj;
  }
}

type MergeMarca = "r01" | "parcelado_continuidade";

// ── Fusão permitida ────────────────────────────────────────────────────────

function podeMesclarRecorrente01(
  a: EmprestimoContratoAnalise,
  b: EmprestimoContratoAnalise,
  instA: string,
  instB: string,
): boolean {
  if (instA !== instB) return false;
  if (a.tipoContrato !== "recorrente_01_01" || b.tipoContrato !== "recorrente_01_01") return false;
  if (!valorProximo(a.valorParcela, b.valorParcela)) return false;
  if (!descricoesFortementeAlinhadas(a, b)) return false;
  return true;
}

function podeMesclarParceladoContinuidade(
  a: EmprestimoContratoAnalise,
  b: EmprestimoContratoAnalise,
  instA: string,
  instB: string,
): boolean {
  if (instA !== instB) return false;
  if (a.tipoContrato !== "parcelado" || b.tipoContrato !== "parcelado") return false;
  if (coexistem(a, b)) return false;
  if (
    !a.totalParcelas ||
    !b.totalParcelas ||
    a.totalParcelas !== b.totalParcelas
  ) {
    return false;
  }
  if (!valorProximo(a.valorParcela, b.valorParcela)) return false;
  const entre = mesesEntreFimEInicio(a, b);
  if (entre == null || entre > 1) return false;
  if (
    a.parcelaFinalDetectada == null ||
    b.parcelaInicialDetectada == null ||
    b.parcelaInicialDetectada !== a.parcelaFinalDetectada + 1
  ) {
    return false;
  }
  return true;
}

/**
 * Avalia apenas hipótese analítica de refinanciamento (não altera agrupamento nem dados financeiros).
 */
function avaliarSuspeitaRefinanciamento(
  anterior: EmprestimoContratoAnalise,
  novo: EmprestimoContratoAnalise,
  instA: string,
  instB: string,
): { nivel: NivelSuspeitaRefinanciamento; criterios: string[]; mensagem: string } | null {
  if (instA !== instB) return null;
  if (coexistem(anterior, novo)) return null;
  const entre = mesesEntreFimEInicio(anterior, novo);
  if (entre == null || entre > 3) return null;
  const pi = novo.parcelaInicialDetectada;
  if (pi == null || pi > 3) return null;
  const mudouValor = !valorProximo(anterior.valorParcela, novo.valorParcela, EPS_VALOR_REFIN);
  const mudouPrazo =
    anterior.totalParcelas != null &&
    novo.totalParcelas != null &&
    anterior.totalParcelas !== novo.totalParcelas;
  if (!mudouValor && !mudouPrazo) return null;

  const criterios: string[] = [];
  criterios.push("Mesma instituição financeira (normalização heurística).");
  criterios.push("Sem coexistência temporal entre as duas rubricas inferidas.");
  if (entre === 0) {
    criterios.push("Novo contrato no mês seguinte ao último mês observado do anterior.");
  } else if (entre != null) {
    criterios.push(`Intervalo de ${entre} mês(es) entre última aparição do anterior e primeira do novo.`);
  }
  criterios.push(
    `Parcela inicial baixa no novo contrato (${pi}${novo.totalParcelas != null ? ` de ~${novo.totalParcelas}` : ""}).`,
  );
  if (mudouValor) criterios.push("Valor da parcela alterado em relação ao segmento anterior.");
  if (mudouPrazo) {
    criterios.push(
      `Quantidade total de parcelas alterada (${anterior.totalParcelas ?? "?"} → ${novo.totalParcelas ?? "?"}).`,
    );
  }
  const prazoMaior =
    mudouPrazo &&
    anterior.totalParcelas != null &&
    novo.totalParcelas != null &&
    novo.totalParcelas > anterior.totalParcelas;
  if (prazoMaior) criterios.push("Prazo do novo contrato maior que o do segmento anterior.");
  const anteriorPareceEncerrado =
    anterior.totalParcelas != null &&
    anterior.parcelaFinalDetectada != null &&
    anterior.parcelaFinalDetectada >= anterior.totalParcelas;
  if (anteriorPareceEncerrado) {
    criterios.push("Contrato anterior parece encerrado na folha (última parcela atingida ou ultrapassada).");
  }

  const gapCurto = entre != null && entre <= 1;
  const parcelaMuitoBaixa = pi <= 2;
  const forteProvavel =
    (gapCurto && parcelaMuitoBaixa && (mudouValor || prazoMaior)) ||
    (anteriorPareceEncerrado && entre != null && entre <= 2 && (mudouValor || prazoMaior || parcelaMuitoBaixa)) ||
    (prazoMaior && gapCurto && mudouValor);

  const nivel: NivelSuspeitaRefinanciamento = forteProvavel ? "provavel" : "possivel";
  const mensagem =
    nivel === "provavel"
      ? "Vários critérios heurísticos alinhados — hipótese analítica mais forte. Não confirma refinanciamento nem altera dados."
      : "Sinais fracos a moderados — hipótese analítica. Exige conferência humana; contratos permanecem listados separadamente.";

  return { nivel, criterios, mensagem };
}

function coletarSuspeitasRefinanciamento(
  emprestimosPorContrato: EmprestimoContratoAnalise[],
  inst: string[],
  ordIndices: number[],
): SuspeitaRefinanciamento[] {
  const out: SuspeitaRefinanciamento[] = [];
  const vistos = new Set<string>();

  function registrar(idxAnt: number, idxNovo: number, ant: EmprestimoContratoAnalise, novo: EmprestimoContratoAnalise) {
    const ev = avaliarSuspeitaRefinanciamento(ant, novo, inst[idxAnt]!, inst[idxNovo]!);
    if (!ev) return;
    const pk = `${Math.min(idxAnt, idxNovo)}|${Math.max(idxAnt, idxNovo)}`;
    if (vistos.has(pk)) return;
    vistos.add(pk);
    out.push({
      id: `suspeita-refin-${idxAnt}-${idxNovo}`,
      indiceContratoAnterior: idxAnt,
      indiceContratoNovo: idxNovo,
      instituicao: normalizarInstituicaoLogica(novo),
      nivel: ev.nivel,
      criterios: ev.criterios,
      mensagem: ev.mensagem,
      contratoAnterior: ant,
      contratoNovo: novo,
    });
  }

  for (let ii = 0; ii < ordIndices.length; ii++) {
    for (let jj = ii + 1; jj < ordIndices.length; jj++) {
      const i = ordIndices[ii]!;
      const j = ordIndices[jj]!;
      const ci = emprestimosPorContrato[i]!;
      const cj = emprestimosPorContrato[j]!;
      if (ordMes(ci.ultimaAparicao) <= ordMes(cj.primeiraAparicao)) {
        registrar(i, j, ci, cj);
      } else if (ordMes(cj.ultimaAparicao) <= ordMes(ci.primeiraAparicao)) {
        registrar(j, i, cj, ci);
      }
    }
  }
  return out;
}

// ── Agregação de grupo ─────────────────────────────────────────────────────

function statusAgregado(cs: EmprestimoContratoAnalise[]): StatusContratoAnalise {
  if (cs.some((c) => c.status === "inconsistente")) return "inconsistente";
  if (cs.some((c) => c.status === "ativo/em andamento")) return "ativo/em andamento";
  return "finalizado";
}

function totalParcelasGrupo(cs: EmprestimoContratoAnalise[]): number | null {
  const vals = cs.map((c) => c.totalParcelas).filter((x): x is number => x != null && x > 0);
  if (vals.length === 0) return null;
  const u = new Set(vals);
  return u.size === 1 ? vals[0]! : null;
}

function tipoEPontuacao(
  cs: EmprestimoContratoAnalise[],
  marcas: Set<MergeMarca>,
  temCoexistenciaMesmaInstituicao: boolean,
): { tipo: TipoConsolidacaoLogica; nivel: NivelConfiancaConsolidacao; score: number; motivo: string } {
  if (
    cs.every((c) => c.tipoContrato === "recorrente_01_01") &&
    (marcas.has("r01") || cs.length > 1)
  ) {
    return {
      tipo: "recorrente_01_01",
      nivel: "alto",
      score: 82,
      motivo: "Mesmo valor recorrente (padrão 01/01), mesma instituição e descrição compatível.",
    };
  }
  if (marcas.has("parcelado_continuidade") && cs.every((c) => c.tipoContrato === "parcelado")) {
    return {
      tipo: "mesmo_contrato",
      nivel: "alto",
      score: 91,
      motivo: "Continuidade de parcela, mesma instituição, mesmo total de parcelas, valor dentro da tolerância e sem coexistência.",
    };
  }

  if (cs.length > 1) {
    return {
      tipo: "possivel_mesmo_contrato",
      nivel: "baixo",
      score: 48,
      motivo: "Agrupamento com sinais mistos ou encadeamento fraco — revisar no contracheque.",
    };
  }

  if (temCoexistenciaMesmaInstituicao) {
    return {
      tipo: "contratos_distintos_mesmo_banco",
      nivel: "baixo",
      score: 44,
      motivo: "Contratos simultâneos detectados — não consolidado automaticamente com outras linhas.",
    };
  }

  const t: TipoContratoAnalise = cs[0]!.tipoContrato;
  if (t === "recorrente_01_01") {
    return {
      tipo: "recorrente_01_01",
      nivel: "alto",
      score: 78,
      motivo: "Linha recorrente 01/01 isolada.",
    };
  }
  return {
    tipo: "mesmo_contrato",
    nivel: "medio",
    score: 72,
    motivo: "Contrato parcelado ou recorrente sem encadeamento automático adicional.",
  };
}

function descricaoPrincipalDe(cs: EmprestimoContratoAnalise[]): string {
  const sorted = [...cs].sort((a, b) => b.descricao.length - a.descricao.length);
  return sorted[0]!.descricao;
}

function montarGrupo(
  grupoId: string,
  cs: EmprestimoContratoAnalise[],
  marcas: Set<MergeMarca>,
  flagsCoexist: boolean[],
): GrupoConsolidadoEmprestimo {
  const instituicao = normalizarInstituicaoLogica(cs[0]!);
  const primeiraAparicao = cs.reduce(
    (m, c) => (ordMes(c.primeiraAparicao) < ordMes(m) ? c.primeiraAparicao : m),
    cs[0]!.primeiraAparicao,
  );
  const ultimaAparicao = cs.reduce(
    (m, c) => (ordMes(c.ultimaAparicao) > ordMes(m) ? c.ultimaAparicao : m),
    cs[0]!.ultimaAparicao,
  );
  const valorParcelas = cs.map((c) => c.valorParcela);
  const somaPago = arredondar2(cs.reduce((s, c) => s + c.totalPago, 0));
  const qtdApar = cs.reduce((s, c) => s + c.quantidadeAparicoes, 0);
  const valorMedio = arredondar2(valorParcelas.reduce((a, b) => a + b, 0) / valorParcelas.length);
  const tParcelas = totalParcelasGrupo(cs);

  const singletonCoexistSameBank = cs.length === 1 && flagsCoexist[0] === true;
  const { tipo, nivel, score, motivo } = tipoEPontuacao(cs, marcas, singletonCoexistSameBank);

  const observacoes: string[] = [];
  if (tParcelas == null && cs.some((c) => c.totalParcelas != null)) {
    observacoes.push("Totais de parcelas diferentes entre linhas originais — campo consolidado deixado vazio.");
  }

  return {
    grupoId,
    instituicao,
    descricaoPrincipal: descricaoPrincipalDe(cs),
    codigosEnvolvidos: [...new Set(cs.map((c) => c.codigo).filter(Boolean))],
    descricoesEnvolvidas: [...new Set(cs.map((c) => c.descricao))],
    primeiraAparicao,
    ultimaAparicao,
    quantidadeAparicoes: qtdApar,
    valorMedioParcela: valorMedio,
    menorValorParcela: arredondar2(Math.min(...valorParcelas)),
    maiorValorParcela: arredondar2(Math.max(...valorParcelas)),
    totalPagoConsolidado: somaPago,
    totalParcelasDetectado: tParcelas,
    statusConsolidado: statusAgregado(cs),
    nivelConfianca: nivel,
    scoreConfianca: score,
    tipoConsolidacao: tipo,
    motivoAgrupamento: motivo,
    contratosOriginais: cs,
    observacoes,
  };
}

// ── Alertas ────────────────────────────────────────────────────────────────

function alertasConsolidacao(cs: EmprestimoContratoAnalise[]): AlertaConsolidacaoLogica[] {
  const out: AlertaConsolidacaoLogica[] = [];
  const n = cs.length;
  const insts = cs.map(normalizarInstituicaoLogica);

  const porMesInst = new Map<string, EmprestimoContratoAnalise[]>();
  for (let i = 0; i < n; i++) {
    const inst = insts[i]!;
    for (const m of cs[i]!.mesesDetectados) {
      const k = `${m}|${inst}`;
      if (!porMesInst.has(k)) porMesInst.set(k, []);
      porMesInst.get(k)!.push(cs[i]!);
    }
  }
  for (const [k, arr] of porMesInst) {
    if (arr.length >= 3) {
      const [mes, inst] = k.split("|");
      out.push({
        id: `coexist-many-${mes}-${inst}`,
        nivel: "aviso",
        titulo: "Muitos contratos simultâneos na mesma instituição",
        detalhe: `Em ${mes.replace("-", "/")} há ${arr.length} linhas distintas em ${inst}. Pode haver vários contratos reais — não foram fundidos automaticamente.`,
      });
    }
  }

  const porCodigo = new Map<string, EmprestimoContratoAnalise[]>();
  for (const c of cs) {
    const code = c.codigo.trim();
    if (!code) continue;
    if (!porCodigo.has(code)) porCodigo.set(code, []);
    porCodigo.get(code)!.push(c);
  }
  for (const [code, arr] of porCodigo) {
    const descs = new Set(arr.map((x) => slugDesc(x)));
    if (descs.size > 1) {
      out.push({
        id: `code-${code}-multi-desc`,
        nivel: "aviso",
        titulo: "Mesmo código com descrições divergentes",
        detalhe: `Código ${code}: ${arr.length} contrato(s) com textos de rubrica diferentes — risco de rubrica reaproveitada ou OCR distinto.`,
      });
    }
  }

  const porSlug = new Map<string, EmprestimoContratoAnalise[]>();
  for (const c of cs) {
    const s = slugDesc(c);
    if (s.length < 8) continue;
    if (!porSlug.has(s)) porSlug.set(s, []);
    porSlug.get(s)!.push(c);
  }
  for (const [slug, arr] of porSlug) {
    const codes = new Set(arr.map((x) => x.codigo).filter(Boolean));
    if (codes.size > 1) {
      out.push({
        id: `slug-${slug.slice(0, 12)}-multi-code`,
        nivel: "info",
        titulo: "Descrição parecida com códigos diferentes",
        detalhe: `Possível duplicidade de cadastro ou rubricas homônimas (${arr.length} linhas, ${codes.size} códigos).`,
      });
    }
  }

  for (let i = 0; i < n; i++) {
    const c = cs[i]!;
    if (
      c.tipoContrato === "parcelado" &&
      c.totalParcelas != null &&
      c.parcelaFinalDetectada != null &&
      c.parcelaFinalDetectada >= c.totalParcelas &&
      c.status === "ativo/em andamento"
    ) {
      out.push({
        id: `parc-final-${i}-${c.codigo}`,
        nivel: "aviso",
        titulo: "Possível cobrança após parcela final",
        detalhe: `«${c.descricao.slice(0, 48)}…»: última parcela ${c.parcelaFinalDetectada}/${c.totalParcelas} mas status ainda ativo na análise.`,
      });
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!coexistem(cs[i]!, cs[j]!)) continue;
      if (insts[i] !== insts[j]) continue;
      if (
        cs[i]!.tipoContrato === "parcelado" &&
        cs[j]!.tipoContrato === "parcelado" &&
        cs[i]!.parcelaInicialDetectada != null &&
        cs[j]!.parcelaInicialDetectada != null &&
        cs[i]!.totalParcelas &&
        cs[j]!.totalParcelas &&
        cs[i]!.totalParcelas !== cs[j]!.totalParcelas
      ) {
        out.push({
          id: `simult-parc-${i}-${j}`,
          nivel: "info",
          titulo: "Contratos simultâneos com prazos distintos (mesma instituição)",
          detalhe: `Provável existência de dois (ou mais) contratos reais em ${insts[i]} — ex.: parcelas com totais diferentes no mesmo mês.`,
        });
        break;
      }
    }
  }

  return out;
}

// ── API principal ───────────────────────────────────────────────────────────

/**
 * Consome apenas `emprestimosPorContrato` já produzidos pela análise existente.
 * Não altera nem reprocessa rubricas/itens brutos.
 */
export function consolidarEmprestimosPorPadraoLogico(
  emprestimosPorContrato: EmprestimoContratoAnalise[],
): ConsolidacaoLogicaEmprestimosResultado {
  const alertas = alertasConsolidacao(emprestimosPorContrato);
  const n = emprestimosPorContrato.length;
  if (n === 0) {
    return { grupos: [], alertas, suspeitasRefinanciamento: [] };
  }

  const inst = emprestimosPorContrato.map(normalizarInstituicaoLogica);
  const coexistIdx = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (inst[i] !== inst[j]) continue;
      if (coexistem(emprestimosPorContrato[i]!, emprestimosPorContrato[j]!)) {
        coexistIdx[i] = true;
        break;
      }
    }
  }

  const uf = new UnionFind(n);
  const marcasPorPar = new Map<string, Set<MergeMarca>>();

  function regMarca(i: number, j: number, m: MergeMarca) {
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const k = `${a}|${b}`;
    if (!marcasPorPar.has(k)) marcasPorPar.set(k, new Set());
    marcasPorPar.get(k)!.add(m);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (podeMesclarRecorrente01(emprestimosPorContrato[i]!, emprestimosPorContrato[j]!, inst[i]!, inst[j]!)) {
        uf.union(i, j);
        regMarca(i, j, "r01");
      }
    }
  }

  const ordIndices = [...emprestimosPorContrato.keys()].sort(
    (a, b) => ordMes(emprestimosPorContrato[a]!.primeiraAparicao) - ordMes(emprestimosPorContrato[b]!.primeiraAparicao),
  );

  for (let ii = 0; ii < ordIndices.length; ii++) {
    for (let jj = ii + 1; jj < ordIndices.length; jj++) {
      const i = ordIndices[ii]!;
      const j = ordIndices[jj]!;
      const ci = emprestimosPorContrato[i]!;
      const cj = emprestimosPorContrato[j]!;
      if (ordMes(ci.primeiraAparicao) <= ordMes(cj.primeiraAparicao)) {
        if (podeMesclarParceladoContinuidade(ci, cj, inst[i]!, inst[j]!)) {
          uf.union(i, j);
          regMarca(i, j, "parcelado_continuidade");
        }
      } else {
        if (podeMesclarParceladoContinuidade(cj, ci, inst[j]!, inst[i]!)) {
          uf.union(i, j);
          regMarca(i, j, "parcelado_continuidade");
        }
      }
    }
  }

  const suspeitasRefinanciamento = coletarSuspeitasRefinanciamento(emprestimosPorContrato, inst, ordIndices);

  const roots = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    if (!roots.has(r)) roots.set(r, []);
    roots.get(r)!.push(i);
  }

  const grupos: GrupoConsolidadoEmprestimo[] = [];
  let gid = 0;
  for (const [, idxs] of [...roots.entries()].sort((a, b) => {
    const ia = emprestimosPorContrato[a[1][0]!]!.primeiraAparicao;
    const ib = emprestimosPorContrato[b[1][0]!]!.primeiraAparicao;
    return ordMes(ia) - ordMes(ib);
  })) {
    const cs = idxs.map((k) => emprestimosPorContrato[k]!);
    const marcasGrupo = new Set<MergeMarca>();
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a]!;
        const j = idxs[b]!;
        const k = `${Math.min(i, j)}|${Math.max(i, j)}`;
        const ms = marcasPorPar.get(k);
        if (ms) for (const m of ms) marcasGrupo.add(m);
      }
    }
    const flags = idxs.map((k) => coexistIdx[k]!);
    grupos.push(montarGrupo(`grp-${gid++}`, cs, marcasGrupo, flags));
  }

  for (const s of suspeitasRefinanciamento) {
    const tituloBase =
      s.nivel === "provavel"
        ? "Hipótese analítica: provável refinanciamento"
        : "Hipótese analítica: possível refinanciamento";
    const trechoCrit = s.criterios.slice(0, 2).join(" ");
    alertas.push({
      id: s.id,
      nivel: s.nivel === "provavel" ? "aviso" : "info",
      titulo: tituloBase,
      detalhe: `${s.instituicao}. ${s.mensagem} (${trechoCrit})`,
    });
  }

  for (const g of grupos) {
    if (g.tipoConsolidacao === "possivel_mesmo_contrato") {
      alertas.push({
        id: `duvida-grupo-${g.grupoId}`,
        nivel: "aviso",
        titulo: "Possível duplicidade ou agrupamento incerto",
        detalhe: `${g.instituicao}: revise manualmente — sinais mistos (${g.contratosOriginais.length} linhas).`,
      });
    }
    if (g.scoreConfianca < 55 && g.contratosOriginais.length > 1) {
      alertas.push({
        id: `conf-baixa-${g.grupoId}`,
        nivel: "info",
        titulo: "Confiança baixa na consolidação",
        detalhe: `Grupo «${g.descricaoPrincipal.slice(0, 56)}${g.descricaoPrincipal.length > 56 ? "…" : ""}» (score ${g.scoreConfianca}).`,
      });
    }
  }

  return { grupos, alertas, suspeitasRefinanciamento };
}

/** Namespace opcional para reexportar a função principal com o nome pedido no requisito. */
export const consolidacaoLogicaEmprestimos = {
  consolidar: consolidarEmprestimosPorPadraoLogico,
  normalizarInstituicao: normalizarInstituicaoLogica,
};
