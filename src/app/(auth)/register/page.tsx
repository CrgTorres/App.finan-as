"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, MailCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  formatarCpfEntrada,
  normalizarNomeTitular,
  salvarPerfilTitularLocal,
} from "@/lib/contratos/perfil-titular-app";
import { cpfDigitosValido } from "@/lib/contratos/validar-cpf";

export default function RegisterPage() {
  const router = useRouter();
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const nome = normalizarNomeTitular(nomeCompleto);
    if (nome.length < 4) {
      toast.error("Informe seu nome completo (como no contracheque e no contrato).");
      return;
    }

    const cpf_digits = cpfDigitosValido(cpf);
    if (!cpf_digits) {
      toast.error("Informe um CPF válido (11 dígitos).");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: nome,
          cpf_digits,
        },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    salvarPerfilTitularLocal({ nome, cpfDigitos: cpf_digits });
    setRegistered(true);
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center gap-1.5 mb-6">
            <div className="p-2 bg-blue-600 rounded-xl mb-1">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Rotina Financeira</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Carlos Torres</p>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-4 bg-green-100 dark:bg-green-900/40 rounded-full">
                  <MailCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">
                Verifique seu e-mail!
              </CardTitle>
              <CardDescription>Sua conta foi criada com sucesso</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                Enviamos um link de confirmação para:
              </p>
              <p className="text-sm font-semibold text-center bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-3 rounded-lg break-all">
                {email}
              </p>

              <div className="flex gap-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Não recebeu? Verifique também sua{" "}
                  <strong>caixa de spam</strong> ou lixo eletrônico.
                </p>
              </div>

              <p className="text-xs text-center text-slate-500 dark:text-slate-400">
                Após clicar no link de confirmação, você já poderá fazer login.
              </p>
            </CardContent>

            <CardFooter>
              <Button className="w-full" onClick={() => router.push("/login")}>
                Ir para o login
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-1.5 mb-6">
          <div className="p-2 bg-blue-600 rounded-xl mb-1">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Rotina Financeira</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Carlos Torres</p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-bold text-center tracking-tight">
              Criar conta
            </CardTitle>
            <CardDescription className="text-center">
              Nome e CPF alinham contratos e contracheques ao titular correto
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome-completo">Nome completo</Label>
                <Input
                  id="nome-completo"
                  type="text"
                  placeholder="Carlos Rodrigo Gomes Torres"
                  value={nomeCompleto}
                  onChange={(e) => setNomeCompleto(normalizarNomeTitular(e.target.value))}
                  className="uppercase"
                  autoComplete="name"
                  required
                  minLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpfEntrada(e.target.value))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Criando conta..." : "Criar conta"}
              </Button>
              <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                Já tem uma conta?{" "}
                <Link
                  href="/login"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Entrar
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
