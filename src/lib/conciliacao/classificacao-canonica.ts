/**
 * Fachada de classificação canônica para a camada de conciliação.
 * Reexporta a classificação principal e helpers de divergência do catálogo local.
 */

export {
  calcularConfiancaClassificacao,
  classificarLinhaFinanceira,
  inferirGrupoPorDescricao,
  grupoCanonicoParaFinanceiro,
  normalizarInstituicaoConsigfacil,
  normalizarModalidadeConsigfacil,
  type EntradaClassificacao,
  type ResolucaoInstituicao,
} from "@/lib/consignacoes-governo/classificacao-canonica";

export {
  aplicarCatalogoRubricasFinanceiras,
  ehDivergenciaClassificacaoReal,
  instituicoesFinanceirasEquivalentes,
  limparMotivoModalidadeNaoReconhecida,
  modalidadesEmprestimoEquivalentes,
  isDivergenciaApenasCatalogo,
  resolverInstituicaoPorRubrica,
  type ResultadoClassificacaoComCatalogoRubrica,
} from "@/lib/conciliacao/catalogo-rubricas-financeiras";
