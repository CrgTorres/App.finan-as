"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResultadoResolucaoPerfil } from "@/lib/leitura-analise/resolver-perfil-leitura";
import {
  obterParametrosLeituraAtivos,
  PERFIL_LEITURA_ATUALIZADO,
} from "@/lib/leitura-analise/perfil-leitura-storage";
import { ROTULOS_NIVEL_LEITURA } from "@/lib/leitura-analise/types-perfil-leitura";

export function usePerfilLeituraAnalise(): ResultadoResolucaoPerfil & {
  rotuloNivel: string;
  recarregar: () => void;
} {
  const [perfil, setPerfil] = useState<ResultadoResolucaoPerfil>(() =>
    typeof window !== "undefined" ? obterParametrosLeituraAtivos() : obterParametrosLeituraAtivos(),
  );

  const recarregar = useCallback(() => {
    setPerfil(obterParametrosLeituraAtivos());
  }, []);

  useEffect(() => {
    recarregar();
    const onUpdate = () => recarregar();
    window.addEventListener(PERFIL_LEITURA_ATUALIZADO, onUpdate);
    return () => window.removeEventListener(PERFIL_LEITURA_ATUALIZADO, onUpdate);
  }, [recarregar]);

  return useMemo(
    () => ({
      ...perfil,
      rotuloNivel: ROTULOS_NIVEL_LEITURA[perfil.nivel].titulo,
      recarregar,
    }),
    [perfil, recarregar],
  );
}
