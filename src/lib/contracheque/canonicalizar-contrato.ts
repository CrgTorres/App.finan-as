/**
 * Canonicalização só para apresentação: não altera dados de origem nem agregações.
 * Deduplica linhas inferidas equivalentes (OCR “sujo” vs. texto normalizado).
 */

import type { EmprestimoContratoAnalise } from "@/lib/anexos/analise-financeira-contracheque-padroes";
import { normalizarInstituicaoLogica } from "@/lib/anexos/consolidacao-logica-emprestimos";
import { normSlugRubricaLoanMatch } from "@/lib/anexos/emprestimos-cruzamento-loans";
import { rubricaSemParcelaParaChave } from "@/lib/anexos/parcela-consignado";
import { padronizarTokensRubricaOficiais } from "@/lib/anexos/rubrica-nomes-oficiais";
import { formatarParcelaDisplay, extrairParcela } from "@/lib/contracheque/extrair-parcela";

const RE_JOOA_BLOCO = /\bJooa\s*\/\s*\d{1,3}\b/gi;
const RE_JOOA = /\bJooa\b/gi;
const RE_TRAILING_V = /\s+v\.?\(*\)?\s*$/i;
/** Só total residual após lixo OCR (ex.: « /120»). */
const RE_SLASH_TOTAL_RESIDUAL = /\s+\/\s*\d{1,3}\s*$/;
/** Parcela lida como dois blocos finais sem barra (ex.: «BANCOOB EMPRESTIMO 033 048»). */
const RE_TRAILING_PARCELA_SEM_BARRA = /\s+\d{1,3}\s+\d{2,3}\s*$/;
const RE_ESPACOS_MULTI = /\s+/g;

export function limparLixoOcrDescricao(descricaoBruta: string): string {
  let s = (descricaoBruta ?? "").trim();
  if (!s) return "";
  s = s.replace(RE_JOOA_BLOCO, " ");
  s = s.replace(RE_JOOA, " ");
  s = rubricaSemParcelaParaChave(s);
  s = s.replace(RE_TRAILING_PARCELA_SEM_BARRA, "").trim();
  s = s.replace(RE_SLASH_TOTAL_RESIDUAL, "").trim();
  s = s.replace(RE_TRAILING_V, "").trim();
  s = padronizarTokensRubricaOficiais(s);
  s = s.replace(RE_ESPACOS_MULTI, " ").trim();
  return s;
}

export function montarChaveCanonicaContrato(
  codigo: string,
  descricaoLimpa: string,
  valorParcela: number,
): string {
  const cod = (codigo ?? "").replace(/\D/g, "").trim();
  const desc = descricaoLimpa
    .replace(RE_TRAILING_PARCELA_SEM_BARRA, "")
    .replace(RE_ESPACOS_MULTI, " ")
    .trim()
    .toUpperCase();
  const val = (Math.round(Number(valorParcela) * 100) / 100).toFixed(2);
  if (cod && Number.isFinite(Number(valorParcela)) && Number(valorParcela) > 0) {
    return `${cod}|${val}`;
  }
  return `${cod}|${desc}|${val}`;
}

/** Família de produto na rubrica (ignora lixo OCR e códigos soltos). */
function familiaProdutoRubrica(c: EmprestimoContratoAnalise): string {
  const limpa = limparLixoOcrDescricao(c.descricao).toUpperCase();
  if (/\bCART|RCC|RMC\b/.test(limpa)) return "cart";
  if (/\bSAQUE|CREDCESTA|CRED\s*CESTA|MILICRED/i.test(limpa)) return "saq";
  if (
    /\bEMPREST|\bEMP\b|BB\s*[- ]?\s*EMP|EMPO?\d|EMP\d{1,3}\b/i.test(limpa) ||
    /\bEMP\b/i.test(c.instituicaoDetectada ?? "")
  ) {
    return "emp";
  }
  const slug = normSlugRubricaLoanMatch(`${c.instituicaoDetectada ?? ""} ${limpa}`);
  return slug.slice(0, 16) || "outros";
}

