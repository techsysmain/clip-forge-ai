import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <AppShell email={user.email}>{children}</AppShell>;
}
