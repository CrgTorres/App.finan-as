/** Termos prioritários em rubricas de desconto (ordem: frases longas antes de curtas). */
export const TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE: readonly {
  termo: string;
  riscoBase: "medio" | "alto";
}[] = [
  { termo: "CREDCESTA SAQUE", riscoBase: "alto" },
  { termo: "CRED CESTA SAQUE", riscoBase: "alto" },
  { termo: "CREDCESTA COMPRA", riscoBase: "medio" },
  { termo: "CRED CESTA COMPRA", riscoBase: "medio" },
  { termo: "CRED CESTA", riscoBase: "medio" },
  { termo: "CRED CARTAO", riscoBase: "medio" },
  { termo: "CRED CARTÃO", riscoBase: "medio" },
  { termo: "CREDCARTAO", riscoBase: "medio" },
  { termo: "CREDCARTÃO", riscoBase: "medio" },
  { termo: "CREDCESTA", riscoBase: "medio" },
  { termo: "CARTAO CONSIGNADO", riscoBase: "medio" },
  { termo: "CARTÃO CONSIGNADO", riscoBase: "medio" },
  { termo: "CARTAO BENEFICIO", riscoBase: "medio" },
  { termo: "CARTÃO BENEFÍCIO", riscoBase: "medio" },
  { termo: "RESERVA DE MARGEM", riscoBase: "alto" },
  { termo: "RESERVA MARGEM CONSIGNAVEL", riscoBase: "alto" },
  { termo: "SAQUE COMPLEMENTAR", riscoBase: "alto" },
  { termo: "SAQUE CARTAO", riscoBase: "alto" },
  { termo: "SAQUE CARTÃO", riscoBase: "alto" },
  { termo: "SAQUE", riscoBase: "alto" },
  { termo: "PAGAMENTO MINIMO", riscoBase: "alto" },
  { termo: "PAGAMENTO MÍNIMO", riscoBase: "alto" },
  { termo: "PGTO MINIMO", riscoBase: "alto" },
  { termo: "PGTO MÍNIMO", riscoBase: "alto" },
  { termo: "FATURA CARTAO", riscoBase: "medio" },
  { termo: "FATURA CARTÃO", riscoBase: "medio" },
  { termo: "PARCELA CARTAO", riscoBase: "medio" },
  { termo: "PARCELA CARTÃO", riscoBase: "medio" },
  { termo: "DESCONTO CARTAO", riscoBase: "medio" },
  { termo: "MINIMO CARTAO", riscoBase: "alto" },
  { termo: "RMC", riscoBase: "alto" },
  { termo: "RCC", riscoBase: "alto" },
  { termo: "CARTAO", riscoBase: "medio" },
  { termo: "CARTÃO", riscoBase: "medio" },
] as const;

/** Lista ampla (OCR geral / legado). */
export const TERMOS_CARTAO_SAQUE_EMBUTIDO: readonly string[] = [
  ...TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE.map((t) => t.termo),
  "BANCO INDUSTRIAL DO BRASIL CARTAO",
  "BANCO INDUSTRIAL DO BRASIL CARTÃO",
  "CARTAO BMG",
  "CARTAO PAN",
  "CARTAO DAYCOVAL",
  "CARTAO BRADESCO",
  "CARTAO OLE",
  "CARTAO C6",
  "CARTAO FACTA",
  "MARGEM CONSIGNAVEL",
] as const;

export const TERMOS_CARTAO_ALTO_RISCO: readonly string[] = TERMOS_PRIORITARIOS_RUBRICA_CONTRACHEQUE.filter(
  (t) => t.riscoBase === "alto",
).map((t) => t.termo);

export const BANCOS_CARTAO_SAQUE: readonly { rotulos: string[]; nome: string }[] = [
  { rotulos: ["BANCO INDUSTRIAL DO BRASIL", "BIB", "INDUSTRIAL DO BRASIL"], nome: "Banco Industrial do Brasil" },
  { rotulos: ["CREDCESTA", "CRED CESTA"], nome: "Credcesta" },
  { rotulos: ["BMG", "CARTAO BMG"], nome: "BMG" },
  { rotulos: ["PAN", "CARTAO PAN", "PANAMERICANO"], nome: "PAN" },
  { rotulos: ["BRADESCO", "CARTAO BRADESCO"], nome: "Bradesco" },
  { rotulos: ["DAYCOVAL", "CARTAO DAYCOVAL"], nome: "Daycoval" },
  { rotulos: ["C6", "CARTAO C6", "C6 BANK"], nome: "C6" },
  { rotulos: ["OLE", "CARTAO OLE"], nome: "Olé" },
  { rotulos: ["FACTA", "CARTAO FACTA"], nome: "Facta" },
  { rotulos: ["ITAU", "ITAÚ", "ITAU UNIBANCO"], nome: "Itaú" },
  { rotulos: ["SANTANDER"], nome: "Santander" },
  { rotulos: ["CAIXA", "CEF"], nome: "Caixa" },
  { rotulos: ["BANCO DO BRASIL", "BB "], nome: "Banco do Brasil" },
] as const;
