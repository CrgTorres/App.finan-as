"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, ClipboardPaste, Trash2, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseConsigfacilTexto } from "@/lib/consignacoes-governo/parser-consigfacil-print";
import { parseConsigfacilHtml } from "@/lib/consignacoes-governo/parser-consigfacil-html";
import type { ConsigfacilSnapshot } from "@/types/consigfacil";

export type ConsigfacilImportarProps = {
  /** Snapshots já armazenados (para exibir/remover). */
  snapshots: ConsigfacilSnapshot[];
  /** Callback executado quando o usuário confirma um novo snapshot. */
  onSnapshotImportado: (snapshot: ConsigfacilSnapshot) => void | Promise<void>;
  /** Callback para remover (por `capturado_em`). */
  onRemoverSnapshot: (capturadoEm: string) => void | Promise<void>;
  /** Estado de persistência ("supabase" | "local" | null). */
  origem: "supabase" | "local" | null;
};

/**
 * Caixa para importar dados do ConsigFácil:
 *  - cole texto (CTRL+A / CTRL+C da tela)
 *  - cole HTML (clique-direito → Salvar como ou copiar fonte)
 *  - upload `.html` ou `.txt`
 *
 * Mostra preview do que foi extraído e permite confirmar para salvar.
 */
export function ConsigfacilImportar({
  snapshots,
  onSnapshotImportado,
  onRemoverSnapshot,
  origem,
}: ConsigfacilImportarProps) {
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<ConsigfacilSnapshot | null>(null);
  const [processando, setProcessando] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function gerarPreview(): void {
    if (!texto.trim()) {
      toast.error("Cole o texto ou HTML do ConsigFácil antes de gerar a prévia.");
      return;
    }
    const ehHtml = /<\/?[a-z][^>]*>/i.test(texto);
    const docOrigem =
      ehHtml ? "consigfacil-paste.html" : "consigfacil-paste.txt";
    const snapshot = ehHtml
      ? parseConsigfacilHtml({ html: texto, documentoOrigem: docOrigem })
      : parseConsigfacilTexto({ texto, documentoOrigem: docOrigem });
    setPrevia(snapshot);
    if (snapshot.contratos.length === 0 && snapshot.margens.length === 0) {
      toast.warning(
        "Nenhuma consignação ou margem identificada. Verifique se o texto colado contém a tela do ConsigFácil.",
      );
    } else {
      toast.success(
        `Identificado(s) ${snapshot.contratos.length} contrato(s) e ${snapshot.margens.length} margem(s).`,
      );
    }
  }

  async function confirmarImportacao(): Promise<void> {
    if (!previa) return;
    setProcessando(true);
    try {
      await onSnapshotImportado(previa);
      setTexto("");
      setPrevia(null);
      toast.success("Snapshot ConsigFácil salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar snapshot.");
    } finally {
      setProcessando(false);
    }
  }

  async function carregarArquivo(file: File): Promise<void> {
    const conteudo = await file.text();
    setTexto(conteudo);
    const ehHtml = /<\/?[a-z][^>]*>/i.test(conteudo);
    const snapshot = ehHtml
      ? parseConsigfacilHtml({ html: conteudo, documentoOrigem: file.name })
      : parseConsigfacilTexto({ texto: conteudo, documentoOrigem: file.name });
    setPrevia(snapshot);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Integração ConsigFácil (Governo AM)</CardTitle>
            <CardDescription>
              Cole o texto da tela "Consignações em andamento" ou da tela inicial (margens).
              Ao confirmar, o <strong>pipeline oficial</strong> executa parse → matching →
              conciliação → correção automática (score ≥ 90) e recalcula dashboards/exportação.
            </CardDescription>
          </div>
          {origem === "local" && (
            <Badge variant="outline" className="gap-1 text-xs">
              <FileWarning className="h-3 w-3" />
              salvando localmente
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="w-full min-h-32 rounded-md border border-border bg-background p-2 text-sm font-mono"
          placeholder="Cole aqui o texto ou HTML do ConsigFácil…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrevia(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={gerarPreview} disabled={processando}>
            <ClipboardPaste className="h-4 w-4" /> Gerar prévia
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={processando}
          >
            <Upload className="h-4 w-4" /> Carregar HTML/TXT
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void carregarArquivo(f);
              e.target.value = "";
            }}
          />
          {previa && (
            <Button onClick={() => void confirmarImportacao()} disabled={processando}>
              {processando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Confirmar e salvar
            </Button>
          )}
        </div>

        {previa && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold">Prévia:</span>
              <Badge variant="outline">{previa.contratos.length} contratos</Badge>
              <Badge variant="outline">{previa.margens.length} margens</Badge>
              <Badge variant="outline">{previa.cartoes.length} cartões</Badge>
              <Badge variant="outline">{previa.historico.length} eventos</Badge>
            </div>
            {previa.avisos.length > 0 && (
              <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-4">
                {previa.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {previa.contratos.length > 0 && (
              <ul className="text-xs space-y-1">
                {previa.contratos.slice(0, 6).map((c) => (
                  <li key={c.id_consignacao}>
                    <span className="font-mono">{c.id_consignacao}</span> · {c.instituicao} · R${" "}
                    {c.valor_parcela.toFixed(2)} · {c.parcela_atual}/{c.parcelas_total} ·{" "}
                    <Badge variant="outline" className="text-[10px]">
                      {c.status}
                    </Badge>
                  </li>
                ))}
                {previa.contratos.length > 6 && (
                  <li className="text-muted-foreground">
                    … +{previa.contratos.length - 6} contrato(s)
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {snapshots.length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Snapshots salvos ({snapshots.length})
            </p>
            <ul className="space-y-1">
              {snapshots.slice(0, 12).map((s) => (
                <li
                  key={s.capturado_em}
                  className="text-xs flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-mono">{s.capturado_em.slice(0, 16).replace("T", " ")}</span>{" "}
                      · {s.documento_origem} · {s.origem}
                    </p>
                    <p className="text-muted-foreground">
                      {s.contratos.length} contrato(s) · {s.margens.length} margem(ns)
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void onRemoverSnapshot(s.capturado_em)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
