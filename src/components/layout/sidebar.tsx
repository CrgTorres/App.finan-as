"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TrendingUp, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DASHBOARD_NAV_GROUPS,
  isDashboardNavItemActive,
} from "@/lib/navigation/dashboard-navigation";
import { DashboardNavLink } from "@/components/layout/dashboard-nav-link";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    router.push("/login");
    router.refresh();
  }

  const initials = userEmail ? userEmail[0].toUpperCase() : "?";

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Rotina Financeira
          </p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
            Carlos Torres
          </p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {DASHBOARD_NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {group.label}
            </p>
            {group.items.map((item) => {
              const parentActive = isDashboardNavItemActive(pathname, item);
              const visibleChildren = item.children?.filter(
                (child) =>
                  child.hiddenFromMain &&
                  child.href !== item.href,
              );

              return (
                <div key={item.href} className="space-y-0.5">
                  <DashboardNavLink
                    item={item}
                    pathname={pathname}
                    showDescription
                  />
                  {parentActive && visibleChildren && visibleChildren.length > 0 && (
                    <div className="space-y-0.5 pb-1">
                      {visibleChildren.map((child) => (
                        <DashboardNavLink
                          key={`${child.href}-${child.label}`}
                          item={child}
                          pathname={pathname}
                          variant="child"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
              {userEmail ?? "Carregando..."}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Conta ativa</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Aparência</span>
          <ThemeToggle className="text-slate-600 dark:text-slate-400" />
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
