"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Calendar, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listarHistoricoImportacoesExtrato,
  formatarMesAnoCurtoPt,
  type HistoricoImportacaoExtrato,
} from "@/lib/extratos/historico-importacoes-service";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import { Badge } from "@/components/ui/badge";

type EstadoCarga = "loading" | "ok" | "rastreio_indisponivel" | "erro" | "vazio";

export function ImportHistory() {
  const [estado, setEstado] = useState<EstadoCarga>("loading");
  const [grupos, setGrupos] = useState<HistoricoImportacaoExtrato[]>([]);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function recarregar() {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        if (!cancelado) {
          setGrupos([]);
          setEstado("vazio");
        }
        return;
      }
      const res = await listarHistoricoImportacoesExtrato(sb, user.id);
      if (cancelado) return;
      if (res.error) {
        setErroMensagem(res.error.message);
        setEstado("erro");
        return;
      }
      if (res.rastreioIndisponivel) {
        setEstado("rastreio_indisponivel");
        return;
      }
      setGrupos(res.grupos);
      setEstado(res.grupos.length === 0 ? "vazio" : "ok");
    }

    void recarregar();

    function onDashboardDataUpdated() {
      void recarregar();
    }
    window.addEventListener(DASHBOARD_DATA_UPDATED, onDashboardDataUpdated);
    return () => {
      cancelado = true;
      window.removeEventListener(DASHBOARD_DATA_UPDATED, onDashboardDataUpdated);
    };
  }, []);

  if (estado === "rastreio_indisponivel") return null;

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-blue-500" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Histórico de importações
        </p>
      </div>

      {estado === "loading" && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando histórico…
        </div>
      )}

      {estado === "erro" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Não foi possível ler o histórico de importações
          {erroMensagem ? `: ${erroMensagem}` : "."}
        </p>
      )}

      {estado === "vazio" && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ainda não há extratos importados. Arraste um arquivo acima para começar.
        </p>
      )}

      {estado === "ok" && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {grupos.map((g) => (
            <li
              key={g.key}
              className="flex flex-col gap-2 rounded-lg bg-white dark:bg-slate-800 px-3 py-2.5 border border-slate-100 dark:border-slate-700"
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 space-y-0.5">
                  <p
                    className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate"
                    title={g.fileName ?? g.bancoLabel}
                  >
                    {g.bancoLabel}
                  </p>
                  {g.fileName && g.fileName !== g.bancoLabel && (
                    <p
                      className="text-[11px] text-slate-400 flex items-center gap-1 truncate"
                      title={g.fileName}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{g.fileName}</span>
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {g.quantidade}
                </Badge>
              </div>

              <div className="flex items-start gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {g.meses.length === 0 ? (
                    <span className="text-[11px] text-slate-400">Sem datas</span>
                  ) : (
                    g.meses.map((m) => (
                      <span
                        key={m}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300"
                      >
                        {formatarMesAnoCurtoPt(m)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