function montarChaveFamiliaContrato(c: EmprestimoContratoAnalise): string {
  const cod = (c.codigo ?? "").replace(/\D/g, "").trim();
  const inst = normalizarInstituicaoLogica(c);
  const fam = familiaProdutoRubrica(c);
  if (cod.length >= 4) return `${cod}|${inst}|${fam}`;
  const desc = limparLixoOcrDescricao(c.descricao)
    .toUpperCase()
    .replace(/\b\d{1,3}\b/g, " ")
    .replace(RE_ESPACOS_MULTI, " ")
    .trim();
  if (cod && desc) return `${cod}|${inst}|${desc}`;
  return montarChaveCanonicaContrato(c.codigo, desc, c.valorParcela);
}

function maxRisco(a: EmprestimoContratoAnalise["risco"], b: EmprestimoContratoAnalise["risco"]) {
  const rank = { baixo: 1, medio: 2, alto: 3 } as const;
  return rank[b] > rank[a] ? b : a;
}

function parseMesKey(k: string): { year: number; month: number } | null {
  const m = k.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
}

function competenciaOrd(k: string): number {
  const p = parseMesKey(k);
  return p ? p.year * 12 + (p.month - 1) : 0;
}

function arredondarCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}

function valorMaisRecorrente(valores: number[], preferido: number): number {
  const frequencias = new Map<string, { valor: number; count: number }>();
  for (const valor of valores) {
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const arredondado = arredondarCentavos(valor);
    const key = arredondado.toFixed(2);
    const atual = frequencias.get(key);
    if (atual) atual.count += 1;
    else frequencias.set(key, { valor: arredondado, count: 1 });
  }

  let melhor: { valor: number; count: number } | null = null;
  for (const entrada of frequencias.values()) {
    if (!melhor || entrada.count > melhor.count) {
      melhor = entrada;
      continue;
    }
    if (entrada.count === melhor.count) {
      const diffAtual = Math.abs(entrada.valor - preferido);
      const diffMelhor = Math.abs(melhor.valor - preferido);
      if (diffAtual < diffMelhor) melhor = entrada;
    }
  }
  return melhor?.valor ?? preferido;
}

