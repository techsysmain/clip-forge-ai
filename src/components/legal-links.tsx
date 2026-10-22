import Link from "next/link";
import { cn } from "@/lib/utils";

export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookies & Cache" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/copyright", label: "Copyright / DMCA" },
  { href: "/subprocessors", label: "Subprocessors" },
] as const;

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {LEGAL_PAGES.map((p) => (
        <Link key={p.href} href={p.href} className="hover:text-foreground hover:underline">
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
