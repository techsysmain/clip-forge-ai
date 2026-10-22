"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FolderKanban, LogOut, Plus, Scissors, Settings, User } from "lucide-react";
import { LegalLinks } from "@/components/legal-links";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Projects", icon: FolderKanban },
  { href: "/projects/new", label: "New Project", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <Image src="/assets/logo.png" alt="" width={32} height={32} className="rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">ClipForge AI</span>
        </Link>
        <Button asChild className="glow mb-4">
          <Link href="/projects/new">
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Link>
        </Button>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground",
                pathname === n.href && "bg-sidebar-accent text-foreground",
              )}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <LegalLinks className="px-2" />
          <AccountMenu email={email} onLogout={logout} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-primary" />
            <span className="font-semibold">ClipForge AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/projects/new">
                <Plus className="mr-1 h-4 w-4" /> New
              </Link>
            </Button>
            <AccountMenu email={email} onLogout={logout} compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
        <div className="border-t border-border px-4 py-3 md:hidden">
          <LegalLinks />
        </div>
      </div>
    </div>
  );
}

function AccountMenu({ email, onLogout, compact }: { email: string; onLogout: () => void; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={compact ? "h-9 w-9 p-0" : "w-full justify-start gap-2 px-2"}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
            <User className="h-4 w-4" />
          </span>
          {!compact && <span className="truncate text-sm">{email}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
