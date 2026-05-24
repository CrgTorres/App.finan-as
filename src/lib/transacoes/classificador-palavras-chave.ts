import type { Category } from "@/types";
import { BLOCOS_RECEITA_CONSULTIVO, FRAGMENTOS_DESPESA_DICIONARIO } from "./dicionario-consultivo-extrato";

export type ResultadoClassificacaoImport = {
  category: Category;
  confiancaPct: number;
  motivo: string;
  /** forte ≥85%; média ≥65%; baixa (Outros) ≤30% */
  intensidade: "forte" | "media" | "baixa";
};

/** Remove marcas combinantes, lowercase — para includes e frases. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeReLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchPalavraInteira(textoNorm: string, palavraNorm: string): boolean {
  if (!palavraNorm.length) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeReLiteral(palavraNorm)}([^a-z0-9]|$)`);
  return re.test(textoNorm);
}

function bloqueadoMercadoGenerico(textoNorm: string): boolean {
  return textoNorm.includes("mercado livre") || textoNorm.includes("mercadopago");
}

function mercadoPalavraGenericaProibida(textoNorm: string): boolean {
  return (
    bloqueadoMercadoGenerico(textoNorm) ||
    (/\bmercado\s+pago\b/.test(textoNorm) && !textoNorm.includes("mercado autonomo"))
  );
}

function pctConfianca(forca: "forte" | "media", tamanhoTrecho: number): number {
  if (forca === "forte") return Math.min(92, 85 + Math.min(tamanhoTrecho, 12));
  return Math.min(78, 65 + Math.min(tamanhoTrecho, 12));
}

type RegraDespesa = Readonly<{
  /**
   * 1 = consumo / estabelecimento
   * 2 = boleto / fatura
   * 3 = transferência identificada (titular)
   * 4 = transferência enviada / pix enviado (fraca — só vale sem consumo nem boleto)
   */
  tier: 1 | 2 | 3 | 4;
  frases: readonly string[];
  palavrasInteiras?: readonly string[];
  categoria: Category;
  forca: "forte" | "media";
  etiquetaMotivo?: string;
  prioridade: number;
}>;

type Candidato = {
  tier: number;
  prioridade: number;
  kwLen: number;
  forca: "forte" | "media";
  category: Category;
  motivo: string;
};

function melhorCandidato(prev: Candidato | null, novo: Candidato): Candidato {
  if (!prev) return novo;
  if (novo.tier !== prev.tier) return novo.tier < prev.tier ? novo : prev;
  if (novo.prioridade !== prev.prioridade)
    return novo.prioridade > prev.prioridade ? novo : prev;
  if (novo.kwLen !== prev.kwLen)
    return novo.kwLen > prev.kwLen ? novo : prev;
  return novo.forca === "forte" && prev.forca === "media" ? novo : prev;
}

/**
 * Regras de despesa por palavra-chave/frase (`prioridade` resolve empates: marcas e frases específicas antes de genéricos).
 */
