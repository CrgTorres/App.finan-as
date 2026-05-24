/**
 * Normalização universal pós-parser: prefixos, favorecido, categoria, subtítulo visual.
 */

import type { Category } from "@/types";
import { CATEGORIES } from "@/lib/constants";
import type { TransacaoImportada } from "./extrato-parser-core";
import { normalizarTexto } from "./extrato-parser-core";
import {
  classificarDespesaExtratoKeywords,
  classificarReceitaExtrato,
} from "@/lib/transacoes/classificador-palavras-chave";
import {
  resolverDescricaoVisualExtrato,
  resolverTipoOperacaoDescricao,
} from "@/lib/transacoes/descricao-visual-extrato";
import { extrairFavorecido } from "@/lib/transacoes/extrair-referencia-transacao";

export type ResultadoNormalizacaoImportada = {
  transacaoNormalizada: TransacaoImportada;
  categoriaSugerida: Category;
  score: number;
  motivo: string;
  subtituloVisual: string;
  favorecidoDetectado?: string | null;
};

const TITULAR_NOME_TEXTO_NORMALIZADO = "carlos rodrigo gomes torres";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchPalavraInteira(textoNorm: string, palavraNorm: string): boolean {
  if (!palavraNorm.length) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(palavraNorm)}([^a-z0-9]|$)`);
  return re.test(textoNorm);
}

function mercadoAceitoComoMercadoLista(n: string): boolean {
  if (/\bmercado\s+pago\b/.test(n) || n.includes("mercado livre")) return false;
  return !n.includes("mercadopago");
}

type RegraForte = Readonly<{
  needles: readonly string[];
  categoria: Category;
  etiqueta: string;
  inteiraParaPrimeira?: boolean;
  exigeMercadoLista?: boolean;
}>;

const REGRAS_FORTAS: readonly RegraForte[] = [
  {
    needles: ["ifood"],
    categoria: "Alimentação",
    etiqueta: "IFOOD",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["supermercado"],
    categoria: "Mercado",
    etiqueta: "SUPERMERCADO",
  },
  {
    needles: ["distribuidora"],
    categoria: "Mercado",
    etiqueta: "DISTRIBUIDORA",
  },
  {
    needles: ["youmart"],
    categoria: "Mercado",
    etiqueta: "YOUMART",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["mercado"],
    categoria: "Mercado",
    etiqueta: "MERCADO",
    exigeMercadoLista: true,
  },
  {
    needles: ["restaurante"],
    categoria: "Alimentação",
    etiqueta: "RESTAURANTE",
  },
  {
    needles: ["restaurantes"],
    categoria: "Alimentação",
    etiqueta: "RESTAURANTE",
  },
  {
    needles: ["panificadora"],
    categoria: "Alimentação",
    etiqueta: "PANIFICADORA",
  },
  {
    needles: ["confeitaria"],
    categoria: "Alimentação",
    etiqueta: "CONFEITARIA",
  },
  {
    needles: ["lanches"],
    categoria: "Alimentação",
    etiqueta: "LANCHES",
  },

  {
    needles: ["drogasil"],
    categoria: "Saúde",
    etiqueta: "DROGASIL",
  },
  {
    needles: ["raia"],
    categoria: "Saúde",
    etiqueta: "RAIA",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["farmacia"],
    categoria: "Saúde",
    etiqueta: "FARMÁCIA",
  },
  {
    needles: ["hapvida"],
    categoria: "Saúde",
    etiqueta: "HAPVIDA",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["medic"],
    categoria: "Saúde",
    etiqueta: "MEDIC",
  },

  {
    needles: ["99app", "99 app"],
    categoria: "Transporte",
    etiqueta: "99 APP",
  },
  {
    needles: ["taxi"],
    categoria: "Transporte",
    etiqueta: "TAXI",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["uber"],
    categoria: "Transporte",
    etiqueta: "UBER",
    inteiraParaPrimeira: true,
  },

  {
    needles: ["gasolina"],
    categoria: "Combustível",
    etiqueta: "GASOLINA",
  },
  {
    needles: ["combustivel"],
    categoria: "Combustível",
    etiqueta: "COMBUSTÍVEL",
  },
  {
    needles: ["posto"],
    categoria: "Combustível",
    etiqueta: "POSTO",
  },

  {
    needles: ["claro"],
    categoria: "Conta de consumo",
    etiqueta: "CLARO",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["vivo"],
    categoria: "Conta de consumo",
    etiqueta: "VIVO",
    inteiraParaPrimeira: true,
  },
  {
    needles: ["telefonica"],
    categoria: "Conta de consumo",
    etiqueta: "TELEFÔNICA",
  },
  {
    needles: ["energia"],
    categoria: "Conta de consumo",
    etiqueta: "ENERGIA",
  },
  {
    needles: ["internet"],
    categoria: "Conta de consumo",
    etiqueta: "INTERNET",
  },

  {
    needles: ["ficha de compensacao"],
    categoria: "Boleto",
    etiqueta: "FICHA DE COMPENSAÇÃO",
  },
  {
    needles: ["codigo de barras"],
    categoria: "Boleto",
    etiqueta: "CÓDIGO DE BARRAS",
  },
  {
    needles: ["boleto"],
    categoria: "Boleto",
    etiqueta: "BOLETO",
  },

  {
    needles: ["cartao de credito"],
    categoria: "Cartão/Fatura",
    etiqueta: "CARTÃO DE CRÉDITO",
  },
  {
    needles: ["fatura"],
    categoria: "Cartão/Fatura",
    etiqueta: "FATURA",
    inteiraParaPrimeira: true,
  },

  {
    needles: ["debito por divida"],
    categoria: "Empréstimo",
    etiqueta: "DÉBITO POR DÍVIDA",
  },
  {
    needles: ["consignado"],
    categoria: "Empréstimo",
    etiqueta: "CONSIGNADO",
  },
  {
    needles: ["emprestimo"],
    categoria: "Empréstimo",
    etiqueta: "EMPRÉSTIMO",
    inteiraParaPrimeira: true,
  },
] as const;

function casouRegraForte(regra: RegraForte, textoNorm: string): boolean {
  for (let idx = 0; idx < regra.needles.length; idx++) {
    const needle = regra.needles[idx]!;
    const n = normalizarTexto(needle);
    if (!n) continue;

    /** "mercado" vem antes de SUPER/MERCADO LIVRE: includes + lista branca quando exigido. */
    if (n === normalizarTexto("mercado")) {
      if (!textoNorm.includes("mercado")) continue;
      if (regra.exigeMercadoLista && !mercadoAceitoComoMercadoLista(textoNorm)) continue;
      return true;
    }

    const primeira = idx === 0;
    let useInteira = Boolean(regra.inteiraParaPrimeira && primeira);
    if (
      useInteira &&
      (needle.length > 22 ||
        n === normalizarTexto("supermercado") ||
        n === normalizarTexto("distribuidora"))
    ) {
      useInteira = false;
    }

    const hit = useInteira ? matchPalavraInteira(textoNorm, n) : textoNorm.includes(n);
    if (hit) return true;
  }
  return false;
}

function matchPalavrasFortasLista(textoNorm: string): { categoria: Category; etiqueta: string } | null {
  /** Primeira regra com match na ordem de lista (prioridade explícita do produto). */
  for (const regra of REGRAS_FORTAS) {
    if (casouRegraForte(regra, textoNorm)) return { categoria: regra.categoria, etiqueta: regra.etiqueta };
  }
  return null;
}

export function removerPrefixosDescricaoUniversais(descricaoOriginal: string): string {
  let x = descricaoOriginal.normalize("NFC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const passos: RegExp[] = [
    /^transfer[eê]ncia\s+enviada\s+pelo\s+pix\b\s*[:\-\u2013]?\s*/iu,
    /^transfer[eê]ncia\s+recebida\s+pelo\s+pix\b\s*[:\-\u2013]?\s*/iu,
    /^pagamento\s+com\s+(?:qr\s*(?:code\s*)?|q\s*r\s+)\s*pix\b\s*[:\-\u2013]?\s*/iu,
    /^pix\s+recebido\b\s*[:\-\u2013]?\s*/iu,
    /^pix\s+enviado\b\s*[:\-\u2013]?\s*/iu,
  ];

  for (const re of passos) {
    x = x.replace(re, "").trim();
  }

  if (!/^pagamento\s+(?:cart[aã]o|de\s+fatura)\b/i.test(x)) {
    x = x.replace(/^pagamento\b\s+/i, "").trim();
  }

  return x.replace(/\s+/g, " ").trim();
}

function textoIndicaReceitaOperacionalBasica(textoNorm: string): boolean {
  if (
    textoNorm.includes("pix recebido") ||
    textoNorm.includes("transferencia recebida") ||
    textoNorm.includes("rendimento") ||
    /\bvenda\b/.test(textoNorm)
  )
    return true;
  return false;
}

function textoIndicaTitularLista(textoOriginal: string, textoNorm: string): boolean {
  if (textoNorm.includes(TITULAR_NOME_TEXTO_NORMALIZADO)) return true;
  const semEspaco = textoOriginal.replace(/\s/g, "").toLowerCase();
  return /\.783\.242-/.test(semEspaco) || /\.783249/.test(semEspaco.replace(/\./g, ""));
}

function contextoPossivelPixEnvOuTransferEnv(textoNorm: string): boolean {
  return (
    textoNorm.includes("pix enviado") ||
    textoNorm.includes("transferencia enviada") ||
    textoNorm.includes("pagamento qr") ||
    textoNorm.includes("qr pix") ||
    textoNorm.includes("transferencia pelo pix enviada")
  );
}

function scoreParaConfianca(score: number): TransacaoImportada["confianca"] {
  if (score >= 86) return "alta";
  if (score >= 64) return "media";
  return "baixa";
}

export function capitalizarPrimeira(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Pós-parse: prefixos → favorecido → forte > receitas > titular NU > despesaKeywords. */
export function normalizarTransacaoImportada(tx: TransacaoImportada): ResultadoNormalizacaoImportada {
  const textoRaw = tx.descricao.normalize("NFC").replace(/\s+/g, " ").trim();
  const textoParaClassificar = textoRaw;
  const textoNormParaClassificar = normalizarTexto(textoParaClassificar);

  const descricaoSemPrefixos = removerPrefixosDescricaoUniversais(textoRaw);
  const forteLista = matchPalavrasFortasLista(textoNormParaClassificar);

  const prev = tx.categoria;
  let categoriaSugerida: Category =
    prev && (CATEGORIES as readonly string[]).includes(prev) ? (prev as Category) : "Outros";
  let score = 38;
  let motivo = "Heurísticas padrão.";

  if (tx.tipo === "receita") {
    if (forteLista && forteLista.categoria !== "Receita") {
      categoriaSugerida = forteLista.categoria;
      score = 93;
      motivo = `Palavra-chave forte: ${forteLista.etiqueta} (prevalece sobre tipo receita genérico).`;
    } else {
      const r = classificarReceitaExtrato(textoParaClassificar);
      const receitaEspecifica = r.category === "Salário" || r.category === "Freelance";
      if (receitaEspecifica) {
        categoriaSugerida = r.category;
        score = r.confiancaPct;
        motivo = r.motivo;
      } else if (textoIndicaReceitaOperacionalBasica(textoNormParaClassificar)) {
        categoriaSugerida = "Receita";
        score = Math.max(r.confiancaPct, 90);
        motivo = "Receita (Pix recebido / transferência recebida / rendimentos / venda).";
      } else {
        categoriaSugerida = r.category;
        score = r.confiancaPct;
        motivo = r.motivo;
      }
    }
  } else {
    if (forteLista) {
      categoriaSugerida = forteLista.categoria;
      score = 93;
      motivo = `Palavra-chave forte: ${forteLista.etiqueta}.`;
    } else if (
      contextoPossivelPixEnvOuTransferEnv(textoNormParaClassificar) &&
      textoIndicaTitularLista(textoRaw, textoNormParaClassificar)
    ) {
      categoriaSugerida = "Transferência própria";
      score = 91;
      motivo = "Transferência identificada como titular.";
    } else {
      const r = classificarDespesaExtratoKeywords(textoParaClassificar);
      /** Se forte existisse, já teríamos batido antes; pode retornar “terceiros” apenas sem forte. */
      categoriaSugerida = r.category;
      score = r.confiancaPct;
      motivo = r.motivo;
    }
  }

  const favorecidoDetectado =
    extrairFavorecido(textoRaw) ?? extrairFavorecido(descricaoSemPrefixos);

  const vis = resolverDescricaoVisualExtrato(descricaoSemPrefixos, {
    idOperacao: tx.documento ?? undefined,
  });

  const tituloExibicao = vis.textoBrutoTituloFallback
    ? capitalizarPrimeira(descricaoSemPrefixos || textoRaw)
    : vis.tituloPrincipal;

  const tipoOp = resolverTipoOperacaoDescricao(textoRaw);
  const partesSub: string[] = [];
  if (vis.subtitulo) partesSub.push(vis.subtitulo);
  else if (tipoOp) partesSub.push(tipoOp);
  if (categoriaSugerida !== "Outros") partesSub.push(categoriaSugerida);

  let subtituloVisual = partesSub.filter(Boolean).join(" · ");
  if (!subtituloVisual) subtituloVisual = tipoOp ?? categoriaSugerida ?? "";

  const transacaoNormalizada: TransacaoImportada = {
    ...tx,
    descricaoOriginal: tx.descricaoOriginal ?? textoRaw,
    descricao: tituloExibicao,
    categoria: categoriaSugerida,
    confianca: scoreParaConfianca(score),
    metadata: {
      ...(tx.metadata ?? {}),
      favorecidoDetectado: favorecidoDetectado ?? null,
      descricaoParaClassificacao: textoParaClassificar,
      textoSemPrefixosOperacionais: descricaoSemPrefixos,
      motivoNormalizacao: motivo,
    },
  };

  return {
    transacaoNormalizada,
    categoriaSugerida,
    score,
    motivo,
    subtituloVisual,
    favorecidoDetectado,
  };
}
