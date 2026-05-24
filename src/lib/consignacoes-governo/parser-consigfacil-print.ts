import type {
  ConsigfacilCartao,
  ConsigfacilContrato,
  ConsigfacilHistorico,
  ConsigfacilMargem,
  ConsigfacilModalidadeSlug,
  ConsigfacilOrigemDado,
  ConsigfacilSnapshot,
  ConsigfacilStatus,
  ConsigfacilTipoCartao,
  ConsigfacilTipoMargem,
} from "@/types/consigfacil";
import {
  getModalidade,
  modalidadePorTitulo,
  resolverInstituicaoOficial,
} from "@/lib/consignacoes-governo/consigfacil-catalogo";
import { validarEstruturaParcela } from "@/lib/contratos/validar-estrutura-parcela";
import { detectarInstituicaoNaDescricao } from "@/lib/reading/instituicoes-financeiras";

/**
 * Parser tolerante para o texto bruto do portal ConsigFácil.
 *
 * Fonte aceita:
 *  1. Texto copiado da tela "Início" (cards de margem).
 *  2. Texto copiado da tela "Consignações em andamento" / "Contratos antigos".
 *  3. Texto extraído de PDF via OCR.
 *  4. Texto extraído de um HTML (chame `parser-consigfacil-html.ts` antes).
 *
 * Heurística:
 *  - Quebras `\n` separam blocos.
 *  - "Margem Total" + valor + "Saldo de Margem Disponível" + valor + "NN%" → margem.
 *  - Linhas que começam com 7+ dígitos são `id_consignacao` e iniciam um bloco
 *    de contrato/cartão. O bloco termina na próxima linha que também começa
 *    com dígitos OU em um marcador de seção conhecido.
 *  - "Cartão Benefício Compra" / "Margem Cartão" indica `tipo_margem` do bloco.
 */

const RE_VALOR_BRL = /R\$\s*([\d.]+,\d{2})/;
const RE_DATA_DDMMYYYY = /(\d{2})\/(\d{2})\/(\d{4})/;
const RE_PARCELAS_LABEL = /Parcelas?\s*:\s*(\d{1,3})\s*\/\s*(\d{1,3})/i;
/** Evita confundir data «24/11/2025» com parcelas 24/11. */
const RE_PARCELAS_SLASH = /(?:^|[^\d/])(\d{1,3})\s*\/\s*(\d{1,3})(?!\s*\/\s*\d{2,4})/i;
const RE_PARCELAS_PIPE = /\b(\d{1,3})\s*\|\s*(\d{1,3})\b/;
/** Ex.: "72 x de R$ 320,00" no portal — total de parcelas + valor, não instituição. */
const RE_PARCELAS_X_DE = /(\d{1,3})\s*x\s*de\s*R\$/i;
const RE_PERCENT = /(\d{1,3})\s*%/;
const RE_ID_CONSIGNACAO = /^\s*(\d{6,})\s*(?:\(.*\))?\s*$/;
const RE_PERIODO_PT = /Per[ií]odo\s*:?\s*([A-Za-zçÇãáéíóúÀ-ÿ]+)\s+de\s+(\d{4})/i;

const MESES_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  marco_: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