const REGRAS_DESPESA: readonly RegraDespesa[] = [
  /* --- Tier 1: marcas / estabelecimento (ganham de “pagamento” genérico) --- */
  { tier: 1, frases: ["raia drogasil"], prioridade: 8325, categoria: "Saúde", forca: "forte", etiquetaMotivo: "RAIA DROGASIL" },
  { tier: 1, frases: ["drogasil"], prioridade: 8320, categoria: "Saúde", forca: "forte", etiquetaMotivo: "DROGASIL" },
  {
    tier: 1,
    palavrasInteiras: ["raia"],
    frases: [],
    prioridade: 8312,
    categoria: "Saúde",
    forca: "forte",
    etiquetaMotivo: "RAIA",
  },
  { tier: 1, frases: ["mercado autonomo"], prioridade: 8162, categoria: "Mercado", forca: "forte", etiquetaMotivo: "MERCADO AUTÔNOMO" },
  { tier: 1, frases: ["lanches"], prioridade: 8078, categoria: "Alimentação", forca: "forte", etiquetaMotivo: "LANCHES" },
  { tier: 1, frases: ["uber"], prioridade: 8192, categoria: "Transporte", forca: "forte", etiquetaMotivo: "UBER" },

  /* --- Tier 2: fatura / empréstimo (antes de transferência fraca) --- */
  {
    tier: 2,
    frases: ["cartao de credito"],
    prioridade: 7260,
    categoria: "Cartão/Fatura",
    forca: "forte",
    etiquetaMotivo: "CARTÃO DE CRÉDITO",
  },
  {
    tier: 2,
    frases: ["debito por divida", "emprestimos mercado pago", "emprestimo mercado pago"],
    prioridade: 7245,
    categoria: "Empréstimo",
    forca: "forte",
    etiquetaMotivo: "EMPRÉSTIMO MP",
  },

  /* --- Tier 1: consumo / estabelecimento --- */
  { tier: 1, frases: ["ifood"], prioridade: 8200, categoria: "Alimentação", forca: "forte", etiquetaMotivo: "IFOOD" },
  { tier: 1, frases: ["coffee"], prioridade: 8180, categoria: "Alimentação", forca: "forte", etiquetaMotivo: "COFFEE" },
  { tier: 1, frases: ["youmart"], prioridade: 8170, categoria: "Mercado", forca: "forte", etiquetaMotivo: "YOUMART" },
  { tier: 1, frases: ["super nova"], prioridade: 8150, categoria: "Mercado", forca: "forte", etiquetaMotivo: "SUPER NOVA" },
  { tier: 1, frases: ["auto posto"], prioridade: 8140, categoria: "Combustível", forca: "forte", etiquetaMotivo: "AUTO POSTO" },
  {
    tier: 1,
    frases: ["refeicoes", "refeições", "panificadora", "confeitaria"],
    prioridade: 8120,
    categoria: "Alimentação",
    forca: "forte",
  },
  {
    tier: 1,
    frases: ["restaurante", "restaurantes"],
    prioridade: 8100,
    categoria: "Alimentação",
    forca: "forte",
    etiquetaMotivo: "RESTAURANTE",
  },
  { tier: 1, frases: ["churrascaria"], prioridade: 8080, categoria: "Alimentação", forca: "forte" },
  { tier: 1, frases: ["lanchonete"], prioridade: 8075, categoria: "Alimentação", forca: "forte" },
  { tier: 1, frases: ["esfirra"], prioridade: 8070, categoria: "Alimentação", forca: "forte" },
  { tier: 1, frases: ["espetinho"], prioridade: 8070, categoria: "Alimentação", forca: "forte" },
  {
    tier: 1,
    frases: ["combustivel", "combustível"],
    prioridade: 8060,
    categoria: "Combustível",
    forca: "forte",
    etiquetaMotivo: "COMBUSTÍVEL",
  },
  { tier: 1, frases: ["gasolina"], prioridade: 8055, categoria: "Combustível", forca: "forte" },
  { tier: 1, frases: ["farmacia", "farmácia"], prioridade: 8040, categoria: "Saúde", forca: "forte", etiquetaMotivo: "FARMÁCIA" },
  { tier: 1, frases: ["drogaria"], prioridade: 8035, categoria: "Saúde", forca: "forte" },
  { tier: 1, frases: ["medic"], prioridade: 8032, categoria: "Saúde", forca: "forte", etiquetaMotivo: "MEDIC" },
  { tier: 1, frases: ["hapvida"], prioridade: 8038, categoria: "Saúde", forca: "forte" },
  { tier: 1, frases: ["clinica", "clínica"], prioridade: 8028, categoria: "Saúde", forca: "forte" },
  {
    tier: 1,
    palavrasInteiras: ["claro"],
    frases: [],
    prioridade: 8020,
    categoria: "Conta de consumo",
    forca: "forte",
    etiquetaMotivo: "CLARO",
  },
  {
    tier: 1,
    palavrasInteiras: ["vivo"],
    frases: [],
    prioridade: 8020,
    categoria: "Conta de consumo",
    forca: "forte",
    etiquetaMotivo: "VIVO",
  },
  { tier: 1, frases: ["telefonica", "telefônica"], prioridade: 8015, categoria: "Conta de consumo", forca: "forte", etiquetaMotivo: "TELEFONICA" },
  { tier: 1, frases: ["energia"], prioridade: 8010, categoria: "Conta de consumo", forca: "forte" },
  { tier: 1, frases: ["internet"], prioridade: 8010, categoria: "Conta de consumo", forca: "forte" },
  { tier: 1, frases: ["daycoval"], prioridade: 8005, categoria: "Empréstimo", forca: "forte" },
  { tier: 1, frases: ["bancoob"], prioridade: 8005, categoria: "Empréstimo", forca: "forte" },
  { tier: 1, frases: ["credicesta"], prioridade: 8005, categoria: "Empréstimo", forca: "forte" },
  { tier: 1, frases: ["consignado"], prioridade: 8002, categoria: "Empréstimo", forca: "forte" },
  {
    tier: 1,
    frases: ["distribuidora"],
    prioridade: 7980,
    categoria: "Mercado",
    forca: "forte",
    etiquetaMotivo: "DISTRIBUIDORA",
  },
  { tier: 1, frases: ["supermercado"], prioridade: 7978, categoria: "Mercado", forca: "forte", etiquetaMotivo: "SUPERMERCADO" },
  {
    tier: 1,
    frases: ["mercado"],
    prioridade: 7962,
    categoria: "Mercado",
    forca: "forte",
    etiquetaMotivo: "MERCADO",
  },
  {
    tier: 1,
    frases: ["posto"],
    prioridade: 7977,
    categoria: "Combustível",
    forca: "forte",
    etiquetaMotivo: "POSTO",
  },
  { tier: 1, frases: ["cabify"], prioridade: 3190, categoria: "Transporte", forca: "media" },
  { tier: 1, frases: ["onibus", "ônibus"], prioridade: 3190, categoria: "Transporte", forca: "media" },
  { tier: 1, frases: ["metro"], prioridade: 3185, categoria: "Transporte", forca: "media", etiquetaMotivo: "METRÔ" },
  {
    tier: 1,
    frases: ["aluguel", "condominio", "iptu"],
    prioridade: 3150,
    categoria: "Moradia",
    forca: "media",
  },
  {
    tier: 1,
    frases: ["escola", "colegio", "faculdade"],
    prioridade: 3140,
    categoria: "Educação",
    forca: "media",
  },
  {
    tier: 1,
    frases: ["enel", "cemig", "copel", "sabesp", "cedae"],
    prioridade: 3138,
    categoria: "Conta de consumo",
    forca: "media",
  },

  /* --- Tier 2: boleto / fatura --- */
  {
    tier: 2,
    frases: ["pagamento de fatura"],
    prioridade: 7000,
    categoria: "Cartão/Fatura",
    forca: "forte",
    etiquetaMotivo: "pagamento de fatura",
  },
  {
    tier: 2,
    frases: ["ficha de compensacao", "ficha de compensação"],
    prioridade: 6900,
    categoria: "Boleto",
    forca: "forte",
    etiquetaMotivo: "ficha de compensação",
  },
  {
    tier: 2,
    frases: ["codigo de barras", "código de barras"],
    prioridade: 6880,
    categoria: "Boleto",
    forca: "forte",
    etiquetaMotivo: "código de barras",
  },
  { tier: 2, frases: ["boleto"], prioridade: 6850, categoria: "Boleto", forca: "forte" },
  {
    tier: 2,
    frases: ["fatura"],
    prioridade: 6820,
    categoria: "Cartão/Fatura",
    forca: "forte",
    etiquetaMotivo: "FATURA",
  },

  /* --- Tier 3: transferência identificada (titular) --- */
  {
    tier: 3,
    frases: [
      "transferencia enviada pelo pix carlos rodrigo gomes torres",
      "transferência enviada pelo pix carlos rodrigo gomes torres",
    ],
    prioridade: 6000,
    categoria: "Transferência própria",
    forca: "forte",
    etiquetaMotivo: "Transferência própria (titular)",
  },

  /* --- Tier 4: transferência genérica (fraca) --- */
  {
    tier: 4,
    frases: ["transferencia enviada", "transferência enviada"],
    prioridade: 900,
    categoria: "Transferência para terceiros",
    forca: "media",
    etiquetaMotivo: "transferência enviada",
  },
  {
    tier: 4,
    frases: ["pix enviado"],
    prioridade: 880,
    categoria: "Transferência para terceiros",
    forca: "media",
    etiquetaMotivo: "PIX ENVIADO",
  },
  ...FRAGMENTOS_DESPESA_DICIONARIO,
];

