import { extrairDocumento, rotuloDocumentoExibicao } from "./extrair-documento";
import {
  escolherTituloComercialDoCorpus,
  extrairCorpusNomeExibicao,
  formatarTituloComercialPt,
  inferirBandeiraFinanceira,
  montarExibicaoFallbackAnalisada,
  ordenarPartesSubtitulo,
} from "./extrato-analise-visual-descricao";

const RE_TAIL_PIX_ENVIO =
  /transfer[eê]ncia\s+enviada\s+(?:pelo\s+)?pix\s+/gi;

const RE_TAIL_PIX_RECEBIDO =
  /transfer[eê]ncia\s+recebida\s+(?:pelo\s+)?pix\s+/gi;

const RE_TAIL_PIX_ENVIADO_RAPIDO = /\bpix\s+enviado\b\s*[:\-–]?\s*/gi;

const RE_TAIL_PIX_RECEBIDO_RAPIDO = /\bpix\s+recebido\b\s*[:\-–]?\s*/gi;

const RE_PELO_PIX = /\bpelo\s+pix\s+/gi;

/** Índice no texto onde começa nome do favorecido após último gatilho Pix conhecido. */
function indiceAposGatilhoPix(texto: string): number {
  const t = texto.normalize("NFC");
  let best = -1;

  const marcar = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const fim = m.index + m[0].length;
      if (fim > best) best = fim;
    }
  };

  marcar(RE_TAIL_PIX_ENVIO);
  marcar(RE_TAIL_PIX_RECEBIDO);
  marcar(RE_TAIL_PIX_ENVIADO_RAPIDO);
  marcar(RE_TAIL_PIX_RECEBIDO_RAPIDO);
  marcar(RE_PELO_PIX);

  return best;
}

function limparTituloMercador(s: string): string {
  let x = s
    .normalize("NFC")
    .replace(/\s*-\s*(\d{2}\.){2,}.*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  x = x.replace(/\s+\d[\d\s./-]*$/g, "").trim();
  return x;
}

/**
 * Nome do favorecido/estabelecimento quando a linha do extrato termina após Pix (envio/recebimento).
 */
export function extrairEstabelecimentoPosPix(textoOriginal: string): string | null {
  const texto = textoOriginal.normalize("NFC").replace(/\s+/g, " ").trim();
  const apos = indiceAposGatilhoPix(texto);
  if (apos < 0 || apos >= texto.length) return null;
  const resto = limparTituloMercador(texto.slice(apos));
  return resto.length >= 2 ? resto : null;
}

const BANCOS_NOME: ReadonlyArray<readonly [string, string]> = [
  ["MERCADO PAGO", "Mercado Pago"],
  ["SANTANDER", "Santander"],
  ["BANCO DO BRASIL", "Banco do Brasil"],
  ["BRADESCO", "Bradesco"],
  ["ITAU UNIBANCO", "Itaú"],
  ["ITAÚ UNIBANCO", "Itaú"],
  ["NU PAGAMENTOS", "Nubank"],
  ["PICPAY", "PicPay"],
  ["BANCO INTER", "Inter"],
  ["CAIXA ECONOMICA", "Caixa"],
  ["SICOOB", "Sicoob"],
  ["CIELO", "Cielo"],
  ["STONE IP", "Stone"],
  ["REDE", "Rede"],
];

function inferirBancoOuAdquirente(bloco: string): string | null {
  const u = bloco.normalize("NFC").toUpperCase();
  for (const [agulha, rotulo] of BANCOS_NOME) {
    if (u.includes(agulha)) return rotulo;
  }
  return null;
}

export function resolverTipoOperacaoDescricao(descricao: string): string | null {
  const t = descricao.normalize("NFC");
  if (/pagamento\s+(?:de\s+)?fatura\b/i.test(t)) return "Pagamento de fatura";
  if (
    /pagamento\s+(?:de\s+)?cart[aã]o(?:\s+de\s+cr[eé]dito)?\b/i.test(t) ||
    /pagamento\s+com\s+cart[aã]o\b/i.test(t)
  )
    return "Pagamento cartão";
  if (/pagamento\s+com\s+(?:qr|q\s*r)\b/i.test(t) && /\bpix\b/i.test(t))
    return "Pagamento QR Pix";
  if (/qr\s*(?:code\s+)?pix\b/i.test(t) && /pagamento/i.test(t))
    return "Pagamento QR Pix";
  if (
    (/rendimentos?\b|resgate\b|juros\s+l[ií]quid(?:os)?/i.test(t)) &&
    !/d[eé]bito/i.test(t)
  )
    return "Rendimento";
  if (/transfer[eê]ncia\s+(?:via\s+)?pix\b/i.test(t)) return "Transferência Pix";
  if (/transfer[eê]ncia\s+enviada\s+(?:pelo\s+)?pix/i.test(t))
    return "Pix enviado";
  if (/\bpix\s+enviado\b/i.test(t)) return "Pix enviado";
  if (/transfer[eê]ncia\s+recebida\s+(?:pelo\s+)?pix/i.test(t))
    return "Pix recebido";
  if (/\bpix\s+recebido\b/i.test(t)) return "Pix recebido";
  if (/transfer[eê]ncia\s+(?:credito|crédito|debito|débito)/i.test(t))
    return "Transferência";
  return null;
}

export type OpcoesResolverDescricaoExtrato = {
  /** Ex.: Mercado Pago — mesmo ID que `idOperacao`; evita exibir o código no título. */
  idOperacao?: string;
};

function prepararDescricaoComIdDuplicado(texto: string, idOp?: string): string {
  let s = texto.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!idOp) return s;
  const idDigitos = idOp.replace(/\D/g, "");
  if (idDigitos.length < 8) return s;
  const ini = /^([\d.]+\s+|\d+\s+)/.exec(s);
  if (ini?.[1] && ini[1].trim().replace(/\D/g, "") === idDigitos) {
    s = s.slice(ini[0].length).trim();
  }
  return s;
}

