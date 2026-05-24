"use client";

import { AlertTriangle, Sparkles, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ehDivergenciaClassificacaoReal } from "@/lib/conciliacao/classificacao-canonica";
import type {
  FonteClassificacao,
  GrupoFinanceiroCanonico,
  ResultadoClassificacaoFinanceira,
} from "@/types/consigfacil";

const ROTULO_FONTE: Record<FonteClassificacao, string> = {
  consigfacil_oficial: "ConsigFácil oficial",
  alias_oficial: "Alias oficial",
  match_exato_catalogo: "Match exato (catálogo)",
  match_alias_catalogo: "Match alias (catálogo)",
  match_fuzzy_catalogo: "Match fuzzy (catálogo)",
  ocr_contracheque: "OCR contracheque",
  heuristica_descricao: "Heurística descrição",
  inferencia: "Inferência",
  sem_correspondencia: "Sem correspondência",
};

const COR_FONTE: Record<FonteClassificacao, string> = {
  consigfacil_oficial: "bg-emerald-600",
  alias_oficial: "bg-emerald-500",
  match_exato_catalogo: "bg-emerald-400",
  match_alias_catalogo: "bg-sky-500",
  match_fuzzy_catalogo: "bg-sky-400",
  ocr_contracheque: "bg-amber-400",
  heuristica_descricao: "bg-amber-500",
  inferencia: "bg-orange-500",
  sem_correspondencia: "bg-red-500",
};

const ROTULO_GRUPO: Record<GrupoFinanceiroCanonico, string> = {
  emprestimo_consignado: "Empréstimo consignado",
  cartao_beneficio: "Cartão benefício",
  cartao_credito: "Cartão de crédito",
  contribuicao: "Contribuição",
  seguros: "Seguros",
  refinanciamentos: "Refinanciamentos",
  saque_complementar: "Saque complementar",
  rmc: "RMC",
  rcc: "RCC",
  outros: "Outros",
  rubrica_folha_nao_consignavel: "Fora da conciliação consignável",
  conta_consumo: "Conta de consumo",
};

function corPorConfianca(conf: number): string {
  if (conf >= 80) return "text-emerald-700 dark:text-emerald-300";
  if (conf >= 60) return "text-sky-700 dark:text-sky-300";
  if (conf >= 40) return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

export type ConciliacaoInspecaoLinhaProps = {
  alvoTipo: "loan" | "base_conciliada";
  classificacao: ResultadoClassificacaoFinanceira & {
    resolvido_por_catalogo_rubrica?: boolean;
    catalogo_rubrica_local?: boolean;
  };
};

export function ConciliacaoInspecaoLinha({
  alvoTipo,
  classificacao: c,
}: ConciliacaoInspecaoLinhaProps) {
  const divergenciaReal = ehDivergenciaClassificacaoReal(c);
  const resolvidoCatalogo = Boolean(c.resolvido_por_catalogo_rubrica);

  const motivoExibicao =
    c.catalogo_rubrica_local &&
    /não encontrada no catálogo|nao encontrada no catalogo|modalidade não reconhecida|modalidade nao reconhecida/i.test(
      c.motivo_classificacao,
    )
      ? c.motivo_classificacao
          .replace(
            /Instituição "[^"]+" não encontrada no catálogo\.?/gi,
            "Instituição reconhecida por catálogo local.",
          )
          .replace(
            /Modalidade não reconhecida[^.]*\.?/gi,
            "Modalidade reconhecida por catálogo local (empréstimo consignado).",
          )
      : c.motivo_classificacao;

  return (
    <div className="p-2.5 space-y-1 text-[12px]">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">
          {alvoTipo === "loan" ? "Loan" : "Base conciliada"}
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1">
          <span
            className={cn("inline-block h-2 w-2 rounded-sm", COR_FONTE[c.fonte_classificacao])}
          />
          {ROTULO_FONTE[c.fonte_classificacao]}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {ROTULO_GRUPO[c.grupo_canonico]}
        </Badge>
        {resolvidoCatalogo && (
          <Badge className="text-[10px] gap-1 bg-emerald-600 hover:bg-emerald-600">
            <Sparkles className="h-3 w-3" /> Resolvido por catálogo
          </Badge>
        )}
        {c.catalogo_rubrica_local && !resolvidoCatalogo && (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Tag className="h-3 w-3" /> Catálogo local
          </Badge>
        )}
        {c.grupo_canonico === "rubrica_folha_nao_consignavel" ||
        c.grupo_canonico === "conta_consumo" ? (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {c.grupo_canonico === "conta_consumo"
              ? "Conta de consumo — fora da conciliação consignável"
              : "Rubrica de folha — fora da conciliação consignável"}
          </Badge>
        ) : (
          divergenciaReal && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" /> Divergência
            </Badge>
          )
        )}
        <Badge
          variant="outline"
          className={cn("text-[10px]", corPorConfianca(c.indice_confianca_classificacao))}
        >
          {c.indice_confianca_classificacao}/100
        </Badge>
      </div>
      <div className="grid sm:grid-cols-2 gap-1">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Original</p>
          <p className="font-medium truncate" title={c.instituicao_original ?? ""}>
            {c.instituicao_original ?? "—"}
          </p>
          {c.modalidade_original && (
            <p className="text-[10px] opacity-80">modalidade: {c.modalidade_original}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Oficial</p>
          <p className="font-medium truncate" title={c.instituicao_oficial ?? ""}>
            {c.instituicao_oficial ?? "—"}
          </p>
          {c.modalidade_oficial && (
            <p className="text-[10px] opacity-80">modalidade: {c.modalidade_oficial}</p>
          )}
        </div>
      </div>
      {c.aliases_utilizados.length > 0 && (
        <p className="text-[10px] opacity-80">aliases: {c.aliases_utilizados.join(", ")}</p>
      )}
      <p className="text-[10px] italic opacity-80">{motivoExibicao}</p>
    </div>
  );
}
