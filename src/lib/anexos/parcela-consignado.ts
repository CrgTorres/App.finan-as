/**
 * Parcela «paga / total» em rubricas de consignado SEAD:
 * `… 24/48`, `… 051 060`, `… 001001`, `… 024/0438` (OCR com 4º dígito no total).
 */

import { extrairParcela, formatarParcelaDisplay } from "@/lib/contracheque/extrair-parcela";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import { sanitizarModalidadeRubrica } from "@/lib/conciliacao/sanitizar-modalidade-rubrica";

const RE_PARCELA_FIM =
  /\s+(?:PARC(?:ELA)?\s+)?(\d{1,3})\s*[/\-.]\s*(\d{1,3})\s*$/i;

/** Ex.: `BANCO PANAMERICANO 002|072` (pipe no contracheque SEAD/AM). */
const RE_PARCELA_PIPE_FIM = /\s+(\d{1,3})\s*\|\s*(\d{1,3})\s*$/;

/** Ex.: `BB-EMP (76/88)` ou `DAYCOVAL EMP03 (02/120)`. */
const RE_PARCELA_PAREN_FIM =
  /\s*\(\s*(\d{1,3})\s*[/\-.]\s*(\d{1,3})\s*\)\s*$/i;

/** Ex.: `… 024/0438` — segundo grupo com 4 dígitos (OCR costuma inserir dígito no total, ex. 048→0438). */
const RE_PARCELA_FIM_SEG_4 =
  /\s+(?:PARC(?:ELA)?\s+)?(\d{1,3})\s*[/\-.]\s*(\d{4})\s*$/i;

/** Ex.: `BANCOOB EMPRESTIMO 051 060` (parcela / total com zeros à esquerda, sem barra). */
const RE_PARCELA_FIM_3_3 = /\s+(\d{3})\s+(\d{3})\s*$/;

/** Ex.: `CREDICESTA SAQUE 001001` (6 dígitos colados = 3+3, sem barra nem espaço). */
const RE_PARCELA_6_COLADO = /\s+(\d{3})(\d{3})\s*$/;

/** Ex.: `CAIXA EMPRESTIMO 0571060` — 7 dígitos (OCR perde espaço e insere dígito); 3+3 após remover 1 dígito. */
const RE_PARCELA_7_COLADO = /\s+(\d{7})\s*$/;

export type ParcelaExtraida = {
  baseDescription: string;
  parcelaAtual?: number;
  parcelaTotal?: number;
};

function parcelasSaoPlausiveis(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a < 1 || b < 1) return false;
  if (a > 600 || b > 600) return false;
  if (a > b) return false;
  return true;
}

/** Remove sufixo de parcela para cruzar o mesmo contrato entre meses (01/48 → 02/48). */
export function rubricaSemParcelaParaChave(description: string): string {
  let s = sanitizarModalidadeRubrica(description);
  s = s.replace(RE_PARCELA_PAREN_FIM, "").trim();
  s = s.replace(/\s*\(\d{1,3}\s*[/\-.]\s*\d{1,3}\)\s*$/i, "");
  s = s.replace(RE_PARCELA_FIM, "").trim();
  s = s.replace(RE_PARCELA_PIPE_FIM, "").trim();
  s = s.replace(RE_PARCELA_FIM_SEG_4, "").trim();
  s = s.replace(RE_PARCELA_FIM_3_3, "").trim();
  s = s.replace(RE_PARCELA_6_COLADO, "").trim();
  s = s.replace(RE_PARCELA_7_COLADO, "").trim();
  /** Sufixo numérico colado residual (OCR) para cruzar o mesmo contrato entre meses. */
  s = s.replace(/\s+\d{6,12}\s*$/i, "").trim();
  return s;
}

