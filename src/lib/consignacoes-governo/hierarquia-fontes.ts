/**
 * Hierarquia OFICIAL de fontes para qualquer campo financeiro.
 *
 *   1. ConsigFácil           (consigfacil_oficial)
 *   2. Contrato anexado      (contrato_anexado)
 *   3. Contracheque          (contracheque)
 *   4. Extrato bancário      (extrato_bancario)
 *   5. OCR                   (ocr)
 *   6. Inferência            (inferencia)
 *
 * Quando ConsigFácil confirma um campo, ele sobrescreve inferência/OCR/
 * estimativa automaticamente — mas o valor anterior NUNCA é apagado: ele
 * vira `valor_original` na auditoria.
 */

import type { FonteCanonicaFinanceira } from "@/types/consigfacil";

export const HIERARQUIA_FONTES: ReadonlyArray<FonteCanonicaFinanceira> = [
  "consigfacil_oficial",
  "contrato_anexado",
  "contracheque",
  "extrato_bancario",
  "ocr",
  "manual",
  "inferencia",
] as const;

/** Quanto menor o índice, mais oficial. */
export function rankFonte(f: FonteCanonicaFinanceira): number {
  const idx = HIERARQUIA_FONTES.indexOf(f);
  return idx === -1 ? HIERARQUIA_FONTES.length : idx;
}

/**
 * Aponta a fonte mais oficial entre `a` e `b`. Em empate, retorna `a` (estável).
 */
export function fonteMaisOficial(
  a: FonteCanonicaFinanceira,
  b: FonteCanonicaFinanceira,
): FonteCanonicaFinanceira {
  return rankFonte(a) <= rankFonte(b) ? a : b;
}

/**
 * Recebe candidatos `{fonte, valor}` e devolve o valor mais oficial cujo
 * `valor` não seja `null/undefined/""/0` (para números).
 *
 * Útil quando o pipeline ConsigFácil decide qual valor "vence" para
 * sobrescrever a base interna.
 */
export function resolverFonteCanonica<T>(
  candidatos: Array<{ fonte: FonteCanonicaFinanceira; valor: T | null | undefined }>,
  ehValido: (v: T) => boolean = (v) => v !== null && v !== undefined && v !== ("" as unknown) && v !== 0,
): { fonte: FonteCanonicaFinanceira; valor: T } | null {
  const ordenados = [...candidatos].sort((a, b) => rankFonte(a.fonte) - rankFonte(b.fonte));
  for (const c of ordenados) {
    if (c.valor != null && ehValido(c.valor as T)) {
      return { fonte: c.fonte, valor: c.valor as T };
    }
  }
  return null;
}

/**
 * Política específica para CONFIRMAÇÃO ConsigFácil:
 *
 *   - Se a fonte original era `inferencia`/`ocr`/`extrato_bancario`/`manual`
 *     → ConsigFácil pode sobrescrever em silêncio (com auditoria).
 *   - Se a fonte original era `contracheque`/`contrato_anexado`
 *     → ConsigFácil pode sobrescrever, MAS o evento de auditoria deve ser
 *     marcado como `divergencia_potencial` para revisão humana.
 *
 * Retorna `true` quando o sistema PODE corrigir automaticamente o campo.
 */
export function podeSobrescreverAutomaticamente(
  fonteOriginal: FonteCanonicaFinanceira,
): boolean {
  if (fonteOriginal === "consigfacil_oficial") return false; // já é oficial.
  // O sistema sempre pode sobrescrever — mas para `contracheque`/`contrato_anexado`
  // a auditoria marca como divergência potencial (caller decide).
  return rankFonte("consigfacil_oficial") < rankFonte(fonteOriginal);
}
