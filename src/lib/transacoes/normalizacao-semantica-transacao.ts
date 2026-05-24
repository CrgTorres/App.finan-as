/**
 * Normalização semântica pós-parser para descrições ruins (Mercado Pago, adquirentes, etc.).
 */

import type { Category } from "@/types";
import {
  aplicarHeuristicasCategoriaMercadoPago,
  tituloSubtituloVisualMercadoPago,
} from "@/lib/importacao/parsers/mercado-pago-reconstrucao";
import { limparDescricaoMovimentoNubank } from "@/lib/extratos/nubank-descricao-limpeza";
import {
  textoIndicaFaturaContaDeEnergia,
  truncarRodapeDocumentosBr,
} from "@/lib/extratos/pdf-descricao-truncar-rodape";
import { resolverDescricaoVisualExtrato } from "@/lib/transacoes/descricao-visual-extrato";
import { formatarTituloComercialPt } from "@/lib/transacoes/extrato-analise-visual-descricao";

export type ResultadoNormalizacaoSemantica = {
  titulo: string;
  subtitulo: string;
  categoriaSugerida: Category;
  confianca: "alta" | "media" | "baixa";
  score: number;
  motivo: string;
  entidadeIntermediaria?: string | null;
  precisaAprendizado?: boolean;
};

const GATEWAYS_E_INTERMEDIARIOS = [
  "DO BRASIL TECNOLOGIA",
  "STONE",
  "PAGSEGURO",
  "MERCADO PAGO",
  "CIELO",
  "SUMUP",
  "CLOUDWALK",
  "ADYEN",
  "OKTO",
  "STARK BANK",
] as const;

const PALAVRAS_FORTES: Partial<Record<Category, readonly string[]>> = {
  Moradia: ["LAVANDERIA", "TINTURARIA", "LAVA JATO", "LAVA-JATO"],
  Alimentação: [
    "IFOOD",
    "RESTAURANTE",
    "PANIFICADORA",
    "CONFEITARIA",
    "LANCHES",
    "CHURRASCARIA",
    "COFFEE",
    "ESFIRRA",
    "DUO REFEICOES",
    "DUO REFEIÇÕES",
  ],
  Mercado: [
    "SUPERMERCADO",
    "MERCADO",
    "YOUMART",
    "DISTRIBUIDORA",
    "ATACADAO",
    "ATACADÃO",
    "CARREFOUR",
  ],
  Transporte: ["UBER", "99APP", "TAXI", "MOBI"],
  Combustível: ["POSTO", "AUTO POSTO", "GASOLINA", "COMBUSTIVEL", "COMBUSTÍVEL"],
  Saúde: ["DROGASIL", "RAIA", "FARMACIA", "FARMÁCIA", "DROGARIA", "HAPVIDA", "MEDIC"],
  "Cartão/Fatura": [
    "CARTAO DE CREDITO",
    "CARTÃO DE CRÉDITO",
    "PAGAMENTO DE FATURA",
    "FATURA",
  ],
  "Conta de consumo": ["CLARO", "VIVO", "TELEFONICA", "TELEFÔNICA", "ENERGIA", "INTERNET"],
  Empréstimo: [
    "DEBITO POR DIVIDA",
    "DÉBITO POR DÍVIDA",
    "EMPRESTIMOS MERCADO PAGO",
    "EMPRÉSTIMOS MERCADO PAGO",
    "EMPRESTIMO",
    "EMPRÉSTIMO",
    "CONSIGNADO",
  ],
};