export function formatarParcelaLabel(atual: number, total: number): string {
  return `${String(atual).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
}

/** Exibição tipo OCR oficial (003/048). */
export function formatarParcelaExibicao(atual: number, total: number): string {
  return formatarParcelaDisplay(atual, total);
}

/**
 * Candidatos 3+3 após remover exatamente um dígito de um sufixo de 7 dígitos.
 * Usado quando há mais de um candidato e a competência vizinha fixa parcela/total.
 */
export function candidatosParcela7Digitos(description: string): ParcelaExtraida[] {
  const s = description.trim();
  const m = s.match(RE_PARCELA_7_COLADO);
  if (!m) return [];
  const raw7 = m[1];
  const idx = m.index ?? 0;
  const base = s.slice(0, idx).trim();
  if (base.length < 3) return [];
  const out: ParcelaExtraida[] = [];
  for (let i = 0; i < 7; i++) {
    const six = raw7.slice(0, i) + raw7.slice(i + 1);
    const a = parseInt(six.slice(0, 3), 10);
    const b = parseInt(six.slice(3), 10);
    if (parcelasSaoPlausiveis(a, b)) {
      out.push({ baseDescription: base, parcelaAtual: a, parcelaTotal: b });
    }
  }
  return out;
}

function tentarParcela7DigitosColadosUnico(s: string): ParcelaExtraida | null {
  const c = candidatosParcela7Digitos(s);
  return c.length === 1 ? c[0]! : null;
}

/**
 * Extrai N/M no fim da rubrica (após o nome do empréstimo / contrato).
 * Rejeita padrões que parecem data (ex.: … 10/2025).
 */
function extrairParcelaDoMatch(s: string, m: RegExpMatchArray): ParcelaExtraida | null {
  const rawA = parseInt(m[1], 10);
  const rawT = parseInt(m[2], 10);
  const v = validarEstruturaParcela(rawA, rawT);
  if (!v.valido) return null;
  const idx = m.index ?? 0;
  const base = s.slice(0, idx).trim();
  if (base.length < 3) return null;
  return {
    baseDescription: base,
    parcelaAtual: v.parcela_atual,
    parcelaTotal: v.total_parcelas,
  };
}

/**
 * Total com 4 dígitos: aceita valor literal se plausível; senão tenta remover 1 dígito (OCR ex.: 0438→048).
 * Entre vários válidos, prefere o maior total ≤240 (evita 24/38 quando existe 24/48).
 */
function resolverTotalQuatroDigitosOCR(atual: number, bStr: string): number | null {
  if (!/^\d{4}$/.test(bStr)) return null;
  const bFull = parseInt(bStr, 10);
  if (parcelasSaoPlausiveis(atual, bFull) && bFull <= 240) return bFull;

  const candidates: number[] = [];
  for (let i = 0; i < 4; i++) {
    const t = parseInt(bStr.slice(0, i) + bStr.slice(i + 1), 10);
    if (parcelasSaoPlausiveis(atual, t)) candidates.push(t);
  }
  if (candidates.length === 0) {
    return parcelasSaoPlausiveis(atual, bFull) ? bFull : null;
  }
  const under = candidates.filter((t) => t <= 240);
  const pool = under.length ? under : candidates;
  return Math.max(...pool);
}

function extrairParcelaSlashSegundoQuatroDigitos(s: string): ParcelaExtraida | null {
  const m = s.match(RE_PARCELA_FIM_SEG_4);
  if (!m) return null;
  const atual = parseInt(m[1], 10);
  const total = resolverTotalQuatroDigitosOCR(atual, m[2]);
  if (total == null) return null;
  const idx = m.index ?? 0;
  const base = s.slice(0, idx).trim();
  if (base.length < 3) return null;
  return { baseDescription: base, parcelaAtual: atual, parcelaTotal: total };
}

export function extrairParcelaConsignado(description: string): ParcelaExtraida {
  const s = sanitizarModalidadeRubrica(description);

  const mParen = s.match(RE_PARCELA_PAREN_FIM);
  if (mParen) {
    const out = extrairParcelaDoMatch(s, mParen);
    if (out) return out;
  }

  const mSlash = s.match(RE_PARCELA_FIM);
  if (mSlash) {
    const out = extrairParcelaDoMatch(s, mSlash);
    if (out) return out;
  }

  const mPipe = s.match(RE_PARCELA_PIPE_FIM);
  if (mPipe) {
    const out = extrairParcelaDoMatch(s, mPipe);
    if (out) return out;
  }

  const out4 = extrairParcelaSlashSegundoQuatroDigitos(s);
  if (out4) return out4;

  const mSpace = s.match(RE_PARCELA_FIM_3_3);
  if (mSpace) {
    const out = extrairParcelaDoMatch(s, mSpace);
    if (out) return out;
  }

  const m6 = s.match(RE_PARCELA_6_COLADO);
  if (m6) {
    const out = extrairParcelaDoMatch(s, m6);
    if (out) return out;
  }

  const m7 = tentarParcela7DigitosColadosUnico(s);
  if (m7) return m7;

  /** Último recurso: primeiro `N/M` plausível na linha (regras em `extrairParcela`). */
  const livre = extrairParcela(s);
  if (livre) {
    const base = s.replace(livre.texto, "").replace(/\s+/g, " ").trim();
    if (base.length >= 3) {
      return {
        baseDescription: base,
        parcelaAtual: livre.atual,
        parcelaTotal: livre.total,
      };
    }
  }

  return { baseDescription: s };
}