export function parseValorBrl(texto: string): number {
  const m = RE_VALOR_BRL.exec(texto);
  if (!m) return 0;
  const limpo = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function parseDataIso(texto: string): string | null {
  const m = RE_DATA_DDMMYYYY.exec(texto);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseCompetenciaPt(texto: string): string | null {
  const m = RE_PERIODO_PT.exec(texto);
  if (!m) return null;
  const mes = MESES_PT[m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!mes) return null;
  return `${m[2]}-${String(mes).padStart(2, "0")}`;
}

function normalizarLinha(linha: string): string {
  return linha
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferirTipoMargem(textoBloco: string): ConsigfacilTipoMargem {
  const norm = textoBloco.toLowerCase();
  if (norm.includes("margem cartão benefício") || norm.includes("margem cartao beneficio"))
    return "margem_cartao_beneficio";
  if (norm.includes("margem cartão") || norm.includes("margem cartao")) return "margem_cartao";
  if (norm.includes("margem consignável") || norm.includes("margem consignavel"))
    return "margem_consignavel";
  return "desconhecida";
}

function inferirStatus(
  textoBloco: string,
  tipoMargem: ConsigfacilTipoMargem,
  ehCartao: boolean,
): ConsigfacilStatus {
  const norm = textoBloco.toUpperCase();
  if (/SUSPENSO/.test(norm)) return "suspenso";
  if (/QUITADO/.test(norm)) return "quitado";
  if (/REFINANCIA/.test(norm)) return "refinanciado";
  if (/SUBSTITU/.test(norm)) return "substituido";
  if (/EM AVERBAÇÃO|EM AVERBACAO/.test(norm)) return "em_averbacao";
  if (ehCartao && tipoMargem === "margem_cartao_beneficio") return "cartao_beneficio";
  if (ehCartao && /RMC/.test(norm)) return "rmc";
  if (ehCartao && /RCC/.test(norm)) return "rcc";
  if (/IMPORTADO/.test(norm)) return "ativo";
  return "ativo";
}

function inferirTipoCartao(textoBloco: string): ConsigfacilTipoCartao {
  const norm = textoBloco.toLowerCase();
  if (norm.includes("benefício compra") || norm.includes("beneficio compra")) return "compra";
  if (norm.includes("saque")) return "saque";
  if (norm.includes("benefício") || norm.includes("beneficio")) return "beneficio";
  if (norm.includes("rmc")) return "rmc";
  if (norm.includes("rcc")) return "rcc";
  return "desconhecido";
}

/**
 * Lista (não-exaustiva) de prefixos que aparecem como NOME do banco/cooperativa
 * no portal ConsigFácil. Quando uma linha começa com um destes, ela tem
 * prioridade sobre a "primeira linha sobrando" — evita pegar acidentalmente
 * uma label genérica.
 *
 * Não precisa ser exaustiva: linhas que não casam aqui ainda são pegas pelo
 * fallback após o filtro de termos a ignorar.
 */
const PREFIXOS_INSTITUICAO_CONHECIDOS = [
  /^Banco\s+/i,
  /^Bco\s+/i,
  /^Cooperativ[oa]\s+/i,
  /^Cooperativa\s+/i,
  /^Caixa\b/i,
  /^Sicoob\b/i,
  /^Sicredi\b/i,
  /^Bradesco\b/i,
  /^Ita[uú]\b/i,
  /^Santander\b/i,
  /^BV\b/i,
  /^Daycoval\b/i,
  /^Pan\b/i,
  /^Olé\s+|^Ole\s+/i,
  /^Pine\b/i,
  /^Crefisa\b/i,
  /^Facta\b/i,
  /^Safra\b/i,
  /^Inter\b/i,
  /^Nubank\b/i,
  /^Credcesta\b/i,
  /^Banco\s+Pan\b/i,
  /^Banco\s+Panamericano\b/i,
];

export function linhaEhDescricaoParcelasConsigfacil(n: string): boolean {
  const t = normalizarLinha(n);
  if (!t) return false;
  if (RE_PARCELAS_X_DE.test(t)) return true;
  if (RE_PARCELAS_LABEL.test(t)) return true;
  if (RE_PARCELAS_PIPE.test(t)) return true;
  if (/^\d{1,3}\s*\/\s*\d{1,3}$/.test(t)) return true;
  return false;
}

/** Rótulos do portal que nunca são nome de banco/financeira. */
const INSTITUICAO_INVALIDA_EXATA = new Set(
  [
    "DATA",
    "PARCELAS",
    "PARCELA",
    "VALOR",
    "SITUACAO",
    "SITUAÇÃO",
    "STATUS",
    "INSTITUICAO",
    "INSTITUIÇÃO",
    "BANCO",
    "CONSIGNATARIA",
    "CONSIGNATÁRIA",
    "MARGEM",
    "PERIODO",
    "PERÍODO",
    "IMPORTADO",
    "SUSPENSO",
    "IMPORTADO_SUSPENSO",
    "IMPORTADO SUSPENSO",
    "NAO IDENTIFICADO",
    "HORA",
  ].map((s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase(),
  ),
);

function instituicaoTemNomeFinanceiro(chave: string, textoOriginal: string): boolean {
  if (PREFIXOS_INSTITUICAO_CONHECIDOS.some((re) => re.test(textoOriginal))) return true;
  if (resolverInstituicaoOficial(textoOriginal)) return true;
  if (/\b(BANCO|FINANCEIRA|CREDITO|CRÉDITO|COOPERATIVA|SICOOB|DAYCOVAL|BMG|CAIXA|BRADESCO|ITAU|ITAÚ|SANTANDER)\b/i.test(chave)) {
    return true;
  }
  return false;
}

const PREPOSICOES_NOME_PESSOA = new Set(["DA", "DE", "DO", "DOS", "DAS", "E"]);

/** Nome de servidor/titular colado no portal — não é instituição financeira. */
export function instituicaoPareceNomePessoa(nome: string): boolean {
  const n = normalizarLinha(nome);
  if (!n || instituicaoTemNomeFinanceiro(n.toUpperCase(), n)) return false;
  if (/\d/.test(n)) return false;
  const tokens = n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const substantivos = tokens.filter((t) => !PREPOSICOES_NOME_PESSOA.has(t));
  if (substantivos.length < 2) return false;
  if (tokens.length < 3) return false;
  return substantivos.every((t) => /^[A-Z]+$/.test(t));
}

/** Data, status do portal ou rótulo sem nome de banco — nunca é instituição. */
export function instituicaoEhRotuloInvalido(nome: string): boolean {
  const n = normalizarLinha(nome);
  if (!n) return true;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(n)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}/.test(n)) return true;

  const chave = n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (INSTITUICAO_INVALIDA_EXATA.has(chave)) return true;
  if (/^DATA\s*:/i.test(n)) return true;
  if (/^BANCO\s*:/i.test(n) && n.length < 12) return true;

  const semData = chave.replace(/^\d{2}\/\d{2}\/\d{4}(\s+\d{1,2}:\d{2}(:\d{2})?)?\s*/i, "").trim();
  if (semData && INSTITUICAO_INVALIDA_EXATA.has(semData)) return true;

  if (/^IMPORTADO(?:[_\s-]|$)/.test(chave) && !instituicaoTemNomeFinanceiro(chave, n)) return true;
  if (/^SUSPENSO(?:[_\s-]|$)/.test(chave) && !instituicaoTemNomeFinanceiro(chave, n)) return true;
  if (/\bIMPORTADO\b/.test(chave) && !instituicaoTemNomeFinanceiro(chave, n)) return true;
  if (/\bSUSPENSO\b/.test(chave) && !instituicaoTemNomeFinanceiro(chave, n)) return true;

  const tokens = semData.split(/\s+/).filter(Boolean);
  if (
    tokens.length > 0 &&
    tokens.every((t) =>
      ["IMPORTADO", "SUSPENSO", "QUITADO", "ATIVO", "DATA", "STATUS", "PARCELAS", "VALOR", "HORA"].includes(
        t,
      ),
    )
  ) {
    return true;
  }

  if (instituicaoPareceNomePessoa(n)) return true;

  return false;
}

function instituicaoNomeValido(nome: string): boolean {
  const n = normalizarLinha(nome);
  if (!n || linhaEhRotuloIgnoravel(n) || linhaEhDescricaoParcelasConsigfacil(n)) return false;
  if (instituicaoEhRotuloInvalido(n)) return false;
  return true;
}

function linhaEhRotuloIgnoravel(n: string): boolean {
  if (!n) return true;
  if (instituicaoEhRotuloInvalido(n)) return true;
  if (linhaEhDescricaoParcelasConsigfacil(n)) return true;
  if (/^\d{6,}/.test(n)) return true;
  if (/^Data\s*:/i.test(n)) return true;
  if (/^Per[ií]odo\s*:/i.test(n)) return true;
  if (/^R\$/.test(n)) return true;
  if (/^Parcelas?\s*:/i.test(n)) return true;
  if (/^Margem\s/i.test(n)) return true;
  if (/^Empr[eé]stimo\s/i.test(n)) return true;
  if (/^Cart[aã]o\s/i.test(n)) return true;
  if (/^Averbado\s*por\s*:/i.test(n)) return true;
  if (/^C[oó]digo/i.test(n)) return true;
  if (/^IMPORTADO$|^SUSPENSO$|^QUITADO$|^ATIVO$/i.test(n)) return true;
  if (/^Sem lan[cç]amento$|^Prazo indeterminado$/i.test(n)) return true;
  if (/^Consignat[aá]ria$|^Parcelas$|^Margem$/i.test(n)) return true;
  return false;
}

function extrairInstituicaoPorRotulo(linhas: string[]): string | null {
  for (const l of linhas) {
    const n = normalizarLinha(l);
    const mInst = /Institui[cç][aã]o\s*:\s*(.+)/i.exec(n);
    if (mInst?.[1] && instituicaoNomeValido(mInst[1])) return mInst[1].trim();
    const mBanco = /Banco\s*:\s*(.+)/i.exec(n);
    if (mBanco?.[1] && instituicaoNomeValido(mBanco[1])) return mBanco[1].trim();
  }
  return null;
}

function extrairInstituicao(linhas: string[]): string {
  const averbado = extrairAverbadoPor(linhas);
  if (averbado && instituicaoNomeValido(averbado)) return averbado;

  const porRotulo = extrairInstituicaoPorRotulo(linhas);
  if (porRotulo) return porRotulo;

  const candidatas = linhas
    .map((l) => normalizarLinha(l))
    .filter((n) => !linhaEhRotuloIgnoravel(n));

  for (const c of candidatas) {
    if (PREFIXOS_INSTITUICAO_CONHECIDOS.some((re) => re.test(c))) {
      return c;
    }
  }

  for (const c of candidatas) {
    if (instituicaoNomeValido(c)) return c;
  }

  return "";
}

function extrairAverbadoPor(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = /Averbado\s*por\s*:\s*(.+)/i.exec(l);
    if (m) return normalizarLinha(m[1]);
  }
  return null;
}

function extrairCodigoInstituicao(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = /C[oó]digo\s*na\s*institui[cç][aã]o\s*:?\s*([^\s]+)/i.exec(l);
    if (m) return m[1].trim();
  }
  return null;
}