function consolidarCandidatosFamilia(candidatos: EmprestimoContratoAnalise[]): EmprestimoContratoAnalise {
  const sorted = [...candidatos].sort(ordenarCandidatosPorQualidade);
  const winner = sorted[0]!;
  if (candidatos.length === 1) return winner;

  const porMes = new Map<string, number>();
  for (const c of candidatos) {
    const meses = c.mesesDetectados.length ? c.mesesDetectados : [c.primeiraAparicao];
    for (const mes of meses) {
      porMes.set(mes, Math.max(porMes.get(mes) ?? 0, c.valorParcela));
    }
  }
  const mesesOrdenados = [...porMes.keys()].sort((a, b) => competenciaOrd(a) - competenciaOrd(b));
  const valoresMes = [...porMes.values()].filter((v) => Number.isFinite(v) && v > 0);
  const valorParcelaLogica = valoresMes.length > 0 ? valorMaisRecorrente(valoresMes, winner.valorParcela) : winner.valorParcela;
  const totalPagoPorMes = arredondarCentavos(valoresMes.reduce((s, v) => s + v, 0));

  const parcelasIniciais = candidatos.map((c) => c.parcelaInicialDetectada).filter((v): v is number => v != null);
  const parcelasFinais = candidatos.map((c) => c.parcelaFinalDetectada).filter((v): v is number => v != null);
  const totaisParcelas = candidatos.map((c) => c.totalParcelas).filter((v): v is number => v != null && v > 1);
  const totalParcelas = totaisParcelas.length ? Math.max(...totaisParcelas) : winner.totalParcelas;
  const totalPago =
    totalPagoPorMes > 0
      ? totalPagoPorMes
      : Math.round(candidatos.reduce((s, c) => s + c.totalPago, 0) * 100) / 100;
  const valorProjetadoContrato =
    totalParcelas && totalParcelas > 1 ? arredondarCentavos(valorParcelaLogica * totalParcelas) : null;
  const saldoEstimado =
    valorProjetadoContrato != null ? Math.round(Math.max(0, valorProjetadoContrato - totalPago) * 100) / 100 : null;
  const status = candidatos.some((c) => c.status === "ativo/em andamento")
    ? "ativo/em andamento"
    : candidatos.some((c) => c.status === "inconsistente")
      ? "inconsistente"
      : "finalizado";
  const risco = candidatos.reduce((acc, c) => maxRisco(acc, c.risco), "baixo" as EmprestimoContratoAnalise["risco"]);

  return {
    ...winner,
    descricao: limparLixoOcrDescricao(winner.descricao) || winner.descricao,
    valorParcela: valorParcelaLogica,
    parcelaInicialDetectada: parcelasIniciais.length ? Math.min(...parcelasIniciais) : winner.parcelaInicialDetectada,
    parcelaFinalDetectada: parcelasFinais.length ? Math.max(...parcelasFinais) : winner.parcelaFinalDetectada,
    totalParcelas,
    primeiraAparicao: mesesOrdenados[0] ?? winner.primeiraAparicao,
    ultimaAparicao: mesesOrdenados[mesesOrdenados.length - 1] ?? winner.ultimaAparicao,
    quantidadeAparicoes: mesesOrdenados.length || candidatos.reduce((s, c) => s + c.quantidadeAparicoes, 0),
    mesesDetectados: mesesOrdenados,
    mesesFaltantesProvaveis: [...new Set(candidatos.flatMap((c) => c.mesesFaltantesProvaveis))],
    totalPago,
    valorProjetadoContrato,
    saldoEstimado,
    status,
    risco,
    observacoes: [
      ...new Set([
        ...candidatos.flatMap((c) => c.observacoes),
        `Consolidado por raciocínio lógico: ${candidatos.length} variação(ões) da mesma rubrica/código; parcela exibida usa o valor fixo mais recorrente por competência.`,
      ]),
    ],
  };
}

function indicadoresLixoOcr(descricaoBruta: string): number {
  let n = 0;
  if (/\bJooa\b/i.test(descricaoBruta)) n += 2;
  if (RE_TRAILING_V.test(descricaoBruta.trim())) n += 1;
  if (/\s{2,}/.test(descricaoBruta)) n += 1;
  if (/[^\p{L}\p{N}\s\-/().]|_/u.test(descricaoBruta.replace(/[\d\s/().-]/g, ""))) n += 1;
  return n;
}

function parcelaEstruturadaPlausivel(c: EmprestimoContratoAnalise): boolean {
  return (
    c.totalParcelas != null &&
    c.totalParcelas > 1 &&
    c.parcelaInicialDetectada != null &&
    c.parcelaFinalDetectada != null &&
    c.parcelaFinalDetectada <= c.totalParcelas &&
    c.parcelaInicialDetectada >= 1
  );
}

/** Prioridade maior = melhor candidato a linha exibida. */
export function pontuacaoApresentacaoContrato(c: EmprestimoContratoAnalise): number {
  let p = 0;
  if (c.tipoContrato === "parcelado" && parcelaEstruturadaPlausivel(c)) p += 500;
  else if (c.totalParcelas != null && c.totalParcelas > 1 && c.parcelaInicialDetectada != null) p += 350;
  else if (c.tipoContrato === "parcelado") p += 120;
  if (c.tipoContrato === "recorrente_01_01") p += 80;

  const limpa = limparLixoOcrDescricao(c.descricao);
  const raw = c.descricao.trim();
  if (raw.length > 0) {
    p += Math.min(120, Math.round((limpa.length / raw.length) * 100));
  }
  p += Math.max(0, 80 - indicadoresLixoOcr(c.descricao) * 25);
  p += Math.min(60, limpa.length);
  p += Math.min(150, c.quantidadeAparicoes * 5);
  p += Math.min(80, Math.round(c.totalPago / 50));
  return p;
}

