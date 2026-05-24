/**
 * Validação estrutural de parcela atual / total (OCR e portal).
 * Evita inversões como «120 atual / 1 total» quando o padrão correto é 003/120.
 */

export type ResultadoValidacaoParcela = {
  valido: boolean;
  parcela_atual: number;
  total_parcelas: number;
  ocr_invalido: boolean;
  invertido_corrigido: boolean;
  motivo: string;
};

const MAX_PARCELA_PLAUSIVEL = 600;

function plausivel(atual: number, total: number): boolean {
  if (!Number.isFinite(atual) || !Number.isFinite(total)) return false;
  if (atual < 1 || total < 1) return false;
  if (atual > MAX_PARCELA_PLAUSIVEL || total > MAX_PARCELA_PLAUSIVEL) return false;
  return atual <= total;
}

/**
 * Valida e, quando possível, corrige inversão OCR (atual > total).
 */
export function validarEstruturaParcela(
  parcela_atual: number,
  total_parcelas: number,
): ResultadoValidacaoParcela {
  const a = Math.round(Number(parcela_atual) || 0);
  const t = Math.round(Number(total_parcelas) || 0);

  if (a <= 0 && t <= 0) {
    return {
      valido: false,
      parcela_atual: 0,
      total_parcelas: 0,
      ocr_invalido: true,
      invertido_corrigido: false,
      motivo: "Parcela atual e total ausentes ou zero.",
    };
  }

  if (plausivel(a, t)) {
    return {
      valido: true,
      parcela_atual: a,
      total_parcelas: t,
      ocr_invalido: false,
      invertido_corrigido: false,
      motivo: `Estrutura válida (${a}/${t}).`,
    };
  }

  if (plausivel(t, a)) {
    return {
      valido: true,
      parcela_atual: t,
      total_parcelas: a,
      ocr_invalido: false,
      invertido_corrigido: true,
      motivo: `OCR invertido corrigido: ${a}/${t} → ${t}/${a}.`,
    };
  }

  if (a > t) {
    return {
      valido: false,
      parcela_atual: a,
      total_parcelas: t,
      ocr_invalido: true,
      invertido_corrigido: false,
      motivo: `OCR inválido: parcela atual (${a}) > total (${t}).`,
    };
  }

  return {
    valido: false,
    parcela_atual: a,
    total_parcelas: t,
    ocr_invalido: true,
    invertido_corrigido: false,
    motivo: `Estrutura de parcela incoerente (${a}/${t}).`,
  };
}

/** Aplica validação a objeto com campos opcionais de parcela. */
export function normalizarParcelasContrato<T extends { parcela_atual?: number; parcelas_total?: number }>(
  ent: T,
): T & { parcela_atual: number; parcelas_total: number; parcela_ocr_invalida?: boolean } {
  const v = validarEstruturaParcela(ent.parcela_atual ?? 0, ent.parcelas_total ?? 0);
  return {
    ...ent,
    parcela_atual: v.parcela_atual,
    parcelas_total: v.total_parcelas,
    ...(v.ocr_invalido ? { parcela_ocr_invalida: true } : {}),
  };
}