function parcelaAtualDeValidacao(
  v: ReturnType<typeof validarEstruturaParcela>,
): number | null {
  if (!v.valido) return null;
  if (v.parcela_atual <= 0) return null;
  return v.parcela_atual;
}

function extrairParcelasContrato(
  textoBloco: string,
  linhas: string[],
): { atual: number | null; total: number } {
  const mLabel = RE_PARCELAS_LABEL.exec(textoBloco);
  if (mLabel) {
    const v = validarEstruturaParcela(Number(mLabel[1]), Number(mLabel[2]));
    return {
      atual: parcelaAtualDeValidacao(v),
      total: v.total_parcelas > 0 ? v.total_parcelas : Number(mLabel[2]) || 0,
    };
  }

  for (const l of linhas) {
    const n = normalizarLinha(l);
    const mPipe = RE_PARCELAS_PIPE.exec(n);
    if (mPipe) {
      const v = validarEstruturaParcela(Number(mPipe[1]), Number(mPipe[2]));
      return {
        atual: parcelaAtualDeValidacao(v),
        total: v.total_parcelas > 0 ? v.total_parcelas : Number(mPipe[2]) || 0,
      };
    }
  }

  const mXde = RE_PARCELAS_X_DE.exec(textoBloco);
  const mSlash = RE_PARCELAS_SLASH.exec(textoBloco);
  if (mSlash) {
    const v = validarEstruturaParcela(Number(mSlash[1]), Number(mSlash[2]));
    if (v.valido) {
      if (mXde && Number(mXde[1]) === v.total_parcelas) {
        return { atual: parcelaAtualDeValidacao(v), total: v.total_parcelas };
      }
      if (!mXde) {
        return { atual: parcelaAtualDeValidacao(v), total: v.total_parcelas };
      }
    }
  }

  if (mXde) {
    const total = Number(mXde[1]);
    if (total > 0) return { atual: null, total };
  }

  return { atual: null, total: 0 };
}

