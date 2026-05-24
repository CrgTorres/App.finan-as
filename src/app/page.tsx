import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  PieChart,
  Download,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: TrendingUp,
    title: "Dashboard inteligente",
    description:
      "Visualize receitas, despesas e saldo em tempo real com cards e gráficos claros.",
  },
  {
    icon: PieChart,
    title: "Gráficos por categoria",
    description:
      "Entenda onde seu dinheiro está indo com gráficos de pizza por categoria.",
  },
  {
    icon: Download,
    title: "Exportar CSV",
    description:
      "Exporte suas transações filtradas em .csv para analisar no Excel ou Google Sheets.",
  },
  {
    icon: Shield,
    title: "Dados seguros",
    description:
      "Autenticação e Row Level Security do Supabase garantem que só você veja seus dados.",
  },
];

const benefits = [
  "Registro de receitas e despesas",
  "Categorização automática",
  "Filtros por mês, ano e categoria",
  "Busca por descrição",
  "Interface responsiva mobile",
  "Gráficos visuais interativos",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <TrendingUp className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none">Rotina Financeira</p>
              <p className="text-sm font-bold text-slate-800 leading-tight">Carlos Torres</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-24 pb-14 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-5">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
            Controle financeiro simples e visual
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 leading-tight tracking-tight">
            Suas finanças em{" "}
            <span className="text-blue-600">ordem e no controle</span>
          </h1>

          <p className="text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Registre receitas e despesas, acompanhe seu saldo mensal com
            gráficos intuitivos e tome decisões financeiras mais inteligentes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-7">
                Começar gratuitamente
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="px-7">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Tudo que você precisa para controlar suas finanças
            </h2>
            <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
              Interface minimalista inspirada nos melhores apps de finanças
              pessoais do Brasil.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-5 rounded-xl border border-slate-100 bg-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="p-2 bg-blue-100 rounded-lg w-fit mb-3">
                    <Icon className="h-4 w-4 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1.5 text-sm">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3 tracking-tight">
                Tudo incluído, sem complicação
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Uma ferramenta completa para pessoas físicas que querem
                organizar as finanças sem complexidade.
              </p>
              <ul className="space-y-2.5">
                {benefits.map((benefit) => (
                  <li
                    key={benefit}
                    className="flex items-center gap-2.5 text-sm text-slate-700"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-md p-5 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700 tracking-tight">
                  Resumo — Maio 2026
                </span>
              </div>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Receitas</span>
                  <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                    R$ 8.500,00
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Despesas</span>
                  <span className="text-sm font-semibold text-red-600 tabular-nums">
                    R$ 4.320,00
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
                  <span className="text-xs font-medium text-slate-700">Saldo</span>
                  <span className="font-bold text-blue-600 tabular-nums">
                    R$ 4.180,00
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["Moradia", "Alimentação", "Transporte", "Lazer"].map(
                  (cat) => (
                    <span
                      key={cat}
                      className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                    >
                      {cat}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 px-4 bg-blue-600">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Pronto para organizar suas finanças?
          </h2>
          <p className="text-sm text-blue-100">
            Crie sua conta gratuitamente e comece a registrar suas transações
            hoje mesmo.
          </p>
          <Link href="/register">
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 px-7 bg-white text-blue-700 hover:bg-blue-50"
            >
              Criar conta grátis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="py-6 px-4 border-t border-slate-200 text-center">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <div className="p-1 bg-blue-600 rounded-md">
            <TrendingUp className="h-3 w-3 text-white" />
          </div>
          <div className="leading-tight text-left">
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none">Rotina Financeira</p>
            <p className="text-xs font-semibold text-slate-700 leading-tight">Carlos Torres</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Controle financeiro pessoal · Desenvolvido com Next.js + Supabase
        </p>
      </footer>
    </div>
  );
}