function primeiraEtiquetaFrase(regra: RegraDespesa, casou: string): string {
  if (regra.etiquetaMotivo) return regra.etiquetaMotivo;
  return casou.trim().slice(0, 48).toUpperCase();
}

export function classificarReceitaExtrato(descricao: string): ResultadoClassificacaoImport {
  const t = normalizarTexto(descricao);

  if (!t.length) {
    return {
      category: "Receita",
      confiancaPct: 45,
      motivo: "Descrição vazia — receita genérica.",
      intensidade: "baixa",
    };
  }

  const blocos = [...BLOCOS_RECEITA_CONSULTIVO].sort((a, b) => b.prioridade - a.prioridade);
  for (const bloco of blocos) {
    for (const frase of bloco.frases) {
      const kw = normalizarTexto(frase);
      if (!kw.length || !t.includes(kw)) continue;
      const intensidade: "forte" | "media" = bloco.confiancaPct >= 88 ? "forte" : "media";
      return {
        category: bloco.categoria,
        confiancaPct: bloco.confiancaPct,
        motivo: `Receita (${bloco.categoria}: termo «${frase.trim()}»).`,
        intensidade,
      };
    }
  }

  return {
    category: "Receita",
    confiancaPct: 78,
    motivo: "Receita genérica (sem termo específico no dicionário consultivo).",
    intensidade: "media",
  };
}

