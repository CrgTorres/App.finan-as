"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { ContratoExtraido } from "@/types/contrato-extraido";

export type CampoConferenciaEditavel =
  | "cliente"
  | "parcelas"
  | "dataDocumento"
  | "dataContratacao"
  | "dataAssinatura"
  | "primeiroVencimento"
  | "ultimoVencimento";

const LABEL_CAMPO: Partial<Record<keyof ContratoExtraido, string>> = {
  banco: "Banco",
  cliente: "Cliente / emitente (mutuário)",
  cpf: "CPF do consumidor",
  atendenteNome: "Atendente / correspondente",
  atendenteCpf: "CPF do atendente",
  parcela: "Valor da parcela",
  parcelas: "Quantidade de parcelas",
  valorSolicitado: "Valor solicitado",
  valorFinanciado: "Valor financiado",
  valorTotalPago: "Total das parcelas",
  iof: "IOF",
  cetAnual: "CET anual (%)",
  dataDocumento: "Data do documento (CCB)",
  dataContratacao: "Data do contrato / emissão",
  dataAssinatura: "Data na assinatura",
  primeiroVencimento: "1º vencimento (E.2)",
  ultimoVencimento: "Último vencimento (E.2)",
};

const LABEL_COMPACTO: Partial<Record<keyof ContratoExtraido, string>> = {
  banco: "Banco",
  cliente: "Mutuário (sec. II)",
  cpf: "CPF consumidor",
  atendenteNome: "Atendente",
  atendenteCpf: "CPF atendente",
  parcela: "Parcela",
  parcelas: "Nº parcelas",
  valorSolicitado: "Solicitado",
  valorFinanciado: "Financiado",
  valorTotalPago: "Total parcelas",
  iof: "IOF",
  primeiroVencimento: "1º vencimento",
  ultimoVencimento: "Último vencimento",
};

function rotuloCampo(k: keyof ContratoExtraido, compacto: boolean, override?: string): string {
  if (override) return override;
  if (compacto && LABEL_COMPACTO[k]) return LABEL_COMPACTO[k]!;
  return LABEL_CAMPO[k] ?? k;
}

function CampoLinha({
  label,
  editavel,
  compacto,
  children,
  destaque = "",
}: {
  label: string;
  editavel?: boolean;
  compacto?: boolean;
  children: ReactNode;
  destaque?: string;
}) {
  const caixaLeitura = compacto
    ? "text-xs py-1 px-2 min-h-[1.75rem] flex items-center"
    : "text-sm py-1.5 px-2.5";

  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground leading-tight">{label}</p>
      {editavel ? (
        <div className={destaque}>{children}</div>
      ) : (
        <p
          className={`font-medium text-foreground leading-snug rounded border border-border/40 bg-muted/25 tabular-nums ${caixaLeitura} ${destaque}`}
        >
          {children}
        </p>
      )}
    </div>
  );
}

const GRUPOS: {
  titulo: string;
  hint?: string;
  campos: (keyof ContratoExtraido)[];
  sempreMostrar: (keyof ContratoExtraido)[];
}[] = [
  {
    titulo: "Partes",
    hint: "O mutuário é o emitente (sec. II), não o atendente.",
    campos: ["banco", "cliente", "cpf", "atendenteNome", "atendenteCpf"],
    sempreMostrar: ["banco", "cliente", "cpf", "atendenteNome"],
  },
  {
    titulo: "Valores e prazo",
    campos: ["parcela", "parcelas", "valorSolicitado", "valorFinanciado", "iof", "valorTotalPago"],
    sempreMostrar: ["parcela", "parcelas", "valorFinanciado", "iof"],
  },
  {
    titulo: "Datas",
    hint: "Documento (cabeçalho) é distinto do 1º vencimento.",
    campos: ["dataDocumento", "dataContratacao", "dataAssinatura", "primeiroVencimento", "ultimoVencimento"],
    sempreMostrar: [
      "dataDocumento",
      "dataContratacao",
      "primeiroVencimento",
      "ultimoVencimento",
    ],
  },
];

