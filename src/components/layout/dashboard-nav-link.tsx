"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  isDashboardNavItemActive,
  type DashboardNavItem,
} from "@/lib/navigation/dashboard-navigation";

type Props = {
  item: DashboardNavItem;
  pathname: string;
  variant?: "main" | "child";
  showDescription?: boolean;
};

export function DashboardNavLink({
  item,
  pathname,
  variant = "main",
  showDescription = false,
}: Props) {
  const Icon = item.icon;
  const active = isDashboardNavItemActive(pathname, item);
  const isChild = variant === "child";

  return (
    <Link
      href={item.href}
      title={item.description}
      className={cn(
        "flex items-start gap-3 rounded-lg text-sm font-medium transition-colors",
        isChild ? "px-3 py-1.5 ml-6 text-xs" : "px-3 py-2.5",
        active
          ? isChild
            ? "bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400"
            : "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100",
      )}
    >
      {Icon ? (
        <Icon className={cn("shrink-0", isChild ? "h-3.5 w-3.5 mt-0.5" : "h-4 w-4")} />
      ) : (
        <span className={cn("shrink-0 rounded-full bg-slate-300 dark:bg-slate-600", isChild ? "h-1.5 w-1.5 mt-1.5" : "h-1.5 w-1.5 mt-2")} />
      )}
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {showDescription && item.description && !isChild && (
          <span className="block text-[10px] font-normal text-muted-foreground leading-snug mt-0.5 line-clamp-2">
            {item.description}
          </span>
        )}
      </span>
    </Link>
  );
}