export function rotuloExtratoInferidoPorNomeArquivo(nome?: string | null): string | undefined {
  if (!nome?.trim()) return undefined;
  const n = nome.toLowerCase();
  if (n.includes("mercado") && n.includes("pago")) return "Mercado Pago";
  if (n.includes("nubank")) return "Nubank";
  if (n.includes("bradesco")) return "Bradesco";
  const base = nome.replace(/\.[^.]+$/i, "").trim();
  return base || undefined;
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function removerPrefixosOperacionais(texto: string): string {
  return texto
    .replace(/^(PAGAMENTO COM QR PIX)\s+/i, "")
    .replace(/^(PAGAMENTO)\s+/i, "")
    .replace(/^(PIX RECEBIDO)\s+/i, "")
    .replace(/^(PIX ENVIADO)\s+/i, "")
    .replace(/^(TRANSFERENCIA ENVIADA PELO PIX)\s+/i, "")
    .replace(/^(TRANSFERÊNCIA ENVIADA PELO PIX)\s+/i, "")
    .replace(/^(TRANSFERENCIA RECEBIDA PELO PIX)\s+/i, "")
    .replace(/^(TRANSFERÊNCIA RECEBIDA PELO PIX)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectarIntermediario(texto: string): string | null {
  const n = normalizarTexto(texto);
  return (
    GATEWAYS_E_INTERMEDIARIOS.find((g) =>
      n.includes(normalizarTexto(g))
    ) ?? null
  );
}

function textoIndicaCreditoRendimentoOuJuros(texto: string): boolean {
  const cabeca = truncarRodapeDocumentosBr(texto).slice(0, 420);
  const n = normalizarTexto(cabeca);
  return (
    /\bRENDIMENTOS?\b/.test(n) ||
    /\bJUROS?\b/.test(n) ||
    /\bRESGATE\b/.test(n) ||
    /\bDIVIDENDOS?\b/.test(n) ||
    /\bCASHBACK\b/.test(n) ||
    /\bRENDIMENTO\s+L[IÍ]QUID/.test(n) ||
    /\bCORRE[cç][aÃ]O\s+MONET[aÃ]RIA\b/.test(n)
  );
}

/** Gasto típico: não aplicar a linhas de crédito/receita só pelo nome fantasia. */
const CATEGORIAS_PALAVRA_FORTE_SO_DESPESA: ReadonlySet<Category> = new Set([
  "Alimentação",
  "Mercado",
  "Transporte",
  "Combustível",
  "Saúde",
  "Lazer",
  "Pets",
  "Educação",
  "Moradia",
  "Conta de consumo",
  "Cartão/Fatura",
  "Boleto",
]);

function detectarCategoria(
  texto: string,
  tipoFluxo?: "receita" | "despesa"
): {
  categoria: Category;
  palavra: string;
  score: number;
  confianca: "alta";
} | null {
  const n = normalizarTexto(texto);

  if (tipoFluxo === "receita" && textoIndicaCreditoRendimentoOuJuros(texto)) {
    return {
      categoria: "Receita",
      palavra: "RENDIMENTOS/JUROS",
      score: 92,
      confianca: "alta",
    };
  }

  for (const [categoriaKey, palavras] of Object.entries(PALAVRAS_FORTES) as Array<
    [Category, readonly string[]]
  >) {
    if (tipoFluxo === "receita" && CATEGORIAS_PALAVRA_FORTE_SO_DESPESA.has(categoriaKey)) {
      continue;
    }
    if (tipoFluxo === "receita" && categoriaKey === "Empréstimo") {
      continue;
    }

    const lista =
      categoriaKey === "Mercado"
        ? palavras.filter(
            (p) =>
              !(normalizarTexto(p) === "MERCADO" && n.includes("MERCADO PAGO"))
          )
        : [...palavras];

    const palavra = lista.find((p) => n.includes(normalizarTexto(p)));
    if (palavra) {
      return {
        categoria: categoriaKey,
        palavra,
        score: 90,
        confianca: "alta",
      };
    }
  }

  return null;
}

function limparTituloRuim(titulo: string): string {
  return titulo
    .replace(/\bAGENCIA:\s*\d+\b/gi, "")
    .replace(/\bAGÊNCIA:\s*\d+\b/gi, "")
    .replace(/\bCONTA:\s*[\d-]+\b/gi, "")
    .replace(/\bCPF\/CNPJ:\s*[\d./\-•]+\b/gi, "")
    .replace(/\s*-\s*•+[\d.•\-–*]+\s*/gi, " ")
    .replace(/\s*-\s*\*{1,3}\.?\d[\d.*•\-–]+\*{0,3}\s*/gi, " ")
    .replace(/\s+-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tituloPareceRuim(titulo: string): boolean {
  const n = normalizarTexto(titulo);

  if (!titulo || titulo.length < 4) return true;
  if (["POR", "COMERCIO", "LTDA", "S A", "SA"].includes(n)) return true;
  if (/^\d+(\.\d+)*\s+[A-Z]+$/u.test(n)) return true;
  if (detectarIntermediario(titulo)) return true;

  return false;
}

function tituloFallbackLegivel(descricao: string | undefined): string {
  const s = removerPrefixosOperacionais(descricao ?? "").trim();
  if (s.length >= 4 && !tituloPareceRuim(s)) return limparTituloRuim(s);
  return "Transação sem favorecido claro";
}

/** Heurísticas alinhadas ao `tipoNubank` em `parse-extrato-bancario`. */
function aplicarHeuristicasCategoriaNubank(
  descricao: string,
  tipo: "receita" | "despesa"
): {
  categoria: Category;
  score: number;
  motivo: string;
  confianca: "alta" | "media";
} | null {
  const low = descricao
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (
    /\btransfer[eê]ncia\s+recebida\b|\bpix\s+recebido\b|\bpagamento\s+recebido\b/i.test(
      low,
    ) &&
    tipo === "receita"
  ) {
    return {
      categoria: "Receita",
      score: 90,
      confianca: "alta",
      motivo: "Extrato Nubank — entrada (Pix/transferência/pagamento recebido)",
    };
  }

  if (/\bpix\s+enviado\b|\btransfer[eê]ncia\s+enviada\b/i.test(low) && tipo === "despesa") {
    return {
      categoria: "Transferência para terceiros",
      score: 88,
      confianca: "alta",
      motivo: "Extrato Nubank — Pix enviado ou transferência enviada",
    };
  }

  if (/\bpagamento\s+efetuado\b/i.test(low) && tipo === "despesa") {
    return {
      categoria: "Outros",
      score: 76,
      confianca: "media",
      motivo: "Extrato Nubank — pagamento efetuado",
    };
  }

  if (/\bpagamento\s+de\s+fatura\b/i.test(low)) {
    return {
      categoria: "Cartão/Fatura",
      score: 90,
      confianca: "alta",
      motivo: "Extrato Nubank — pagamento de fatura",
    };
  }

  if (/\bcompra\s+no\s+d[eé]bito\b/i.test(low) && tipo === "despesa") {
    return {
      categoria: "Outros",
      score: 74,
      confianca: "media",
      motivo: "Extrato Nubank — compra no débito",
    };
  }

  if (
    /\bdep[oó]sito\b|\bentrada\b|\brendimento\b|\bcashback\b/i.test(low) &&
    tipo === "receita"
  ) {
    return {
      categoria: "Receita",
      score: 85,
      confianca: "alta",
      motivo: "Extrato Nubank — depósito, rendimento ou cashback",
    };
  }

  return null;
}

function normalizarSemanticaNubankExtrato(input: {
  descricao: string;
  descricaoOriginal?: string;
  tipo: "receita" | "despesa";
  banco?: string;
  favorecido?: string | null;
  documento?: string | null;
}): ResultadoNormalizacaoSemantica {
  const desc = limparDescricaoMovimentoNubank(
    (input.descricaoOriginal ?? input.descricao).normalize("NFC").trim(),
  );
  const textoBase = [input.favorecido, desc].filter(Boolean).join(" ");
  const hn = aplicarHeuristicasCategoriaNubank(desc, input.tipo);
  const catPal = detectarCategoria(textoBase, input.tipo);
  const intermediario = detectarIntermediario(textoBase);

  let categoriaSugerida: Category;
  let score: number;
  let confianca: "alta" | "media" | "baixa";
  let motivo: string;
  let precisaAprendizado: boolean;

  if (hn) {
    categoriaSugerida = hn.categoria;
    score = hn.score;
    confianca = hn.confianca === "alta" ? "alta" : "media";
    motivo = hn.motivo;
    precisaAprendizado = false;
  } else if (catPal) {
    categoriaSugerida = catPal.categoria;
    score = catPal.score;
    confianca = "alta";
    motivo = `Palavra-chave forte: ${catPal.palavra}`;
    precisaAprendizado = false;
  } else if (input.tipo === "receita") {
    categoriaSugerida = "Receita";
    score = 82;
    confianca = "media";
    motivo = "Receita identificada pelo tipo da transação";
    precisaAprendizado = false;
  } else if (intermediario) {
    categoriaSugerida = "Outros";
    score = 28;
    confianca = "baixa";
    motivo = "Descrição parece intermediador/gateway";
    precisaAprendizado = true;
  } else {
    categoriaSugerida = "Outros";
    score = 32;
    confianca = "baixa";
    motivo = "Nenhuma regra forte do Nubank — ajuste a categoria se precisar";
    precisaAprendizado = false;
  }

  const vis = resolverDescricaoVisualExtrato(desc, {
    idOperacao: input.documento ?? undefined,
  });
  let titulo = limparTituloRuim(vis.tituloPrincipal.trim() || desc);
  if (!titulo) titulo = limparTituloRuim(desc);

  if (vis.textoBrutoTituloFallback && desc.length > titulo.length + 28) {
    titulo = limparTituloRuim(desc);
  }
  titulo = formatarTituloComercialPt(titulo.trim() || desc);

  /** Subtítulo só com tipo/bandeira/documento — categorias ficam na coluna ao lado. */
  const subtitulo = vis.subtitulo?.trim() || null;

  return {
    titulo,
    subtitulo: subtitulo ?? "",
    categoriaSugerida,
    confianca,
    score,
    motivo,
    entidadeIntermediaria: intermediario,
    precisaAprendizado,
  };
}

function normalizarSemanticaMercadoPagoExtrato(input: {
  descricao: string;
  descricaoOriginal?: string;
  tipo: "receita" | "despesa";
  banco?: string;
  favorecido?: string | null;
  documento?: string | null;
}): ResultadoNormalizacaoSemantica {
  const desc = (input.descricaoOriginal ?? input.descricao)
    .normalize("NFC")
    .trim();
  const textoBase = [input.favorecido, desc].filter(Boolean).join(" ");
  const hp = aplicarHeuristicasCategoriaMercadoPago(desc, input.tipo);
  const catPal = detectarCategoria(textoBase, input.tipo);
  const intermediario = detectarIntermediario(textoBase);

  let categoriaSugerida: Category;
  let score: number;
  let confianca: "alta" | "media" | "baixa";
  let motivo: string;
  let precisaAprendizado: boolean;

  if (hp) {
    categoriaSugerida = hp.categoria;
    score = hp.score;
    confianca = hp.confianca === "alta" ? "alta" : "media";
    motivo = hp.motivo;
    precisaAprendizado = false;
  } else if (catPal) {
    categoriaSugerida = catPal.categoria;
    score = catPal.score;
    confianca = "alta";
    motivo = `Palavra-chave forte: ${catPal.palavra}`;
    precisaAprendizado = false;
  } else if (input.tipo === "receita") {
    categoriaSugerida = "Receita";
    score = 82;
    confianca = "media";
    motivo = "Receita identificada pelo tipo da transação";
    precisaAprendizado = false;
  } else if (intermediario) {
    categoriaSugerida = "Outros";
    score = 28;
    confianca = "baixa";
    motivo = "Descrição parece intermediador/gateway";
    precisaAprendizado = true;
  } else {
    categoriaSugerida = "Outros";
    score = 28;
    confianca = "baixa";
    motivo = "Nenhuma palavra-chave correspondente";
    precisaAprendizado = false;
  }

  const vis = tituloSubtituloVisualMercadoPago(desc, categoriaSugerida);

  return {
    titulo: vis.titulo,
    subtitulo: vis.subtitulo,
    categoriaSugerida,
    confianca,
    score,
    motivo,
    entidadeIntermediaria: intermediario,
    precisaAprendizado,
  };
}

/**
 * Camada universal pós-parser para título exibível, subtítulo e categoria sugerida.
 */
export function normalizarSemanticaTransacao(input: {
  descricao: string;
  descricaoOriginal?: string;
  tipo: "receita" | "despesa";
  banco?: string;
  valor?: number;
  favorecido?: string | null;
  documento?: string | null;
  extratoParserId?: string | null;
}): ResultadoNormalizacaoSemantica {
  if (input.extratoParserId === "mercado_pago") {
    return normalizarSemanticaMercadoPagoExtrato(input);
  }
  if (input.extratoParserId === "nubank") {
    return normalizarSemanticaNubankExtrato(input);
  }

  const textoAgg = [input.favorecido, input.descricao, input.descricaoOriginal]
    .filter(Boolean)
    .join(" ");
  let tipoEfetivo: "receita" | "despesa" = input.tipo;
  if (tipoEfetivo === "receita" && textoIndicaFaturaContaDeEnergia(textoAgg)) {
    tipoEfetivo = "despesa";
  }

  const textoBase = [input.favorecido, input.descricao, input.descricaoOriginal]
    .filter(Boolean)
    .join(" ");

  const categoria = detectarCategoria(textoBase, tipoEfetivo);
  const intermediario = detectarIntermediario(textoBase);

  let titulo = removerPrefixosOperacionais(input.favorecido || input.descricao);
  titulo = limparTituloRuim(titulo);

  const ruimInicial = tituloPareceRuim(titulo);

  if (ruimInicial && categoria) {
    titulo = limparTituloRuim(
      removerPrefixosOperacionais(input.descricaoOriginal || input.descricao)
    );
  }

  if (tituloPareceRuim(titulo)) {
    titulo = tituloFallbackLegivel(input.descricaoOriginal ?? input.descricao);
  }

  const rotuloBanco = input.banco?.trim() || "Extrato";

  if (tipoEfetivo === "receita" && !categoria) {
    return {
      titulo,
      subtitulo: `${rotuloBanco} • Receita`,
      categoriaSugerida: "Receita",
      confianca: "media",
      score: 82,
      motivo: "Receita identificada pelo tipo da transação",
      entidadeIntermediaria: intermediario,
      precisaAprendizado: false,
    };
  }

  if (categoria) {
    return {
      titulo,
      subtitulo: `${rotuloBanco} • ${categoria.categoria}`,
      categoriaSugerida: categoria.categoria,
      confianca: categoria.confianca,
      score: categoria.score,
      motivo: `Palavra-chave forte: ${categoria.palavra}`,
      entidadeIntermediaria: intermediario,
      precisaAprendizado: false,
    };
  }

  return {
    titulo,
    subtitulo: intermediario
      ? `${rotuloBanco} • Intermediário: ${intermediario}`
      : `${rotuloBanco} • Sem regra`,
    categoriaSugerida: "Outros",
    confianca: "baixa",
    score: 28,
    motivo: intermediario
      ? "Descrição parece intermediador/gateway"
      : "Nenhuma palavra-chave correspondente",
    entidadeIntermediaria: intermediario,
    precisaAprendizado: Boolean(intermediario),
  };
}