export function montarSubtituloParcelaContrato(c: EmprestimoContratoAnalise): string | null {
  if (c.tipoContrato === "recorrente_01_01") {
    return "Parcela 01/01";
  }
  if (c.totalParcelas != null && c.totalParcelas > 0) {
    const atual = c.parcelaFinalDetectada ?? c.parcelaInicialDetectada;
    if (atual != null && atual >= 1 && atual <= c.totalParcelas) {
      return `Parcela ${formatarParcelaDisplay(atual, c.totalParcelas)}`;
    }
  }
  const ext = extrairParcela(c.descricao);
  if (ext && ext.total <= 200 && ext.atual <= ext.total) {
    return `Parcela ${formatarParcelaDisplay(ext.atual, ext.total)}`;
  }
  return null;
}

export type ContratoLinhaApresentacao = {
  chaveCanonica: string;
  /** Registro escolhido (dados completos; mesmas referências da origem). */
  contrato: EmprestimoContratoAnalise;
  /** Título limpo — nunca o OCR bruto sujo. */
  titulo: string;
  subtituloParcela: string | null;
  /** Textos originais das linhas deduplicadas — só para tooltip/debug. */
  origensOCRBruta: string[];
};

function ordenarCandidatosPorQualidade(a: EmprestimoContratoAnalise, b: EmprestimoContratoAnalise): number {
  const pa = pontuacaoApresentacaoContrato(a);
  const pb = pontuacaoApresentacaoContrato(b);
  if (pb !== pa) return pb - pa;
  if (b.quantidadeAparicoes !== a.quantidadeAparicoes) return b.quantidadeAparicoes - a.quantidadeAparicoes;
  if (b.totalPago !== a.totalPago) return b.totalPago - a.totalPago;
  return a.descricao.length - b.descricao.length;
}

/**
 * Deduplica pela chave código + descrição limpa + valor.
 * Mantém um único registro “vencedor” por chave; demais entram só em `origensOCRBruta`.
 */
export function deduplicarContratosParaApresentacao(
  contratos: EmprestimoContratoAnalise[],
): ContratoLinhaApresentacao[] {
  const buckets = new Map<string, EmprestimoContratoAnalise[]>();
  for (const c of contratos) {
    const chave = montarChaveFamiliaContrato(c);
    const arr = buckets.get(chave);
    if (arr) arr.push(c);
    else buckets.set(chave, [c]);
  }
  const out: ContratoLinhaApresentacao[] = [];
  for (const [chave, candidatos] of buckets) {
    const winner = consolidarCandidatosFamilia(candidatos);
    const tituloLimpo = limparLixoOcrDescricao(winner.descricao);
    const titulo = tituloLimpo || winner.descricao.trim() || "—";
    const brutoUnicos = [...new Set(candidatos.map((x) => x.descricao.trim()).filter(Boolean))];
    out.push({
      chaveCanonica: chave,
      contrato: winner,
      titulo,
      subtituloParcela: montarSubtituloParcelaContrato(winner),
      origensOCRBruta: brutoUnicos,
    });
  }
  out.sort((a, b) => a.chaveCanonica.localeCompare(b.chaveCanonica, "pt-BR", { sensitivity: "base" }));
  return out;
}

/** Lista de contratos vencedores (uma entrada por chave canônica) — útil para métricas alinhadas à UI. */
export function contratosVencedoresCanonico(contratos: EmprestimoContratoAnalise[]): EmprestimoContratoAnalise[] {
  return deduplicarContratosParaApresentacao(contratos).map((l) => l.contrato);
}