type BlocoComContexto = {
  /** Linhas do bloco (a primeira é o `id_consignacao`). */
  linhas: string[];
  /** Modalidade vigente na seção do portal onde este bloco apareceu (se identificada). */
  modalidade_secao: ConsigfacilModalidadeSlug | null;
  /** Texto literal do título da seção (auditoria). */
  titulo_secao: string | null;
};

/**
 * Detecta linhas que são CABEÇALHOS DE SEÇÃO do portal — uma das 4 modalidades
 * oficiais. A linha precisa ser EXATAMENTE o nome da modalidade (após
 * normalização), para evitar falsos positivos com nomes de banco ou rubricas.
 */
function linhaEhTituloSecaoModalidade(
  linha: string,
): { slug: ConsigfacilModalidadeSlug; titulo: string } | null {
  const n = normalizarLinha(linha);
  if (!n) return null;
  // Aceita apenas linhas curtas (até 60 chars) que casam com um título oficial.
  if (n.length > 60) return null;
  const slug = modalidadePorTitulo(n);
  if (!slug) return null;
  // Sanity check: o título tem que ser PRATICAMENTE só a label, não uma frase
  // contendo a palavra "Empréstimo Consignado". Aceita variações com sufixo
  // tipo "Empréstimo Consignado (ativo)".
  if (n.length > getModalidade(slug).nome_oficial.length + 20) return null;
  return { slug, titulo: n };
}

