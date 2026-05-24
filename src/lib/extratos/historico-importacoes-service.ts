import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingDbColumnError,
  probeTransactionsSourceTrackingColumns,
} from "@/lib/supabase/transactions-source-columns";
import { rotuloExtratoInferidoPorNomeArquivo } from "@/lib/transacoes/normalizacao-semantica-transacao";

/**
 * Representa um grupo de transações que vieram do mesmo extrato (mesmo arquivo / mesmo hash).
 * Não corresponde a nenhuma tabela do Supabase — é derivado das colunas de rastreio
 * (`source_file_name`, `source_file_hash`, `source_imported_at`) da tabela `transactions`.
 */
export type HistoricoImportacaoExtrato = {
  /** Chave estável do grupo (hash quando existir; caso contrário, nome do arquivo). */
  key: string;
  /** Rótulo curto exibido (banco inferido pelo nome do arquivo). */
  bancoLabel: string;
  /** Nome bruto do arquivo (vindo de `source_file_name`), quando disponível. */
  fileName: string | null;
  /** Conjunto de meses cobertos pelas transações importadas (`YYYY-MM`), ordenado asc. */
  meses: string[];
  /** Total de transações importadas pertencentes a esse grupo. */
  quantidade: number;
  /** ISO da última importação registada (`source_imported_at`), quando disponível. */
  ultimaImportacao: string | null;
  /** Data mais antiga e mais recente entre as transações deste grupo (campo `date` ISO). */
  intervaloDatas: { min: string; max: string } | null;
};

type HistoricoImportacoesResultado = {
  /** Grupos ordenados por importação mais recente primeiro (ou pela data mais recente quando indisponível). */
  grupos: HistoricoImportacaoExtrato[];
  /** Indica se nenhuma coluna de rastreio está disponível (schema antigo). */
  rastreioIndisponivel: boolean;
  /** Mensagem de erro humana (apenas para `console.warn` / toast no chamador). */
  error: Error | null;
};

type LinhaRastreio = {
  date: string | null;
  source_file_name: string | null;
  source_file_hash: string | null;
  source_imported_at: string | null;
};

const LIMITE_LEITURA_HISTORICO = 5000;

/**
 * Lê transações com colunas de rastreio para agrupar por arquivo/banco e meses cobertos.
 * Retorna `rastreioIndisponivel=true` quando o schema antigo do Supabase ainda não tem
 * `source_file_name`/`source_file_hash` (estado típico antes da migration).
 */
export async function listarHistoricoImportacoesExtrato(
  client: SupabaseClient,
  userId: string,
): Promise<HistoricoImportacoesResultado> {
  const cols = await probeTransactionsSourceTrackingColumns(client);
  if (!cols.sourceFileName && !cols.sourceFileHash && !cols.sourceImportedAt) {
    return { grupos: [], rastreioIndisponivel: true, error: null };
  }

  const camposSelect = [
    "date",
    cols.sourceFileName ? "source_file_name" : null,
    cols.sourceFileHash ? "source_file_hash" : null,
    cols.sourceImportedAt ? "source_imported_at" : null,
  ]
    .filter(Boolean)
    .join(", ");

  let query = client
    .from("transactions")
    .select(camposSelect)
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(LIMITE_LEITURA_HISTORICO);

  if (cols.sourceFileName && cols.sourceFileHash) {
    query = query.or("source_file_name.not.is.null,source_file_hash.not.is.null");
  } else if (cols.sourceFileName) {
    query = query.not("source_file_name", "is", null);
  } else if (cols.sourceFileHash) {
    query = query.not("source_file_hash", "is", null);
  } else if (cols.sourceImportedAt) {
    query = query.not("source_imported_at", "is", null);
  }

  const res = await query;
  if (res.error) {
    if (isMissingDbColumnError(res.error)) {
      return { grupos: [], rastreioIndisponivel: true, error: null };
    }
    return {
      grupos: [],
      rastreioIndisponivel: false,
      error: new Error(res.error.message),
    };
  }

  const rows = ((res.data ?? []) as unknown) as LinhaRastreio[];
  const grupos = agruparHistoricoPorArquivo(rows);
  return { grupos, rastreioIndisponivel: false, error: null };
}

/**
 * Agrupa as linhas pelo identificador mais estável disponível:
 * `source_file_hash` quando presente, senão `source_file_name`, descartando entradas
 * sem nenhum dos dois (não conseguimos atribuir banco/origem).
 */
function agruparHistoricoPorArquivo(rows: LinhaRastreio[]): HistoricoImportacaoExtrato[] {
  type Acumulador = {
    key: string;
    fileName: string | null;
    meses: Set<string>;
    quantidade: number;
    ultimaImportacao: string | null;
    minDate: string | null;
    maxDate: string | null;
  };

  const mapa = new Map<string, Acumulador>();

  for (const row of rows) {
    const hash = (row.source_file_hash ?? "").trim() || null;
    const name = (row.source_file_name ?? "").trim() || null;
    const key = hash ?? name;
    if (!key) continue;

    let acc = mapa.get(key);
    if (!acc) {
      acc = {
        key,
        fileName: name,
        meses: new Set<string>(),
        quantidade: 0,
        ultimaImportacao: null,
        minDate: null,
        maxDate: null,
      };
      mapa.set(key, acc);
    } else if (!acc.fileName && name) {
      acc.fileName = name;
    }

    acc.quantidade += 1;

    const dateIso = (row.date ?? "").trim();
    if (dateIso.length >= 7) {
      acc.meses.add(dateIso.slice(0, 7));
      if (!acc.minDate || dateIso < acc.minDate) acc.minDate = dateIso;
      if (!acc.maxDate || dateIso > acc.maxDate) acc.maxDate = dateIso;
    }

    const importedAt = (row.source_imported_at ?? "").trim();
    if (importedAt) {
      if (!acc.ultimaImportacao || importedAt > acc.ultimaImportacao) {
        acc.ultimaImportacao = importedAt;
      }
    }
  }

  const grupos: HistoricoImportacaoExtrato[] = Array.from(mapa.values()).map((acc) => ({
    key: acc.key,
    bancoLabel:
      rotuloExtratoInferidoPorNomeArquivo(acc.fileName) ??
      acc.fileName?.replace(/\.[^.]+$/, "") ??
      "Extrato sem nome",
    fileName: acc.fileName,
    meses: Array.from(acc.meses).sort(),
    quantidade: acc.quantidade,
    ultimaImportacao: acc.ultimaImportacao,
    intervaloDatas:
      acc.minDate && acc.maxDate ? { min: acc.minDate, max: acc.maxDate } : null,
  }));

  grupos.sort((a, b) => {
    const aRef = a.ultimaImportacao ?? a.intervaloDatas?.max ?? "";
    const bRef = b.ultimaImportacao ?? b.intervaloDatas?.max ?? "";
    return bRef.localeCompare(aRef);
  });

  return grupos;
}

const MESES_ABREV_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/**
 * `2025-03` → `mar/25`. Devolve a entrada original quando o formato é inesperado
 * para não esconder bugs de parsing em produção.
 */
export function formatarMesAnoCurtoPt(mesIso: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(mesIso.trim());
  if (!match) return mesIso;
  const ano = match[1];
  const mes = Number(match[2]);
  if (mes < 1 || mes > 12) return mesIso;
  return `${MESES_ABREV_PT[mes - 1]}/${ano.slice(2)}`;
}
