"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, usePolled } from "@/lib/client";

export default function SettingsPage() {
  const { data, error, loading, reload } = usePolled<{ account: { email: string; notifyEmail: boolean } }>("/api/account", () => false);
  const [deleting, setDeleting] = useState(false);

  async function toggle(v: boolean) {
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ notifyEmail: v }) });
      await reload();
      toast.success(v ? "Email notifications on" : "Email notifications off");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update settings");
    }
  }

  async function deleteAccount() {
    if (!confirm("Permanently delete your account, all projects, clips and files? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api("/api/account", { method: "DELETE" });
      window.location.href = "/";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the account");
      setDeleting(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="text-sm text-muted-foreground">{data.account.email}</p>
      </div>

      <section className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <Label className="text-base">Email notifications</Label>
          <p className="text-sm text-muted-foreground">Get an email when analysis finishes, clips are rendered, or processing fails.</p>
        </div>
        <Switch checked={data.account.notifyEmail} onCheckedChange={toggle} />
      </section>

      <section className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="font-medium text-red-300">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Removes your account, every project, clip, transcript and stored video file immediately. This cannot be undone.
        </p>
        <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
          {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Delete my account
        </Button>
      </section>
    </div>
  );
}