/**
 * Faz split em blocos cada vez que a linha começa com um `id_consignacao`.
 * Carrega a "modalidade da seção" vigente para anexar a cada bloco — quando
 * o portal imprime "Empréstimo Consignado" / "Cartão Benefício Compra" etc.
 * como cabeçalho.
 */
function dividirBlocosPorId(linhas: string[]): BlocoComContexto[] {
  const blocos: BlocoComContexto[] = [];
  let atual: string[] = [];
  let modalidadeVigente: ConsigfacilModalidadeSlug | null = null;
  let tituloVigente: string | null = null;

  function fecharBloco(): void {
    if (atual.length) {
      blocos.push({
        linhas: atual,
        modalidade_secao: modalidadeVigente,
        titulo_secao: tituloVigente,
      });
    }
    atual = [];
  }

  for (const l of linhas) {
    const n = normalizarLinha(l);

    const cab = linhaEhTituloSecaoModalidade(n);
    if (cab) {
      fecharBloco();
      modalidadeVigente = cab.slug;
      tituloVigente = cab.titulo;
      continue;
    }
    if (RE_ID_CONSIGNACAO.test(n)) {
      fecharBloco();
      atual = [n];
    } else if (atual.length) {
      atual.push(n);
    }
  }
  fecharBloco();
  return blocos;
}

