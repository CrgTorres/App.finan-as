import Link from "next/link";
import { ArrowRight } from "lucide-react";

type CrossLink = {
  label: string;
  href: string;
  description?: string;
};

type Props = {
  links: CrossLink[];
};

/** Atalhos leves entre hubs relacionados (Fase 1.5). */
export function DashboardCrossLinks({ links }: Props) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs hover:bg-muted/60 transition-colors"
        >
          <span className="font-medium">{link.label}</span>
          {link.description && (
            <span className="text-muted-foreground hidden sm:inline">— {link.description}</span>
          )}
          <ArrowRight className="h-3 w-3 opacity-60" />
        </Link>
      ))}
    </div>
  );
}
