import Link from "next/link";
import {
  SlidersHorizontal,
  HeartPulse,
  Download,
  ArrowRight,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ATALHOS = [
  {
    title: "Perfil de leitura",
    description: "Nível de análise, tolerâncias e parâmetros de conciliação automática.",
    href: "/dashboard/configuracao-leitura",
    icon: SlidersHorizontal,
  },
  {
    title: "Saúde dos dados",
    description: "Integração entre folha, banco, portal e prontidão para análise.",
    href: "/dashboard/saude-dados",
    icon: HeartPulse,
  },
  {
    title: "Exportação / Power BI",
    description: "Planilhas e JSON da base normalizada para BI e arquivo.",
    href: "/dashboard/exportacao",
    icon: Download,
  },
] as const;

export function ContaHubCards() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Conta e ferramentas</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configurações, diagnóstico de dados e exportação.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ATALHOS.map((atalho) => {
          const Icon = atalho.icon;
          return (
            <Link key={atalho.href} href={atalho.href} className="group block">
              <Card className="h-full transition-colors hover:border-blue-400/50 hover:bg-muted/40">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {atalho.title}
                    <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-60" />
                  </CardTitle>
                  <CardDescription className="text-[10px] leading-snug line-clamp-3">
                    {atalho.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
