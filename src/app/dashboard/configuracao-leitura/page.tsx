"use client";

import Link from "next/link";
import { SlidersHorizontal, ArrowLeft } from "lucide-react";
import { FormularioPerfilLeitura } from "@/components/leitura-analise/formulario-perfil-leitura";
import { usePerfilLeituraAnalise } from "@/components/leitura-analise/use-perfil-leitura-analise";
import { Badge } from "@/components/ui/badge";

export default function ConfiguracaoLeituraPage() {
  const perfil = usePerfilLeituraAnalise();

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/conciliacao"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar à conciliação
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="h-6 w-6" />
            Perfil de leitura e análise
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Perguntas práticas geradas a partir das dificuldades reais do sistema (descontos
            fracionados, falsos refinanciamentos, OCR, ConsigFácil, margem). As respostas definem o
            nível de leitura — do básico ao avançado — e os parâmetros de conciliação automática.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>Ativo: {perfil.rotuloNivel}</Badge>
            <Badge variant="outline">Catálogo v{perfil.catalogoVersion}</Badge>
          </div>
        </div>
      </div>

      <FormularioPerfilLeitura onSalvo={perfil.recarregar} />

      <p className="text-[11px] text-muted-foreground border-t pt-4">
        Para incluir novas perguntas quando surgir um padrão recorrente no projeto, edite{" "}
        <code className="text-[10px]">src/lib/leitura-analise/catalogo-perguntas-leitura.ts</code> e
        incremente <code className="text-[10px]">CATALOGO_PERGUNTAS_LEITURA_VERSION</code>.
      </p>
    </div>
  );
}
