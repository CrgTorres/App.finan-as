import * as XLSX from "xlsx";
import type { AnaliseExportPayload } from "@/lib/analise/build-analise-export-payload";
import { downloadBlob } from "@/lib/utils/download-blob";

function sheetFromRows<T extends Record<string, unknown>>(rows: T[]): XLSX.WorkSheet {
  if (rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([["Sem dados"]]);
  }
  return XLSX.utils.json_to_sheet(rows);
}

export function exportAnaliseXlsx(payload: AnaliseExportPayload, filenameBase = "analise-financeira"): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.contratos.map((c) => ({
        "Código folha": c.codigo_folha,
        Instituição: c.instituicao,
        "Descrição padronizada": c.descricao_padronizada,
        "Família produto": c.familia_produto,
        "Valor parcela": c.valor_parcela,
        "Parcela atual": c.parcela_atual,
        "Total parcelas": c.parcela_total,
        "Faixa parcelas": c.faixa_parcelas,
        "Total pago": c.total_pago,
        "Saldo estimado": c.saldo_estimado,
        Status: c.status,
        Risco: c.risco,
        "Primeira competência": c.primeira_competencia,
        "Última competência": c.ultima_competencia,
        "Qtd competências": c.qtd_competencias,
        "Variantes OCR": c.variantes_ocr,
        "Textos OCR brutos": c.textos_ocr_brutos,
      })),
    ),
    "Contratos",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.resumoMensalContracheque.map((m) => ({
        Competência: m.competencia,
        Ganhos: m.ganhos,
        Descontos: m.descontos,
        Empréstimos: m.emprestimos,
        Líquido: m.liquido,
        "% empréstimo/ganhos": m.pct_emprestimo_ganhos,
        "% desconto/ganhos": m.pct_desconto_ganhos,
        "Contratos simultâneos": m.contratos_simultaneos,
      })),
    ),
    "Resumo mensal",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.serieEmprestimosMensal.map((s) => ({
        Competência: s.competencia,
        "Total empréstimos": s.total_emprestimos,
        "Total exc. IR/Amazon": s.total_exc_ir_amazon,
        "Outros não empréstimo": s.outros_nao_emprestimo,
      })),
    ),
    "Série empréstimos",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.graficos.emprestimosPorAno.map((a) => ({
        Ano: a.ano,
        "Total empréstimos": a.total_emprestimos,
      })),
    ),
    "Gráfico por ano",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.graficos.comprometimentoMensalPct.map((m) => ({
        Competência: m.competencia,
        "% empréstimo/ganhos": m.pct_emprestimo_ganhos,
      })),
    ),
    "Comprometimento",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.graficos.instituicoesRecorrentes.map((i) => ({
        Instituição: i.instituicao,
        Aparições: i.aparicoes,
        "Valor total": i.valor_total,
      })),
    ),
    "Instituições",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.alertas.map((a) => ({
        ID: a.id,
        Nível: a.nivel,
        Título: a.titulo,
        Detalhe: a.detalhe,
      })),
    ),
    "Alertas",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(payload.pendencias.map((p, i) => ({ "#": i + 1, Pendência: p }))),
    "Pendências",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      payload.evidencias.map((e) => ({
        ID: e.id,
        "Loan ID": e.loan_id,
        Tipo: e.tipo,
        Título: e.titulo,
        "Criado em": e.created_at,
      })),
    ),
    "Evidências",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows([
      { Campo: "Exportado em", Valor: payload.exportedAt },
      { Campo: "Período overview", Valor: payload.periodoOverview },
      { Campo: "Competências processadas", Valor: payload.meta.competenciasProcessadas },
      { Campo: "Contratos canônicos", Valor: payload.meta.nContratosCanonico },
      { Campo: "Contratos painel empréstimos", Valor: payload.meta.nContratosPainelEmprestimos },
    ]),
    "Meta",
  );

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const date = payload.exportedAt.slice(0, 10);
  downloadBlob(
    buf,
    `${filenameBase}-${date}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