function extrairMargens(texto: string, documentoOrigem: string, capturadoEm: string): ConsigfacilMargem[] {
  // Procura blocos do tipo:
  //   Margem Consignável
  //   Margem Total
  //   R$ 2.147,16
  //   Saldo de Margem Disponível
  //   R$ 509,35
  //   76%
  const linhas = texto.split(/\r?\n/).map(normalizarLinha).filter(Boolean);
  const margens: ConsigfacilMargem[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!/^Margem\s+(Consign[áa]vel|Cart[aã]o(?:\s+Benef[ií]cio)?)$/i.test(linhas[i])) continue;
    const tipoMargem = inferirTipoMargem(linhas[i]);
    let total = 0;
    let disponivel = 0;
    let pct = 0;
    for (let j = i + 1; j < Math.min(i + 12, linhas.length); j++) {
      if (/^Margem\s+(Consign[áa]vel|Cart[aã]o(?:\s+Benef[ií]cio)?)$/i.test(linhas[j])) break;
      if (/Margem\s+Total/i.test(linhas[j])) total = parseValorBrl(linhas[j + 1] ?? "");
      if (/Saldo\s+de\s+Margem\s+Dispon[ií]vel/i.test(linhas[j]))
        disponivel = parseValorBrl(linhas[j + 1] ?? "");
      const mPct = RE_PERCENT.exec(linhas[j]);
      if (mPct) pct = Number(mPct[1]);
    }
    const utilizada = Math.max(0, total - disponivel);
    const percentual = pct > 0 ? pct : total > 0 ? Math.round((utilizada / total) * 100) : 0;
    margens.push({
      competencia: capturadoEm.slice(0, 7),
      tipo_margem: tipoMargem,
      margem_total: total,
      margem_utilizada: utilizada,
      margem_disponivel: disponivel,
      percentual_comprometido: percentual,
      documento_origem: documentoOrigem,
      capturado_em: capturadoEm,
      fonte_oficial: true,
    });
  }
  return margens;
}

function blocoEhCartao(textoBloco: string): boolean {
  const norm = textoBloco.toLowerCase();
  return (
    norm.includes("cartão benefício") ||
    norm.includes("cartao beneficio") ||
    norm.includes("margem cartão") ||
    norm.includes("margem cartao") ||
    /\brmc\b/i.test(textoBloco) ||
    /\brcc\b/i.test(textoBloco)
  );
}

