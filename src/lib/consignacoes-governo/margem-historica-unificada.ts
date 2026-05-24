/**

 * Margem histórica UNIFICADA:

 *

 *  - consignavel

 *  - cartao

 *  - cartao_beneficio

 *

 * Fontes (por competência, prioridade):

 *  1. ConsigFácil oficial (snapshot do portal)

 *  2. Estimativa a partir do contracheque (proventos − obrigatórios × % legal)

 */



import type { Payslip } from "@/types/contracheque";

import type {

  BaseMargemConsignavel,

  ConsigfacilResumoMensalMargem,

  ConsigfacilTipoMargem,

} from "@/types/consigfacil";

import {

  ANO_INICIO_MARGEM_HISTORICA,

  calcularMargemHistoricaDesdeFolha,

  indexarMargensOficiais,

  mesclarDetalheComOficial,

  type MargemHistoricaDetalhe,

} from "./calcular-margem-desde-folha";

import {

  gerarAnaliseMargemHistorica,

  type AnaliseMargemHistorica,

} from "./analise-margem-historica";

export type { AnaliseMargemHistorica, InsightMargemHistorica } from "./analise-margem-historica";
export type { MargemHistoricaDetalhe } from "./calcular-margem-desde-folha";

export type TipoMargemHistorica = "consignavel" | "cartao" | "cartao_beneficio";



export type OrigemMargemHistorica =

  | "consigfacil_oficial"

  | "extrapolacao_descontos"

  | "inferencia";



export type MargemHistorica = {

  competencia: string;

  margem_total: number;

  margem_utilizada: number;

  margem_disponivel: number;

  percentual_comprometido: number;

  tipo_margem: TipoMargemHistorica;

  origem: OrigemMargemHistorica;

};



export type PacoteMargemHistorica = {

  historico: MargemHistorica[];

  detalhes: MargemHistoricaDetalhe[];

  analise: AnaliseMargemHistorica;

};



function tipoMargemDoConsigfacil(t: ConsigfacilTipoMargem): TipoMargemHistorica | null {

  if (t === "margem_consignavel") return "consignavel";

  if (t === "margem_cartao") return "cartao";

  if (t === "margem_cartao_beneficio") return "cartao_beneficio";

  return null;

}



function oficialParaDetalhe(m: BaseMargemConsignavel): MargemHistoricaDetalhe | null {

  const tipo = tipoMargemDoConsigfacil(m.tipo_margem);

  if (!tipo) return null;

  return {

    competencia: m.competencia,

    margem_total: m.margem_total,

    margem_utilizada: m.margem_utilizada,

    margem_disponivel: m.margem_disponivel,

    percentual_comprometido: m.percentual_comprometido,

    tipo_margem: tipo,

    origem: "consigfacil_oficial",

    base_remuneracao: null,

    componentes: null,

    oficial_consigfacil: null,

  };

}



/** Monta série completa folha + portal + análise. */

export function montarPacoteMargemHistorica(input: {

  margensConsigfacil: BaseMargemConsignavel[];

  resumoMargemMensal?: ConsigfacilResumoMensalMargem[];

  payslips?: Payslip[];

  anoInicio?: number;

}): PacoteMargemHistorica {

  const anoInicio = input.anoInicio ?? ANO_INICIO_MARGEM_HISTORICA;

  const indexOficial = indexarMargensOficiais(input.margensConsigfacil);

  const daFolha = calcularMargemHistoricaDesdeFolha(input.payslips ?? [], { anoInicio });



  const porChave = new Map<string, MargemHistoricaDetalhe>();



  for (const linha of daFolha) {

    const chave = `${linha.competencia}__${linha.tipo_margem}`;

    const oficial = indexOficial.get(chave);

    porChave.set(chave, mesclarDetalheComOficial(linha, oficial));

    if (oficial) indexOficial.delete(chave);

  }



  for (const [, oficial] of indexOficial) {

    const det = oficialParaDetalhe(oficial);

    if (!det) continue;

    const chave = `${det.competencia}__${det.tipo_margem}`;

    porChave.set(chave, det);

  }



  const detalhes = Array.from(porChave.values()).sort((a, b) =>

    a.competencia === b.competencia

      ? a.tipo_margem.localeCompare(b.tipo_margem)

      : a.competencia.localeCompare(b.competencia),

  );



  const historico: MargemHistorica[] = detalhes.map((d) => ({

    competencia: d.competencia,

    margem_total: d.margem_total,

    margem_utilizada: d.margem_utilizada,

    margem_disponivel: d.margem_disponivel,

    percentual_comprometido: d.percentual_comprometido,

    tipo_margem: d.tipo_margem,

    origem: d.origem,

  }));



  const analise = gerarAnaliseMargemHistorica(historico, detalhes, {
    anoInicio,
    resumoMargemMensal: input.resumoMargemMensal,
  });



  return { historico, detalhes, analise };

}



/** Compatível com chamadas antigas — só retorna a série. */

export function montarMargemHistoricaUnificada(input: {

  margensConsigfacil: BaseMargemConsignavel[];

  payslips?: Payslip[];

  anoInicio?: number;

}): MargemHistorica[] {

  return montarPacoteMargemHistorica(input).historico;

}


