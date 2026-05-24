import type { ParsedPayslipPayload } from "./sead-payslip-parse";

function normChars(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sugere se o PDF é a **folha especial** (ex. só 13º / adiantamentos) ou o **mensal principal**,
 * quando o SEAD emite **dois contracheques no mesmo DATA/competência**.
 */
export function inferContrachequeEmitSugestao(
  fileName: string,
  rawText: string,
  parsed: ParsedPayslipPayload
): "folha_especial" | "mensal_principal" {
  const fn = normChars(fileName.replace(/\s+/g, ""));
  const tx = normChars(rawText);
  const blob = normChars(parsed.items.map((i) => `${i.code ?? ""} ${i.description}`).join(" | "));

  if (
    /folha[_\s-]*(esp|especial)|folhaespecial|2a[_\s.-]*folha|segunda[_\s.-]*folha|especial\.|\bespecial\b|adic13|adic_13|13[_\s.-]*sal|decimo|13o|13º|13[_-]?adic|extraordin|suplement/.test(
      fn
    )
  ) {
    return "folha_especial";
  }
  if (/folha especial|13\.?\s*salario adiant|13\.?\s*sal adiant|antec.*13|132o/.test(tx)) {
    return "folha_especial";
  }

  const hints13 =
    /\bdesc\.?\s*13\b|\b13\.?\s*sal\b|\bsal\.?\s*adiant\b|\bantec\.?\s*13|\b13o\.?\s*sal\b|\bdec\.?\s*13\b/.test(
      blob
    );
  const poucosDescontos = parsed.totalDiscounts < 220;
  const soGanhosOuQuase =
    parsed.items.length > 0 && parsed.items.every((i) => i.type === "vantagem");
  const soldoFort =
    /\bsoldo\b|\b0075\b/.test(blob) &&
    parsed.items.some((i) => /soldo/i.test(i.description) && i.value >= 2500);

  if (hints13 && poucosDescontos && soGanhosOuQuase && !soldoFort) return "folha_especial";
  if (hints13 && parsed.items.length > 0 && parsed.items.length <= 10 && poucosDescontos && !soldoFort) {
    return "folha_especial";
  }

  return "mensal_principal";
}
