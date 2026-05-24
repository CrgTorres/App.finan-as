import type { AnaliseExportPayload } from "@/lib/analise/build-analise-export-payload";
import {
  formatarNumeroCsvBr,
  linhasParaCsv,
} from "@/lib/analise/build-analise-export-payload";
import { downloadTextFile } from "@/lib/utils/download-blob";

export type AnaliseCsvTabela = "contratos" | "resumo_mensal" | "serie_emprestimos" | "completo";

function stamp(payload: AnaliseExportPayload): string {
  return payload.exportedAt.slice(0, 10);
}

function csvContratos(payload: AnaliseExportPayload): string {
  return linhasParaCsv(
    [
      "Código folha",
      "Instituição",
      "Descrição padronizada",
      "Família produto",
      "Valor parcela",
      "Parcela atual",
      "Total parcelas",
      "Faixa parcelas",
      "Total pago",
      "Saldo estimado",
      "Status",
      "Risco",
      "Primeira competência",
      "Última competência",
      "Qtd competências",
      "Variantes OCR",
      "Textos OCR brutos",
    ],
    payload.contratos.map((c) => [
      c.codigo_folha,
      c.instituicao,
      c.descricao_padronizada,
      c.familia_produto,
      formatarNumeroCsvBr(c.valor_parcela),
      c.parcela_atual,
      c.parcela_total,
      c.faixa_parcelas,
      formatarNumeroCsvBr(c.total_pago),
      formatarNumeroCsvBr(c.saldo_estimado),
      c.status,
      c.risco,
      c.primeira_competencia,
      c.ultima_competencia,
      c.qtd_competencias,
      c.variantes_ocr,
      c.textos_ocr_brutos,
    ]),
  );
}

function csvResumoMensal(payload: AnaliseExportPayload): string {
  return linhasParaCsv(
    [
      "Competência",
      "Ganhos",
      "Descontos",
      "Empréstimos",
      "Líquido",
      "% empréstimo/ganhos",
      "% desconto/ganhos",
      "Contratos simultâneos",
    ],
    payload.resumoMensalContracheque.map((m) => [
      m.competencia,
      formatarNumeroCsvBr(m.ganhos),
      formatarNumeroCsvBr(m.descontos),
      formatarNumeroCsvBr(m.emprestimos),
      formatarNumeroCsvBr(m.liquido),
      m.pct_emprestimo_ganhos != null ? formatarNumeroCsvBr(m.pct_emprestimo_ganhos) : "",
      m.pct_desconto_ganhos != null ? formatarNumeroCsvBr(m.pct_desconto_ganhos) : "",
      m.contratos_simultaneos,
    ]),
  );
}

function csvSerieEmprestimos(payload: AnaliseExportPayload): string {
  return linhasParaCsv(
    ["Competência", "Total empréstimos", "Total exc. IR/Amazon", "Outros não empréstimo"],
    payload.serieEmprestimosMensal.map((s) => [
      s.competencia,
      formatarNumeroCsvBr(s.total_emprestimos),
      formatarNumeroCsvBr(s.total_exc_ir_amazon),
      formatarNumeroCsvBr(s.outros_nao_emprestimo),
    ]),
  );
}

export function exportAnaliseCsv(
  payload: AnaliseExportPayload,
  tabela: AnaliseCsvTabela = "completo",
  filenameBase = "analise-financeira",
): void {
  const date = stamp(payload);
  if (tabela === "contratos") {
    downloadTextFile(csvContratos(payload), `${filenameBase}-contratos-${date}.csv`, "text/csv;charset=utf-8;", true);
    return;
  }
  if (tabela === "resumo_mensal") {
    downloadTextFile(
      csvResumoMensal(payload),
      `${filenameBase}-resumo-mensal-${date}.csv`,
      "text/csv;charset=utf-8;",
      true,
    );
    return;
  }
  if (tabela === "serie_emprestimos") {
    downloadTextFile(
      csvSerieEmprestimos(payload),
      `${filenameBase}-serie-emprestimos-${date}.csv`,
      "text/csv;charset=utf-8;",
      true,
    );
    return;
  }
  const bloco = [
    "=== CONTRATOS ===",
    csvContratos(payload),
    "",
    "=== RESUMO MENSAL ===",
    csvResumoMensal(payload),
    "",
    "=== SÉRIE EMPRÉSTIMOS ===",
    csvSerieEmprestimos(payload),
  ].join("\n");
  downloadTextFile(bloco, `${filenameBase}-completo-${date}.csv`, "text/csv;charset=utf-8;", true);
}
