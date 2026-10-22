import Image from "next/image";
import Link from "next/link";
import { LegalLinks } from "@/components/legal-links";

// Operator details come from runtime environment variables
export const dynamic = "force-dynamic";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/assets/logo.png" alt="" width={28} height={28} className="rounded-md" />
            <span className="font-semibold">ClipForge AI</span>
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}