function parseBlocoContrato(
  blocoCtx: BlocoComContexto,
  documentoOrigem: string,
  origem: ConsigfacilOrigemDado,
  capturadoEm: string,
): { contrato: ConsigfacilContrato | null; cartao: ConsigfacilCartao | null; historico: ConsigfacilHistorico[] } {
  const bloco = blocoCtx.linhas;
  const idMatch = RE_ID_CONSIGNACAO.exec(bloco[0]);
  if (!idMatch) return { contrato: null, cartao: null, historico: [] };
  const id = idMatch[1];
  const textoBloco = bloco.join("\n");
  const tipoMargemInferida = inferirTipoMargem(textoBloco);
  const valor_parcela = parseValorBrl(textoBloco);
  const parcelas = extrairParcelasContrato(textoBloco, bloco);
  const data_contrato = parseDataIso(textoBloco) ?? capturadoEm.slice(0, 10);
  const competencia = parseCompetenciaPt(textoBloco) ?? capturadoEm.slice(0, 7);
  const averbado_por = extrairAverbadoPor(bloco);
  const instituicaoBruta = extrairInstituicao(bloco);
  const instituicao = (() => {
    let escolhida = instituicaoBruta;
    if (!instituicaoNomeValido(escolhida)) {
      if (averbado_por && instituicaoNomeValido(averbado_por)) {
        escolhida = averbado_por;
      } else {
        const catalogoAverbado = averbado_por
          ? resolverInstituicaoOficial(averbado_por)?.nome_oficial
          : null;
        if (catalogoAverbado) {
          escolhida = catalogoAverbado;
        } else if (averbado_por?.trim()) {
          escolhida = averbado_por;
        } else {
          const doBloco = detectarInstituicaoNaDescricao(textoBloco)?.nome;
          const doCatalogo = doBloco ? resolverInstituicaoOficial(doBloco)?.nome_oficial : null;
          escolhida = doCatalogo ?? doBloco ?? instituicaoBruta;
        }
      }
      if (
        instituicaoBruta &&
        instituicaoBruta !== escolhida &&
        (instituicaoEhRotuloInvalido(instituicaoBruta) ||
          linhaEhDescricaoParcelasConsigfacil(instituicaoBruta))
      ) {
        console.log("[CONSIGFACIL_INSTITUICAO_INVALIDA_CORRIGIDA]", {
          id_consignacao: id,
          invalida: instituicaoBruta,
          corrigida: escolhida,
          averbado_por,
        });
      }
    }
    return escolhida;
  })();
  const codigo_instituicao = extrairCodigoInstituicao(bloco);

  // -------------------------------------------------------------------------
  // CLASSIFICAÇÃO OFICIAL — aplica catálogo de modalidades/instituições.
  // Prioridade: modalidade da SEÇÃO (título no portal) > modalidade da
  // instituição (catálogo) > inferência por palavras-chave.
  // -------------------------------------------------------------------------
  const instituicaoCatalogo =
    resolverInstituicaoOficial(instituicao) ??
    (averbado_por ? resolverInstituicaoOficial(averbado_por) : null);

  const modalidade_slug = (() => {
    if (blocoCtx.modalidade_secao) return blocoCtx.modalidade_secao;
    if (instituicaoCatalogo?.modalidade_slug) return instituicaoCatalogo.modalidade_slug;
    // Fallback por palavras-chave do texto.
    if (/cart[aã]o\s+benef[ií]cio/i.test(textoBloco)) return "cartao_beneficio_compra";
    if (/cart[aã]o\s+de\s+cr[eé]dito/i.test(textoBloco)) return "cartao_credito";
    if (/contribui[cç][aã]o/i.test(textoBloco)) return "contribuicao";
    return "emprestimo_consignado";
  })();

  const modalidade = getModalidade(modalidade_slug);
  // tipo_margem segue o catálogo se houver; fallback para inferência.
  const tipo_margem: ConsigfacilTipoMargem =
    modalidade.tipo_margem ??
    (tipoMargemInferida === "desconhecida" || tipoMargemInferida === "outra"
      ? null
      : tipoMargemInferida);

  const ehCartao = modalidade.eh_cartao;
  const ehCartaoBeneficio = modalidade.eh_cartao_beneficio;
  const ehRmc = /\bRMC\b/i.test(textoBloco);
  const ehRcc = /\bRCC\b/i.test(textoBloco);

  const textoSuspenso =
    /\bSUSPENSO\b/i.test(textoBloco) ||
    /CONTRATO\s+BLOQUEADO/i.test(textoBloco) ||
    /BLOQUEADO/i.test(textoBloco);
  const status = textoSuspenso
    ? "suspenso"
    : inferirStatus(textoBloco, tipo_margem, ehCartao);
  const situacao_importacao = (() => {
    if (/IMPORTADO/i.test(textoBloco) && textoSuspenso) return "importado_suspenso";
    if (/IMPORTADO/i.test(textoBloco)) return "importado";
    if (textoSuspenso) return "suspenso";
    return null;
  })();

  // Classificação não-destrutiva: mantém o que o parser viu (original) ao lado
  // do que o catálogo declara (oficial). Marca divergência quando diferem.
  const classificacao = {
    modalidade_original: blocoCtx.titulo_secao,
    modalidade_oficial: modalidade_slug,
    instituicao_original: instituicao,
    instituicao_oficial: instituicaoCatalogo?.nome_oficial ?? null,
    classificacao_anterior: blocoCtx.titulo_secao,
    classificacao_oficial: modalidade.grupo_canonico,
    divergencia_classificacao: (() => {
      if (instituicaoCatalogo == null) return true; // catálogo não conhece a instituição
      if (
        blocoCtx.modalidade_secao &&
        instituicaoCatalogo.modalidade_slug &&
        blocoCtx.modalidade_secao !== instituicaoCatalogo.modalidade_slug
      ) {
        return true;
      }
      return false;
    })(),
  };

  const contrato: ConsigfacilContrato = {
    id_consignacao: id,
    instituicao: instituicaoCatalogo?.nome_oficial ?? instituicao,
    codigo_instituicao,
    data_contrato,
    competencia,
    valor_parcela,
    parcela_atual:
      parcelas.atual != null && parcelas.atual > 0
        ? parcelas.atual
        : parcelas.atual === 0 && /parcela\s*0\b|0\s*\/\s*\d+/i.test(textoBloco)
          ? 0
          : null,
    parcelas_total: parcelas.total,
    tipo_margem,
    status,
    averbado_por,
    origem,
    situacao_importacao,
    eh_cartao: ehCartao,
    eh_rmc: ehRmc,
    eh_rcc: ehRcc,
    eh_cartao_beneficio: ehCartaoBeneficio,
    eh_refinanciamento: false,
    contrato_substituido: null,
    confianca: 0,
    fonte_oficial: true,
    documento_origem: documentoOrigem,
    texto_bruto: textoBloco,
    observacao: situacao_importacao,
    modalidade_slug,
    grupo_canonico: modalidade.grupo_canonico,
    classificacao,
  };

  const cartao: ConsigfacilCartao | null = ehCartao
    ? {
        id_consignacao: id,
        tipo_cartao: inferirTipoCartao(textoBloco),
        consignataria: averbado_por ?? instituicao,
        valor_mensal: valor_parcela,
        parcelas_total: parcelas.total > 0 ? parcelas.total : null,
        parcela_atual:
          parcelas.atual != null && parcelas.atual > 0 ? parcelas.atual : null,
        competencia_inicio: data_contrato.slice(0, 7),
        situacao: /Sem lan[cç]amento/i.test(textoBloco)
          ? "Sem lançamento"
          : status === "suspenso"
            ? "Suspenso"
            : status === "quitado"
              ? "Quitado"
              : "Em andamento",
        documento_origem: documentoOrigem,
        fonte_oficial: true,
      }
    : null;

  const historico: ConsigfacilHistorico[] = [];
  if (situacao_importacao === "importado" || situacao_importacao === "importado_suspenso") {
    historico.push({
      id_consignacao: id,
      competencia,
      evento: "importacao",
      detalhe: "Contrato importado de outro sistema (FGTS/eSocial/SIAPE) — status do portal, não é nome de banco.",
      documento_origem: documentoOrigem,
      capturado_em: capturadoEm,
    });
  }
  if (status === "suspenso") {
    historico.push({
      id_consignacao: id,
      competencia,
      evento: "suspensao",
      detalhe: "Contrato suspenso no ConsigFácil — desconto não deve ser processado na folha.",
      documento_origem: documentoOrigem,
      capturado_em: capturadoEm,
    });
  }

  return { contrato, cartao, historico };
}

