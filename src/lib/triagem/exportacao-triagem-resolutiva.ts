import { ROTULOS_CLASSIFICACAO_RESOLUCAO } from "@/lib/triagem/triagem-resolutiva-tipos";
import type {
  ItemTriagemResolutiva,
  LinhaExportacaoTriagemResolutiva,
} from "@/lib/triagem/triagem-resolutiva-tipos";

export function linhasExportacaoTriagemResolutiva(
  itens: ItemTriagemResolutiva[],
): LinhaExportacaoTriagemResolutiva[] {
  return itens.map((item) => {
    const p = item.pendencia;
    const m = item.motor;
    const ru = item.resolucao_usuario;

    const resolucaoFinal = ru?.resultado.nova_classificacao ?? ROTULOS_CLASSIFICACAO_RESOLUCAO[m.classificacao];
    const removido =
      ru?.resultado.remover_pendencia || (m.resolvido && m.remover_conferencia);

    const perguntasIds = Object.keys(ru?.respostas ?? {});
    const ultimaPergunta = perguntasIds[perguntasIds.length - 1] ?? "";

    const campos = m.campos_aplicados ?? {};

    return {
      banco: p.instituicao_oficial ?? "",
      contrato: p.id_consignacao ?? "",
      competencia: p.competencia ?? "",
      divergencia: p.descricao,
      motivo: p.motivo_quebra_desconto ?? m.explicacao,
      resolucao: resolucaoFinal,
      origem_resolucao: ru ? "pergunta_usuario" : m.origem,
      pergunta_utilizada: ultimaPergunta,
      resposta_usuario: ru ? JSON.stringify(ru.respostas) : "",
      aprendizado_aplicado: item.aprendizado_aplicado ? "sim" : "nao",
      risco: m.nivel_risco,
      removido_conferencia: removido ? "sim" : "nao",
      confianca_pct: Math.round((ru?.resultado.nivel_confianca ?? m.confianca) * 100),
      explicacao: ru?.resultado.motivo ?? m.explicacao,
      desconto_fracionado_por_margem:
        m.classificacao === "desconto_fracionado" ||
        campos.desconto_fracionado_por_margem === true
          ? "sim"
          : "nao",
      soma_descontos_mes:
        (campos.soma_descontos_mes as number | undefined) ??
        (campos.soma_descontos_folha as number | undefined) ??
        "",
      linhas_compensatorias: String(campos.linhas_compensatorias ?? ""),
      margem_reduzida_detectada: campos.margem_reduzida_detectada === true ? "sim" : "nao",
      removido_da_conferencia: removido ? "sim" : "nao",
    };
  });
}
