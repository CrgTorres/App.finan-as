/**
 * Filtro de natureza consignável — delega ao motor estrutural
 * (`identificar-passivo-consignavel-estrutural.ts`).
 * Valor parecido ou ConsigFácil isolado não classificam rubrica como consignável.
 */

import type { ConsigfacilAjusteBase } from "@/types/consigfacil";
import {
  elegivelCorrelacaoPassivoConsignavel,
  identificarPassivoConsignavelEstrutural,
  type EntradaLinhaPassivo,
} from "@/lib/conciliacao/identificar-passivo-consignavel-estrutural";

const TERMOS_NAO_CONSIGNAVEIS = [
  "IMPOSTO",
  "IR",
  "IRRF",
  "AMAZONPREV",
  "PREV",
  "PREVID",
  "FGTS",
  "SOLDO",
  "ETAPAS",
  "GRAT",
  "GRATIF",
  "REAJ",
  "ADICIONAL",
  "FERIAS",
  "13",
  "DECIMO",
  "SERV.EXTRA",
  "SERV EXTRA",
  "ABONO",
  "PENSAO",
  "APPBMAM",
  "APEAM",
  "RETORNO",
  "FPPM",
  "CONTRIB",
  "DIFERENCA",
  "DIF SAL",
  "PMAM",
  "AMAZONAS ENERGIA",
  "ENERGIA",
  "CONTA DE LUZ",
  "AGUAS",
  "AGUA",
  "INTERNET",
  "TELEFONE",
  "TELEFONIA",
  "CONTA DE AGUA",
] as const;

/** Conta de consumo / utilidade — fora da conciliação consignável. */
export function rubricaEhContaConsumo(descricao?: string | null): boolean {
  if (!descricao?.trim()) return false;
  const n = normalizarTextoRubricaConsignavel(descricao);
  const termos = [
    "AMAZONAS ENERGIA",
    "CONTA DE LUZ",
    "CONTA DE AGUA",
    "CONTA DE ÁGUA",
    "ENERGIA ELETRICA",
    "TELEFONE",
    "TELEFONIA",
    "INTERNET",
    "AGUAS E ENERGIA",
  ] as const;
  if (termos.some((t) => n.includes(t.replace(/Á/g, "A")))) return true;
  if (n.includes("AMAZONAS") && n.includes("ENERGIA")) return true;
  if (/\bENERGIA\b/.test(n) && !/\b(EMPREST|CONSIGN|BANCO|BMG|DAYCOVAL)\b/.test(n)) return true;
  if (contemTermo(n, "AGUAS") || contemTermo(n, "AGUA")) {
    return n.includes("ENERGIA") || n.includes("CONTA") || n.includes("TELEFONE");
  }
  return false;
}

const TERMOS_CONSIGNAVEIS = [
  "EMPRESTIMO",
  "EMPRÉSTIMO",
  "BB-EMP",
  "BB EMP",
  "BIB",
  "BMG",
  "DAYCOVAL",
  "CAIXA EMP",
  "CREDICESTA",
  "SAQUE",
  "RMC",
  "RCC",
  "CARTAO",
  "CARTÃO",
  "PAN",
  "PANAMERICANO",
  "BANCO PAN",
  "SICOOB",
  "BANCOOB",
  "CONSIGNADO",
  "FINANCEIRA",
] as const;

/** Termos curtos exigem limite de palavra para evitar falso positivo (ex.: IR em DIREITO). */
const TERMOS_CURTOS_LIMITE_PALAVRA = new Set(["IR", "13", "FGTS", "RMC", "RCC", "PAN", "BIB", "BMG"]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normaliza rubrica para busca por termos (maiúsculas, sem acento). */
export function normalizarTextoRubricaConsignavel(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contemTermo(textoNormalizado: string, termo: string): boolean {
  const t = normalizarTextoRubricaConsignavel(termo);
  if (!t) return false;

  if (TERMOS_CURTOS_LIMITE_PALAVRA.has(t)) {
    return new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(t)}(?:[^A-Z0-9]|$)`).test(textoNormalizado);
  }

  if (textoNormalizado.includes(t)) return true;

  const semEspacos = t.replace(/ /g, "");
  if (semEspacos.length >= 4 && textoNormalizado.replace(/ /g, "").includes(semEspacos)) {
    return true;
  }

  return false;
}

/** Rubrica em DESCONTOS com estrutura de passivo consignável (sem exigir score mínimo). */
export function ehRubricaConsignavel(
  descricao?: string | null,
  extras?: Omit<EntradaLinhaPassivo, "descricao">,
): boolean {
  if (!descricao?.trim() && !extras?.codigo_rubrica) return false;
  return identificarPassivoConsignavelEstrutural({
    descricao,
    natureza: extras?.natureza ?? "desconto",
    ...extras,
  }).consignavel;
}

/** Correlação ConsigFácil: exige score estrutural ≥ 50. */
export function ehRubricaElegivelCorrelacaoConsigfacil(
  descricao?: string | null,
  extras?: Omit<EntradaLinhaPassivo, "descricao">,
): boolean {
  if (!descricao?.trim() && !extras?.codigo_rubrica) return false;
  return elegivelCorrelacaoPassivoConsignavel({
    descricao,
    natureza: extras?.natureza ?? "desconto",
    ...extras,
  });
}

export type EntradaTextoRubricaLinha = {
  descricao?: string | null;
  descricao_normalizada?: string | null;
  descricao_original?: string | null;
  description?: string | null;
};

export function textoRubricaLinha(linha: EntradaTextoRubricaLinha): string {
  return (
    linha.descricao_original?.trim() ||
    linha.descricao?.trim() ||
    linha.descricao_normalizada?.trim() ||
    linha.description?.trim() ||
    ""
  );
}

export function linhaEhRubricaConsignavel(linha: EntradaTextoRubricaLinha): boolean {
  return ehRubricaConsignavel(textoRubricaLinha(linha), { natureza: "desconto" });
}

export function linhaEhElegivelCorrelacaoConsigfacil(linha: EntradaTextoRubricaLinha): boolean {
  return ehRubricaElegivelCorrelacaoConsigfacil(textoRubricaLinha(linha), { natureza: "desconto" });
}

export function textoRubricaAjuste(
  a: ConsigfacilAjusteBase,
  resolver?: (ajuste: ConsigfacilAjusteBase) => string | null | undefined,
): string {
  const custom = resolver?.(a)?.trim();
  if (custom) return custom;

  const mLinha = /Linha\s+([^:]+):/i.exec(a.motivo_ajuste);
  if (mLinha?.[1]?.trim()) return mLinha[1].trim();

  const mInst = /cadastro\s+"([^"]+)"/i.exec(a.motivo_ajuste);
  if (mInst?.[1]?.trim()) return mInst[1].trim();

  return a.alvo_id;
}

export function ajusteEhRubricaConsignavel(
  a: ConsigfacilAjusteBase,
  resolver?: (ajuste: ConsigfacilAjusteBase) => string | null | undefined,
): boolean {
  return ehRubricaConsignavel(textoRubricaAjuste(a, resolver));
}