const CAMPOS_OBRIGATORIOS_VAZIOS_COMPACTO = new Set<keyof ContratoExtraido>([
  "banco",
  "cliente",
  "parcela",
  "parcelas",
  "primeiroVencimento",
  "ultimoVencimento",
  "dataDocumento",
  "dataContratacao",
  "dataAssinatura",
]);

function incluirCampoNaGrelha(
  k: keyof ContratoExtraido,
  grupo: (typeof GRUPOS)[number],
  extraido: ContratoExtraido | null,
  compacto: boolean,
): boolean {
  const vazio = campoVazio(extraido, k);
  if (!compacto) return grupo.sempreMostrar.includes(k) || !vazio;
  if (!vazio) return true;
  return CAMPOS_OBRIGATORIOS_VAZIOS_COMPACTO.has(k);
}

const CHAVES_DATA = new Set<keyof ContratoExtraido>([
  "dataDocumento",
  "dataContratacao",
  "dataAssinatura",
  "primeiroVencimento",
  "ultimoVencimento",
]);

const DATAS_CABECALHO: (keyof ContratoExtraido)[] = [
  "dataDocumento",
  "dataContratacao",
  "dataAssinatura",
];

function soDigitosCpf(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

type CampoDataExibicao = {
  key: keyof ContratoExtraido;
  label?: string;
};

function campoVazio(extraido: ContratoExtraido | null, k: keyof ContratoExtraido): boolean {
  if (!extraido) return true;
  const v = extraido[k];
  return v === undefined || v === null || (typeof v === "string" && !v.trim());
}

/** Evita 3 linhas com a mesma data quando o OCR repetiu documento/emissão/assinatura. */
function resolverCamposDatas(
  extraido: ContratoExtraido | null,
  compacto: boolean,
): CampoDataExibicao[] {
  const venc = ["primeiroVencimento", "ultimoVencimento"] as const;
  if (!extraido || !compacto) {
    return [...DATAS_CABECALHO, ...venc].map((key) => ({ key }));
  }

  const d = extraido.dataDocumento?.trim();
  const c = extraido.dataContratacao?.trim();
  const a = extraido.dataAssinatura?.trim();

  const cabecalho: CampoDataExibicao[] = [];
  if (d && c && a && d === c && d === a) {
    cabecalho.push({ key: "dataDocumento", label: "Documento / contrato / assinatura" });
  } else if (d && c && d === c) {
    cabecalho.push({ key: "dataDocumento", label: "Documento / emissão" });
    if (a && a !== d) cabecalho.push({ key: "dataAssinatura" });
  } else {
    for (const key of DATAS_CABECALHO) {
      if (!campoVazio(extraido, key)) cabecalho.push({ key });
    }
  }

  return [...cabecalho, ...venc.map((key) => ({ key }))];
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatIsoPt(iso?: string): string {
  if (!iso?.trim()) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatCampo(k: keyof ContratoExtraido, v: ContratoExtraido[keyof ContratoExtraido]): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (
    k === "parcela" ||
    k === "valorSolicitado" ||
    k === "valorFinanciado" ||
    k === "valorTotalPago" ||
    k === "iof"
  ) {
    if (typeof v === "number") return formatBRL(v);
  }
  if (CHAVES_DATA.has(k) && typeof v === "string") return formatIsoPt(v);
  if (typeof v === "number") return String(v);
  return String(v);
}

type Props = {
  extraido: ContratoExtraido | null;
  camposAusentes: (keyof ContratoExtraido)[];
  uploadStandalone?: boolean;
  /** Menos ruído: funde datas iguais, um aviso OCR por secção, oculta CPF se = titular. */
  compacto?: boolean;
  cpfTitularDigitos?: string | null;
  /** Nome do titular logado — atalho quando o OCR não leu o mutuário mas o CPF confere. */
  nomeTitularReferencia?: string | null;
  corrigirDatasManual?: boolean;
  onToggleCorrigirDatas?: () => void;
  onCampoChange?: (campo: CampoConferenciaEditavel, valor: string) => void;
  destaqueCampo: (k: keyof ContratoExtraido) => string;
  cetDetalhe?: ReactNode;
};

export function ConferenciaContratoExtraidoGrid({
  extraido,
  camposAusentes,
  uploadStandalone = false,
  compacto = false,
  cpfTitularDigitos = null,
  nomeTitularReferencia = null,
  corrigirDatasManual = false,
  onToggleCorrigirDatas,
  onCampoChange,
  destaqueCampo,
  cetDetalhe,
}: Props) {
  const podeEditar = uploadStandalone && !!onCampoChange;
  const cpfDoc = soDigitosCpf(typeof extraido?.cpf === "string" ? extraido.cpf : null);
  const ocultarCpfConsumidor =
    compacto &&
    cpfTitularDigitos &&
    cpfDoc.length === 11 &&
    cpfTitularDigitos === cpfDoc;
  const cpfConfereTitular =
    !!cpfTitularDigitos && cpfDoc.length === 11 && cpfTitularDigitos === cpfDoc;

  const camposDatas = corrigirDatasManual
    ? ([...DATAS_CABECALHO, "primeiroVencimento", "ultimoVencimento"] as (keyof ContratoExtraido)[]).map(
        (key) => ({ key }),
      )
    : resolverCamposDatas(extraido, compacto);
  const datasComOcrInferido =
    compacto &&
    extraido &&
    camposDatas.some(({ key }) => CHAVES_DATA.has(key) && !campoVazio(extraido, key));

  function renderCampo(k: keyof ContratoExtraido, labelOverride?: string) {
    const isData = CHAVES_DATA.has(k);
    const editavelData = podeEditar && isData && corrigirDatasManual;
    const editavelCliente = podeEditar && k === "cliente";
    const editavelParcelas = podeEditar && k === "parcelas";
    const vazio = campoVazio(extraido, k);
    const inferido = !compacto && isData && !vazio && !editavelData;
    const editavel = editavelCliente || editavelParcelas || editavelData;
    const label = rotuloCampo(k, compacto, labelOverride);
    const destaque = destaqueCampo(k);

    const inputCls = compacto ? "h-8 text-xs" : "h-9 text-sm";

    return (
      <div key={k}>
        <CampoLinha label={label} editavel={editavel} compacto={compacto} destaque={destaque}>
          {editavelCliente ? (
            <div className="space-y-0.5">
              <Input
                className={`${inputCls} ${destaque}`}
                value={(extraido?.cliente as string) ?? ""}
                placeholder="Nome no contrato (sec. II)"
                onChange={(e) => onCampoChange!("cliente", e.target.value)}
              />
              {vazio && cpfConfereTitular && nomeTitularReferencia?.trim() ? (
                <p className="text-[9px] text-muted-foreground leading-snug">
                  Titular da conta:{" "}
                  <span className="text-foreground/90">{nomeTitularReferencia}</span>
                  {" · "}
                  <button
                    type="button"
                    className="text-sky-700 dark:text-sky-300 underline font-medium"
                    onClick={() => onCampoChange!("cliente", nomeTitularReferencia.trim())}
                  >
                    usar no mutuário
                  </button>
                </p>
              ) : null}
            </div>
          ) : editavelParcelas ? (
            <Input
              type="number"
              min={1}
              max={480}
              className={`${inputCls} max-w-[5.5rem] ${destaque}`}
              value={extraido?.parcelas ?? ""}
              onChange={(e) => onCampoChange!("parcelas", e.target.value)}
            />
          ) : editavelData ? (
            <Input
              type="date"
              className={`${inputCls} max-w-full sm:max-w-[11rem] ${destaque}`}
              value={typeof extraido?.[k] === "string" ? (extraido[k] as string) : ""}
              onChange={(e) => onCampoChange!(k as CampoConferenciaEditavel, e.target.value)}
            />
          ) : (
            <>
              <span
                className={compacto && typeof extraido?.[k] === "string" && (extraido[k] as string).length > 28 ? "truncate block max-w-full" : undefined}
                title={
                  compacto && typeof extraido?.[k] === "string" ? String(extraido[k]) : undefined
                }
              >
                {extraido ? formatCampo(k, extraido[k]) : "—"}
              </span>
              {!compacto && inferido ? (
                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                  inferido do OCR
                </span>
              ) : null}
            </>
          )}
        </CampoLinha>
      </div>
    );
  }

  function campoApareceNaGrelha(k: keyof ContratoExtraido): boolean {
    for (const g of GRUPOS) {
      if (k === "cpf" && ocultarCpfConsumidor) continue;
      if (g.titulo === "Datas") {
        if (camposDatas.some((c) => c.key === k) && incluirCampoNaGrelha(k, g, extraido, compacto)) {
          return true;
        }
      } else if (g.campos.includes(k) && incluirCampoNaGrelha(k, g, extraido, compacto)) {
        return true;
      }
    }
    return false;
  }

  const rotulosAusentesCompacto = compacto
    ? camposAusentes.filter((k) => !campoApareceNaGrelha(k)).map((k) => rotuloCampo(k, true))
    : [];

  return (
    <div className="space-y-4">
      {GRUPOS.map((g) => {
        let itens: CampoDataExibicao[];
        if (g.titulo === "Datas") {
          itens = camposDatas.filter(({ key }) => incluirCampoNaGrelha(key, g, extraido, compacto));
        } else {
          itens = g.campos
            .filter((k) => {
              if (k === "cpf" && ocultarCpfConsumidor) return false;
              return incluirCampoNaGrelha(k, g, extraido, compacto);
            })
            .map((key) => ({ key }));
        }
        if (itens.length === 0) return null;
        const hint =
          !compacto && g.hint
            ? g.hint
            : g.titulo === "Datas" && datasComOcrInferido && !corrigirDatasManual
              ? "Datas inferidas do OCR — use «Corrigir datas» se o PDF divergir."
              : null;

        return (
          <section
            key={g.titulo}
            className="rounded-lg border border-border/50 bg-muted/10 p-3 sm:p-4 space-y-3"
          >
            <div className="border-b border-border/40 pb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">{g.titulo}</h4>
              {hint ? <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{hint}</p> : null}
            </div>
            <div
              className={
                compacto
                  ? "grid gap-2 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]"
                  : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              }
            >
              {itens.map(({ key, label }) => renderCampo(key, label))}
            </div>
          </section>
        );
      })}

      {compacto && rotulosAusentesCompacto.length > 0 ? (
        <p className="text-[10px] text-amber-800/90 dark:text-amber-200/90 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5">
          Não lido no PDF: {rotulosAusentesCompacto.join(" · ")} — confira o original.
        </p>
      ) : null}

      {!compacto ? (
        <div className="rounded-md border border-border/50 bg-background/20 px-3 py-2 text-[10px]">
          <span className="text-muted-foreground">CET (detalhe): </span>
          <span className="font-medium text-foreground">
            {extraido?.cetMensal != null || extraido?.cetAnual != null
              ? `Mensal ${extraido?.cetMensal ?? "—"}% · Anual ${extraido?.cetAnual ?? "—"}%`
              : "—"}
          </span>
          {cetDetalhe}
        </div>
      ) : null}

      {podeEditar && onToggleCorrigirDatas ? (
        <button
          type="button"
          className="text-[9px] text-sky-700 dark:text-sky-300 underline font-medium"
          onClick={onToggleCorrigirDatas}
        >
          {corrigirDatasManual
            ? "Ocultar correção manual de datas"
            : "Corrigir datas manualmente (se o PDF divergir do OCR)"}
        </button>
      ) : null}
    </div>
  );
}
