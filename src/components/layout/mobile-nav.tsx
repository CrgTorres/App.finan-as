"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  getMobileDashboardNavItems,
  isDashboardNavItemActive,
} from "@/lib/navigation/dashboard-navigation";

const MOBILE_LABELS: Record<string, string> = {
  "/dashboard": "Início",
  "/dashboard/importar": "Importar",
  "/dashboard/consignacoes": "Consig.",
  "/dashboard/analise": "Análise",
  "/dashboard/perfil": "Perfil",
};

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const items = getMobileDashboardNavItems();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isDashboardNavItemActive(pathname, item);
        const label = MOBILE_LABELS[item.href] ?? item.label;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2.5 px-0.5 text-[10px] font-medium transition-colors min-w-0",
              active
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
            )}
          >
            {Icon ? <Icon className="h-5 w-5 shrink-0" /> : null}
            <span className="truncate max-w-full">{label}</span>
          </Link>
        );
      })}
      <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 min-w-[3rem]">
        <ThemeToggle className="h-7 w-7 text-slate-500 dark:text-slate-400" />
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Tema</span>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="flex flex-col items-center gap-0.5 py-2.5 px-1 min-w-[3rem] text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
      >
        <LogOut className="h-5 w-5" />
        <span>Sair</span>
      </button>
    </nav>
  );
}