function capitalizarPrimeira(s: string): string {
  if (!s) return s;
  return formatarTituloComercialPt(s);
}

export function resolverDescricaoVisualExtrato(
  descricaoOriginal: string,
  opcoes?: OpcoesResolverDescricaoExtrato
): {
  tituloPrincipal: string;
  subtitulo: string | null;
  textoBrutoTituloFallback: boolean;
} {
  const texto = prepararDescricaoComIdDuplicado(descricaoOriginal, opcoes?.idOperacao).replace(
    /\s+/g,
    " "
  ).trim();

  if (!texto) {
    return { tituloPrincipal: "", subtitulo: null, textoBrutoTituloFallback: true };
  }

  const mMpSetor = texto.match(
    /^(.+?)\s+—\s+(Comércio|Serviços)\s*$/u
  );
  if (mMpSetor) {
    const titulo = capitalizarPrimeira(mMpSetor[1].trim());
    const setor = mMpSetor[2];
    const tipo = resolverTipoOperacaoDescricao(texto);
    const partesSub = [setor, tipo].filter(Boolean);
    return {
      tituloPrincipal: titulo,
      subtitulo: partesSub.length ? partesSub.join(" · ") : null,
      textoBrutoTituloFallback: false,
    };
  }

  /** Ex.: «F. C. MENDES - LAVANDERIA Pagamento com QR Pix NOME» — comerciante vem antes do gatilho Pix. */
  const mComercianteAntesQr = texto.match(
    /^(.{2,200}?)\s+pagamento\s+com\s+(?:qr\s*(?:code\s*)?|q\s*r\s*)?\s*pix\b(.*)$/iu
  );
  if (mComercianteAntesQr) {
    const rawCabeca = mComercianteAntesQr[1]!.trim();
    const cauda = (mComercianteAntesQr[2] ?? "").trim();
    const cabecaLimpa = limparTituloMercador(rawCabeca).replace(/\s+/g, " ").trim();
    const tituloRuim =
      !cabecaLimpa ||
      cabecaLimpa.length < 3 ||
      /^ltda\.?$/i.test(cabecaLimpa) ||
      /^s\.?\s*a\.?$/i.test(cabecaLimpa) ||
      /^s\.\s*a\.?$/i.test(cabecaLimpa);

    if (!tituloRuim) {
      const tipoOp = resolverTipoOperacaoDescricao(texto) ?? "Pagamento QR Pix";
      const docCauda = extrairDocumento(cauda);
      const docCabeca = extrairDocumento(rawCabeca);
      const docInst = docCauda ?? docCabeca;
      const corpusNome = extrairCorpusNomeExibicao(rawCabeca, docCabeca);
      const { titulo: tituloAnalise, preferirLinhaBruta: tituloFraco } =
        escolherTituloComercialDoCorpus(corpusNome || cabecaLimpa);
      const tituloExibir =
        tituloAnalise.length >= 4 && !tituloFraco ? tituloAnalise : cabecaLimpa;
      let detalheContra: string | null = null;
      if (cauda.length >= 2) {
        const extra = limparTituloMercador(cauda).replace(/\s+/g, " ").trim();
        if (
          extra.length >= 2 &&
          extra !== docInst &&
          !tituloExibir.toLowerCase().includes(extra.toLowerCase().slice(0, Math.min(24, extra.length)))
        ) {
          detalheContra = extra.length > 72 ? `${extra.slice(0, 72)}…` : extra;
        }
      }
      const partesSub = ordenarPartesSubtitulo({
        tipoOperacao: tipoOp,
        documentoRotulo: rotuloDocumentoExibicao(docInst),
        bandeira: inferirBandeiraFinanceira(texto),
        contraparteOuDetalhe: detalheContra,
      });
      return {
        tituloPrincipal: capitalizarPrimeira(tituloExibir),
        subtitulo: partesSub.length ? partesSub.join(" · ") : null,
        textoBrutoTituloFallback: false,
      };
    }
  }

  const tipo = resolverTipoOperacaoDescricao(texto);
  const apos = indiceAposGatilhoPix(texto);
  const nomePosPix = extrairEstabelecimentoPosPix(texto);

  if (nomePosPix && apos >= 0) {
    const tituloPrincipal = formatarTituloComercialPt(nomePosPix.trim());
    const cabeca = texto.slice(0, apos).trim();
    const docInst = extrairDocumento(cabeca);
    const docSoDigitos = docInst?.replace(/\D/g, "") ?? "";
    const titSoDigitos = tituloPrincipal.replace(/\D/g, "");
    const bandeiraCabeca = inferirBancoOuAdquirente(cabeca);
    const bandeiraFull = inferirBandeiraFinanceira(texto);
    const bandeira = bandeiraCabeca ?? bandeiraFull;
    const partesSub = ordenarPartesSubtitulo({
      tipoOperacao: tipo,
      documentoRotulo:
        docInst && !(docSoDigitos.length >= 8 && titSoDigitos.includes(docSoDigitos))
          ? rotuloDocumentoExibicao(docInst)
          : null,
      bandeira:
        bandeira && !tituloPrincipal.toUpperCase().includes(bandeira.toUpperCase())
          ? bandeira
          : null,
      contraparteOuDetalhe: null,
    });

    return {
      tituloPrincipal,
      subtitulo: partesSub.length ? partesSub.join(" · ") : null,
      textoBrutoTituloFallback: false,
    };
  }

  return montarExibicaoFallbackAnalisada(texto, tipo);
}
