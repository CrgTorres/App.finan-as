import { normalizarTexto } from "@/lib/extratos/extrato-parser-core";
import { isMercadoPagoExtratoText } from "@/lib/extratos/parse-mercado-pago-pdf";

export type TipoExtrato =
  | "nubank"
  | "mercado_pago"
  | "bradesco"
  | "csv"
  | "generico";

export function detectarTipoExtrato(texto: string, fileName?: string): TipoExtrato {
  const nome = fileName?.toLowerCase() ?? "";
  const n = normalizarTexto(texto);

  if (nome.endsWith(".csv")) return "csv";

  if (isMercadoPagoExtratoText(texto)) {
    return "mercado_pago";
  }

  if (
    n.includes("nu pagamentos") ||
    n.includes("nu financeira") ||
    n.includes("nubank") ||
    n.includes("saldo final do periodo")
  ) {
    return "nubank";
  }

  if (n.includes("bradesco celular")) return "bradesco";

  return "generico";
}