export type EntradaParseConsigfacil = {
  texto: string;
  documentoOrigem: string;
  origem?: ConsigfacilOrigemDado;
  capturadoEm?: string;
};

/** Ponto de entrada do parser print/HTML extraído. Retorna um snapshot canônico. */
export function parseConsigfacilTexto(input: EntradaParseConsigfacil): ConsigfacilSnapshot {
  const origem: ConsigfacilOrigemDado = input.origem ?? "consigfacil_print";
  const capturado_em = input.capturadoEm ?? new Date().toISOString();
  const avisos: string[] = [];
  const texto = input.texto.replace(/\u00a0/g, " ").trim();

  const margens = extrairMargens(texto, input.documentoOrigem, capturado_em);

  const linhas = texto.split(/\r?\n/);
  const blocos = dividirBlocosPorId(linhas);
  const contratos: ConsigfacilContrato[] = [];
  const cartoes: ConsigfacilCartao[] = [];
  const historico: ConsigfacilHistorico[] = [];

  for (const bloco of blocos) {
    try {
      const r = parseBlocoContrato(bloco, input.documentoOrigem, origem, capturado_em);
      if (r.contrato) contratos.push(r.contrato);
      if (r.cartao) cartoes.push(r.cartao);
      historico.push(...r.historico);
    } catch (e) {
      avisos.push(
        `Falha ao parsear bloco iniciando em "${bloco.linhas[0]}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    capturado_em,
    documento_origem: input.documentoOrigem,
    origem,
    margens,
    contratos,
    cartoes,
    historico,
    bruto: texto,
    avisos,
  };
}
