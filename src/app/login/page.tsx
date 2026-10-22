"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "That sign-in link is invalid or has expired. Request a new one." : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ devLink?: string }>("/api/auth/request", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
      setDevLink(r.devLink ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card/80 p-6 shadow-xl backdrop-blur">
      <Image src="/assets/logo.png" alt="ClipForge AI" width={48} height={48} className="mb-4 rounded-xl" />
      <h1 className="text-xl font-semibold">Sign in to ClipForge AI</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a magic link. No password needed.</p>
      {sent ? (
        <div className="mt-6 space-y-3 text-sm">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
            Check <strong>{email}</strong> for your sign-in link. It expires in 15 minutes.
          </div>
          {devLink && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
              Email isn&apos;t configured (development mode).{" "}
              <a className="underline" href={devLink}>
                Open your sign-in link
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Send magic link
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline">Terms of Service</Link>, <Link href="/privacy" className="underline">Privacy Policy</Link> and{" "}
            <Link href="/acceptable-use" className="underline">Acceptable Use Policy</Link>.
          </p>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <Image src="/assets/hero-bg.png" alt="" fill className="object-cover opacity-40" />
      <div className="absolute inset-0 bg-background/60" />
      <div className="relative">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
