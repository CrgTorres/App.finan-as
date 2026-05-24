"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import { carregarPerfilTitularParaSessao } from "@/lib/contratos/carregar-perfil-titular";
import { perfilTitularEstaCompleto } from "@/lib/contratos/perfil-titular-app";
import { UserCircle } from "lucide-react";

/** Aviso quando nome/CPF do titular não estão definidos (cadastro, env ou dispositivo). */
export function CompletarPerfilTitularBanner() {
  const pathname = usePathname();
  const [incompleto, setIncompleto] = useState(false);

  const verificar = useCallback(async () => {
    const supabase = createClient();
    const perfil = await carregarPerfilTitularParaSessao(supabase);
    setIncompleto(!perfilTitularEstaCompleto(perfil));
  }, []);

  useEffect(() => {
    void verificar();
    const onAtualizado = () => void verificar();
    window.addEventListener(DASHBOARD_DATA_UPDATED, onAtualizado);
    return () => window.removeEventListener(DASHBOARD_DATA_UPDATED, onAtualizado);
  }, [verificar]);

  if (pathname === "/dashboard/perfil") return null;
  if (!incompleto) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex flex-wrap items-start gap-3">
      <UserCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-amber-950 dark:text-amber-100">
          Complete seu nome e CPF no cadastro
        </p>
        <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
          Isso evita confundir seu nome com atendente/correspondente na leitura de contratos (ex.: Carlos Rodrigo
          Gomes Torres vs. nome do banco).
        </p>
        <Link
          href="/dashboard/perfil"
          className="inline-block text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline mt-1"
        >
          Ir para Meu perfil →
        </Link>
      </div>
    </div>
  );
}
