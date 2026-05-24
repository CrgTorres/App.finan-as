/**
 * Exibe nomes de IF de forma estável no filtro e nas tabelas da auditoria,
 * corrigindo OCR/siglas comuns (ex.: «Joosjo» → Banco Panamericano, «BIB» → Banco Industrial).
 */

function termoCasa(texto: string, termo: string): boolean {
  if (termo === "bb") return /\bbb\b/.test(texto);
  if (termo === "c6") return /\bc6\b/.test(texto);
  return texto.includes(termo);
}

export function normalizarNomeBanco(valor?: string | null): string {
  if (!valor) return "Não identificado";

  const textoOriginal = valor.trim();

  const texto = textoOriginal
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const regras: Array<{
    termos: string[];
    banco: string;
  }> = [
    {
      termos: [
        "joosjo",
        "josjo",
        "joosj",
        "jooj",
        "panamericano",
        "banco panamericano",
      ],
      banco: "Banco Panamericano",
    },
    {
      termos: ["bmg"],
      banco: "Banco BMG",
    },
    {
      termos: ["bradesco"],
      banco: "Banco Bradesco",
    },
    {
      termos: ["itau"],
      banco: "Banco Itaú",
    },
    {
      termos: ["santander"],
      banco: "Banco Santander",
    },
    {
      termos: ["caixa", "cef"],
      banco: "Caixa Econômica Federal",
    },
    {
      termos: ["bco do brasil", "banco do brasil", "bb"],
      banco: "Banco do Brasil",
    },
    {
      termos: ["bib", "banco industrial", "banco industrial do brasil"],
      banco: "Banco Industrial do Brasil",
    },
    {
      termos: ["b daycoval", "bdaycoval", "daycoval"],
      banco: "Banco Daycoval",
    },
    {
      termos: ["ole"],
      banco: "Banco Olé",
    },
    {
      termos: ["facta"],
      banco: "Facta Financeira",
    },
    {
      termos: ["c6"],
      banco: "C6 Bank",
    },
  ];

  const regraEncontrada = regras.find((regra) => regra.termos.some((termo) => termoCasa(texto, termo)));

  return regraEncontrada?.banco ?? textoOriginal;
}
