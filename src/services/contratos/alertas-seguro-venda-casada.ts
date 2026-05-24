import type { AlertaPlausibilidadeContrato, ContratoExtraido } from "@/types/contrato-extraido";
import {
  ALERTA_SEGURO_SERVICO_EMBUTIDO,
  ALERTA_VENDA_CASADA_SEM_RECUSA,
  detectarTermosAcessoriosEmbutidosOcr,
  haValoresCobradosAcessoriosJuntoEmprestimo,
  textoMencionaOpcaoRecusaAcessorio,
  textoMencionaSeguroPrestamista,
  textoMencionaVendaCasadaExplicita,
} from "@/services/contratos/termos-acessorios-embutidos-ocr";

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export {
  ALERTA_SEGURO_SERVICO_EMBUTIDO,
  ALERTA_VENDA_CASADA_SEM_RECUSA,
  detectarTermosAcessoriosEmbutidosOcr,
  textoMencionaSeguroPrestamista,
} from "@/services/contratos/termos-acessorios-embutidos-ocr";

/**
 * Alertas sobre seguro prestamista / acessórios financiados — indícios de venda casada (CDC, art. 39).
 * Não substitui parecer jurídico; orienta conferência do PDF e canais de reclamação.
 */
export function alertasSeguroEVendaCasada(
  e: ContratoExtraido,
  textoBruto?: string,
): AlertaPlausibilidadeContrato[] {
  const a: AlertaPlausibilidadeContrato[] = [];
  const texto = (textoBruto ?? e.textoExtraido ?? "").replace(/\s+/g, " ");
  const principal = Math.max(e.valorFinanciado ?? 0, e.valorSolicitado ?? 0, 0);

  const termosOcr = detectarTermosAcessoriosEmbutidosOcr(texto);
  const rotulosTermos = termosOcr.map((t) => t.rotulo).join(", ");
  const mencionaPrestamista =
    e.seguroPrestamistaMencionado === true || textoMencionaSeguroPrestamista(texto);
  const mencionaAcessorio = termosOcr.length > 0 || mencionaPrestamista;
  const mencionaOpcional = textoMencionaOpcaoRecusaAcessorio(texto);
  const mencionaVendaCasada = textoMencionaVendaCasadaExplicita(texto);
  const temCobranca = haValoresCobradosAcessoriosJuntoEmprestimo(e, texto, termosOcr);

  const solicitado = e.valorSolicitado ?? 0;
  const financiado = e.valorFinanciado ?? 0;
  const iof = e.iof ?? 0;
  const delta = financiado > 0 && solicitado > 0 ? financiado - solicitado : 0;
  const residualAposIof = delta > 0 ? Math.max(0, delta - iof) : 0;

  if (termosOcr.length > 0 && temCobranca) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_servico_embutido_ocr",
      mensagem:
        rotulosTermos.length > 0
          ? `${ALERTA_SEGURO_SERVICO_EMBUTIDO} Termos no OCR: ${rotulosTermos}.`
          : ALERTA_SEGURO_SERVICO_EMBUTIDO,
    });
  }

  if (
    mencionaAcessorio &&
    !mencionaOpcional &&
    (temCobranca || mencionaVendaCasada || (e.seguro != null && e.seguro > 0))
  ) {
    a.push({
      severidade: "critico",
      codigo: "venda_casada_sem_recusa_ocr",
      mensagem: ALERTA_VENDA_CASADA_SEM_RECUSA,
    });
  }

  if (mencionaPrestamista && termosOcr.length === 0) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_prestamista_texto",
      mensagem:
        "O documento menciona seguro prestamista (ou equivalente: proteção financeira, seguro de vida do tomador, MIP/DFI). Financiar o prémio sem demonstrar que foi opcional pode caracterizar venda casada (CDC, art. 39, I) — confira a secção de despesas/acessórios e eventuais declarações de opt-in.",
    });
  }

  if (mencionaPrestamista && (e.seguro == null || e.seguro <= 0) && residualAposIof < 50 && delta > 0) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_so_texto_sem_valor_financiado",
      mensagem: `O texto cita seguro prestamista, mas não há valor de seguro em R$ no quadro e a diferença financiado−solicitado (${fmtBrl(delta)}) explica-se pelo IOF (${fmtBrl(iof)}). Indício forte de que não há prémio de seguro embutido neste contrato — só menção contratual/genérica. Confira sec. C do PDF.`,
    });
  } else if (mencionaPrestamista && (e.seguro == null || e.seguro <= 0) && delta <= 0 && !temCobranca) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_so_texto_sem_valor",
      mensagem:
        "Há menção a seguro prestamista no OCR, mas nenhum valor em R$ foi lido. Isso costuma ser cláusula do modelo, não prova de que contratou seguro — veja sec. C se existe linha «seguro» com valor.",
    });
  }

  if (e.seguro != null && e.seguro > 0 && principal > 0) {
    const pct = (e.seguro / principal) * 100;
    a.push({
      severidade: pct > 8 ? "critico" : "aviso",
      codigo: "seguro_valor_quadro",
      mensagem: `Consta seguro/acessório de ${fmtBrl(e.seguro)} no quadro (~${pct.toFixed(1)}% do valor do crédito). Verifique se integra o CET e se houve alternativa de não contratar — custo acessório relevante para revisão de venda casada.`,
    });
  }

  if (residualAposIof >= 80 && principal > 0) {
    a.push({
      severidade: "aviso",
      codigo: "acessorios_financiados_residual",
      mensagem: `Valor financiado supera o solicitado em ${fmtBrl(delta)} (IOF ${fmtBrl(iof)}); restam ~${fmtBrl(residualAposIof)} que podem ser seguro, tarifas ou outros acessórios embutidos. Compare sec. B/C do PDF.`,
    });
  }

  if (mencionaPrestamista && !mencionaOpcional && !a.some((x) => x.codigo === "venda_casada_sem_recusa_ocr")) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_sem_clausula_opcional",
      mensagem:
        "Não foi encontrada no texto menção clara de que o seguro é opcional ou pode ser contratado separadamente. Na dúvida, guarde o PDF, gravações e proposta; considere Procon, Bacen (registro de reclamação) ou consumidor.gov.",
    });
  }

  if (
    mencionaVendaCasada ||
    (mencionaPrestamista && e.seguro != null && e.seguro > 0 && !a.some((x) => x.codigo === "venda_casada_sem_recusa_ocr"))
  ) {
    a.push({
      severidade: "critico",
      codigo: "indicio_venda_casada_seguro",
      mensagem:
        "Indício relevante de seguro atrelado ao crédito (possível venda casada). Documente: orçamento, CCB, declaração de opcionalidade, CET com e sem seguro. Isto é alerta heurístico do app, não parecer jurídico.",
    });
  }

  if (mencionaOpcional && mencionaAcessorio) {
    a.push({
      severidade: "aviso",
      codigo: "seguro_mencionado_como_opcional",
      mensagem:
        "O texto sugere que o seguro pode ser opcional ou contratado à parte — ainda assim confira se o valor financiado inclui o prémio e se a opção de recusa consta de forma destacada no PDF assinado.",
    });
  }

  return a;
}
