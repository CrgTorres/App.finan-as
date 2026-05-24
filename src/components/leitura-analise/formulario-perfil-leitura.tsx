"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CATALOGO_PERGUNTAS_LEITURA,
  CATALOGO_PERGUNTAS_LEITURA_VERSION,
} from "@/lib/leitura-analise/catalogo-perguntas-leitura";
import { resolverPerfilLeitura } from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  carregarRespostasFormulario,
  catalogoDesatualizado,
  limparPerfilLeitura,
  salvarPerfilLeitura,
} from "@/lib/leitura-analise/perfil-leitura-storage";
import {
  ROTULOS_NIVEL_LEITURA,
  type RespostasFormularioLeitura,
} from "@/lib/leitura-analise/types-perfil-leitura";
import { emitDashboardDataUpdated } from "@/lib/dashboard-data-events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GRUPO_ROTULO: Record<string, string> = {
  fontes: "Fontes de dados",
  folha: "Contracheque / folha",
  consigfacil: "ConsigFácil",
  refin: "Refinanciamento",
  margem: "Margem consignável",
  conferencia: "Conferência final",
};

type Props = {
  compacto?: boolean;
  onSalvo?: () => void;
};

export function FormularioPerfilLeitura({ compacto = false, onSalvo }: Props) {
  const [respostas, setRespostas] = useState<RespostasFormularioLeitura>(() =>
    carregarRespostasFormulario(),
  );
  const [salvando, setSalvando] = useState(false);

  const resolvido = useMemo(() => resolverPerfilLeitura(respostas), [respostas]);
  const desatualizado = catalogoDesatualizado();

  const perguntasPorGrupo = useMemo(() => {
    const map = new Map<string, typeof CATALOGO_PERGUNTAS_LEITURA>();
    for (const p of CATALOGO_PERGUNTAS_LEITURA) {
      const arr = map.get(p.grupo) ?? [];
      arr.push(p);
      map.set(p.grupo, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const oa = CATALOGO_PERGUNTAS_LEITURA.find((x) => x.grupo === a[0])?.ordem ?? 0;
      const ob = CATALOGO_PERGUNTAS_LEITURA.find((x) => x.grupo === b[0])?.ordem ?? 0;
      return oa - ob;
    });
  }, []);

  const setResposta = useCallback((id: string, valor: string) => {
    setRespostas((prev) => ({ ...prev, [id]: valor }));
  }, []);

  function handleSalvar() {
    if (resolvido.perguntasPendentes.length > 0) {
      toast.error("Responda todas as perguntas obrigatórias antes de salvar.");
      return;
    }
    setSalvando(true);
    try {
      salvarPerfilLeitura(respostas);
      emitDashboardDataUpdated({ origin: "perfil_leitura" });
      toast.success("Perfil de leitura salvo. Conciliação e Consignações usarão os novos parâmetros.");
      onSalvo?.();
    } finally {
      setSalvando(false);
    }
  }

  function handleReset() {
    limparPerfilLeitura();
    setRespostas(carregarRespostasFormulario());
    toast.message("Perfil restaurado para o padrão do sistema.");
  }

  const nivelInfo = ROTULOS_NIVEL_LEITURA[resolvido.nivel];

  return (
    <div className={cn("space-y-4", compacto && "space-y-3")}>
      {desatualizado && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            O catálogo de perguntas foi atualizado (v{CATALOGO_PERGUNTAS_LEITURA_VERSION}). Revise as
            novas questões e salve novamente para aplicar parâmetros compatíveis.
          </p>
        </div>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className={cn("pb-2", compacto && "py-3")}>
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Perfil resolvido: {nivelInfo.titulo}
          </CardTitle>
          <CardDescription>{nivelInfo.descricao}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          {resolvido.resumo.map((linha) => (
            <p key={linha} className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
              {linha}
            </p>
          ))}
        </CardContent>
      </Card>

      {perguntasPorGrupo.map(([grupo, perguntas]) => (
        <Card key={grupo}>
          <CardHeader className={cn("pb-2", compacto && "py-3")}>
            <CardTitle className="text-sm">{GRUPO_ROTULO[grupo] ?? grupo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {perguntas
              .slice()
              .sort((a, b) => a.ordem - b.ordem)
              .map((p) => (
                <fieldset key={p.id} className="space-y-2 border-b border-border/60 pb-4 last:border-0 last:pb-0">
                  <legend className="text-sm font-medium leading-snug pr-6">{p.pergunta}</legend>
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                    <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-normal text-foreground/80">Por que perguntamos: </strong>
                      {p.origemSistema}
                    </span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-1">
                    {p.opcoes.map((op) => {
                      const sel = respostas[p.id] === op.valor;
                      return (
                        <label
                          key={op.valor}
                          className={cn(
                            "flex cursor-pointer flex-col gap-0.5 rounded-md border p-2.5 text-xs transition-colors",
                            sel
                              ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <span className="flex items-center gap-2 font-medium">
                            <input
                              type="radio"
                              name={p.id}
                              value={op.valor}
                              checked={sel}
                              onChange={() => setResposta(p.id, op.valor)}
                              className="h-3.5 w-3.5"
                            />
                            {op.rotulo}
                          </span>
                          <span className="text-muted-foreground pl-5">{op.efeito}</span>
                        </label>
                      );
                    })}
                  </div>
                  {!respostas[p.id] && p.obrigatoria && (
                    <Badge variant="outline" className="text-[10px] text-amber-700">
                      Obrigatória
                    </Badge>
                  )}
                </fieldset>
              ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2 sticky bottom-2 z-10 bg-background/95 backdrop-blur py-2 border-t">
        <Button type="button" onClick={handleSalvar} disabled={salvando}>
          <Save className="h-4 w-4 mr-1.5" />
          Salvar perfil e recalcular
        </Button>
        <Button type="button" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Restaurar padrão
        </Button>
      </div>
    </div>
  );
}
