/**
 * Rubricas com identificador forte — não fundir automaticamente se divergirem.
 */

export const PESO_SCORE_MATCH_RUBRICA_FORTE = 40;

/** Slugs canônicos das rubricas com identificador forte. */
export const RUBRICAS_IDENTIFICADOR_FORTE = [
  "EMP01",
  "EMP02",
  "EMP03",
  "BB-EMP",
  "BIB CARTAO",
  "BANCOOB EMPRESTIMO",
] as const;

export type RubricaIdentificadorForte = (typeof RUBRICAS_IDENTIFICADOR_FORTE)[number];

const RE_EMP = /\bemp\s*0?(\d{1,2})\b/i;
const RE_BB_EMP = /\bbb[\s-]*emp\b/i;
const RE_BIB_CARTAO = /\bbib\s*cart[aã]o\b/i;
const RE_BANCOOB = /\bbancoob\s*emprestimo\b/i;

function normalizarTextoRubrica(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai slug forte de descrição, código de rubrica ou texto de contrato. */
export function extrairRubricaIdentificadorForte(
  texto: string | null | undefined,
  codigoRubrica?: string | null,
): RubricaIdentificadorForte | null {
  const partes = [texto, codigoRubrica].filter(Boolean).join(" ");
  if (!partes.trim()) return null;
  const t = normalizarTextoRubrica(partes);

  if (RE_BB_EMP.test(t)) return "BB-EMP";
  if (RE_BIB_CARTAO.test(t)) return "BIB CARTAO";
  if (RE_BANCOOB.test(t)) return "BANCOOB EMPRESTIMO";

  const mEmp = t.match(RE_EMP);
  if (mEmp) {
    const n = mEmp[1]!.padStart(2, "0");
    const slug = `EMP${n}` as RubricaIdentificadorForte;
    if (RUBRICAS_IDENTIFICADOR_FORTE.includes(slug)) return slug;
  }

  if (/\bEMP01\b/.test(t)) return "EMP01";
  if (/\bEMP02\b/.test(t)) return "EMP02";
  if (/\bEMP03\b/.test(t)) return "EMP03";

  return null;
}

export function rubricaIdentificadorForte(
  texto: string | null | undefined,
  codigoRubrica?: string | null,
): boolean {
  return extrairRubricaIdentificadorForte(texto, codigoRubrica) != null;
}

export type ResultadoCompatibilidadeRubrica = {
  compativel: boolean;
  rubrica_a: RubricaIdentificadorForte | null;
  rubrica_b: RubricaIdentificadorForte | null;
  rubrica_identificador_forte: boolean;
  motivo_bloqueio: string | null;
};

/**
 * Se ambos têm rubrica forte e diferem → bloqueio de fusão automática.
 */
export function avaliarCompatibilidadeRubrica(
  textoA: string | null | undefined,
  textoB: string | null | undefined,
  codigoA?: string | null,
  codigoB?: string | null,
): ResultadoCompatibilidadeRubrica {
  const rubrica_a = extrairRubricaIdentificadorForte(textoA, codigoA);
  const rubrica_b = extrairRubricaIdentificadorForte(textoB, codigoB);
  const forte = rubrica_a != null || rubrica_b != null;

  if (rubrica_a && rubrica_b && rubrica_a !== rubrica_b) {
    return {
      compativel: false,
      rubrica_a,
      rubrica_b,
      rubrica_identificador_forte: true,
      motivo_bloqueio: `Contrato NÃO fundido: rubrica ${rubrica_a} diverge de ${rubrica_b}.`,
    };
  }

  if (rubrica_a && rubrica_b && rubrica_a === rubrica_b) {
    return {
      compativel: true,
      rubrica_a,
      rubrica_b,
      rubrica_identificador_forte: true,
      motivo_bloqueio: null,
    };
  }

  return {
    compativel: true,
    rubrica_a,
    rubrica_b,
    rubrica_identificador_forte: forte,
    motivo_bloqueio: null,
  };
}