/** Heurísticas de despesa por palavras-chave (uso na importação e em categorização genérica). */
export function classificarDespesaExtratoKeywords(
  descricao: string
): ResultadoClassificacaoImport {
  const textoNorm = normalizarTexto(descricao);

  if (!textoNorm) {
    return {
      category: "Outros",
      confiancaPct: 26,
      motivo: "Descrição vazia.",
      intensidade: "baixa",
    };
  }

  let melhor: Candidato | null = null;

  for (const regra of REGRAS_DESPESA) {
    for (const fraseBruta of regra.frases) {
      const kw = normalizarTexto(fraseBruta);
      if (!kw.length) continue;
      if (!textoNorm.includes(kw)) continue;

      if (
        regra.categoria === "Mercado"
        && kw === "mercado"
        && mercadoPalavraGenericaProibida(textoNorm)
      ) {
        continue;
      }

      if (kw === "metro" && !matchPalavraInteira(textoNorm, "metro")) continue;

      const label = primeiraEtiquetaFrase(regra, fraseBruta);
      const pre =
        regra.tier === 4
          ? "Regra fraca"
          : regra.forca === "forte"
            ? "Palavra-chave forte"
            : "Palavra-chave média";
      const cand: Candidato = {
        tier: regra.tier,
        prioridade: regra.prioridade,
        kwLen: kw.length,
        forca: regra.forca,
        category: regra.categoria,
        motivo: `${pre}: ${label}`,
      };
      melhor = melhorCandidato(melhor, cand);
    }

    for (const pal of regra.palavrasInteiras ?? []) {
      const pn = normalizarTexto(pal);
      if (!matchPalavraInteira(textoNorm, pn)) continue;
      const pre =
        regra.tier === 4
          ? "Regra fraca"
          : regra.forca === "forte"
            ? "Palavra-chave forte"
            : "Palavra-chave média";
      const cand: Candidato = {
        tier: regra.tier,
        prioridade: regra.prioridade,
        kwLen: pn.length,
        forca: regra.forca,
        category: regra.categoria,
        motivo: `${pre}: ${(regra.etiquetaMotivo ?? pal).toUpperCase()}`,
      };
      melhor = melhorCandidato(melhor, cand);
    }
  }

  if (melhor) {
    let pct = pctConfianca(melhor.forca, melhor.kwLen);
    if (melhor.tier === 4) pct = Math.min(pct, 72);
    return {
      category: melhor.category,
      confiancaPct: pct,
      motivo: melhor.motivo,
      intensidade: melhor.forca,
    };
  }

  return {
    category: "Outros",
    confiancaPct: 28,
    motivo: "Nenhuma palavra-chave correspondente.",
    intensidade: "baixa",
  };
}
