"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DASHBOARD_DATA_UPDATED } from "@/lib/dashboard-data-events";
import {
  carregarPerfilUsuarioSupabase,
  upsertPerfilUsuarioSupabase,
} from "@/lib/contratos/perfil-usuario-supabase";
import {
  formatarCpf11,
  formatarCpfEntrada,
  normalizarNomeTitular,
  perfilTitularEstaCompleto,
} from "@/lib/contratos/perfil-titular-app";
import { carregarPerfilTitularParaSessao } from "@/lib/contratos/carregar-perfil-titular";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ContaHubCards } from "@/components/layout/conta-hub-cards";

export default function PerfilTitularPage() {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistidoNaConta, setPersistidoNaConta] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const row = await carregarPerfilUsuarioSupabase(supabase);
    if (row) {
      setNome(row.nome_completo);
      setCpf(formatarCpf11(row.cpf_digits));
      setPersistidoNaConta(true);
    } else {
      setPersistidoNaConta(false);
      const perfil = await carregarPerfilTitularParaSessao(supabase);
      if (perfil.nome) setNome(normalizarNomeTitular(perfil.nome));
      if (perfil.cpfDigitos) setCpf(formatarCpf11(perfil.cpfDigitos));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const r = await upsertPerfilUsuarioSupabase(supabase, {
      nomeCompleto: nome,
      cpf,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    if (r.persistencia === "local_e_metadata") {
      toast.warning(r.aviso, { duration: 12_000 });
      setPersistidoNaConta(false);
    } else {
      toast.success("Perfil guardado na conta. A leitura de contratos usará este nome e CPF.");
      setPersistidoNaConta(true);
    }
    void carregar();
  }

  const formularioCompleto = perfilTitularEstaCompleto({
    nome,
    cpfDigitos: cpf.replace(/\D/g, ""),
  });

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu perfil</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Configurações, saúde dos dados e exportação. Abaixo, nome e CPF do titular para conferir
          contratos e OCR.
        </p>
      </div>

      <ContaHubCards />

      <div className="max-w-lg space-y-4">
        <h2 className="text-sm font-semibold">Identificação do titular</h2>

      {persistidoNaConta && formularioCompleto ? (
        <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Perfil guardado na sua conta. O aviso amarelo no topo das páginas deixa de aparecer.
        </div>
      ) : formularioCompleto ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100 space-y-1">
          <p>
            Clique em <strong>Guardar perfil</strong>. Sem a tabela no Supabase, guardamos neste navegador e na sessão
            (a leitura de contratos já usa essa referência).
          </p>
          <p className="text-muted-foreground">
            Para gravar na base: Supabase → SQL Editor → execute{" "}
            <code className="bg-muted px-1 rounded text-[10px]">supabase/patch_user_profiles.sql</code> → Guardar de
            novo.
          </p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
          <CardDescription className="text-xs">
            Ex.: Carlos Rodrigo Gomes Torres e o CPF que consta nos seus contracheques e contratos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A carregar…
            </div>
          ) : (
            <form onSubmit={(e) => void salvar(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome-completo">Nome completo</Label>
                <Input
                  id="nome-completo"
                  value={nome}
                  onChange={(e) => setNome(normalizarNomeTitular(e.target.value))}
                  className="uppercase"
                  placeholder="Carlos Rodrigo Gomes Torres"
                  autoComplete="name"
                  required
                  minLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpfEntrada(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> A guardar…
                  </>
                ) : (
                  "Guardar perfil"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
