import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { AccessSnapshot } from "@/lib/access-control";
import { buildAccessStatusUrl } from "@/lib/access-control";
import { createSupabaseServerComponentClient } from "@/lib/supabase-server";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerComponentClient();

  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: accessRows } = await supabase.rpc("current_user_access_snapshot");
  const access = ((accessRows as AccessSnapshot[] | null)?.[0] ?? null) as AccessSnapshot | null;

  if (!access) {
    redirect(buildAccessStatusUrl("profile_missing") as never);
  }

  if (access.access_state !== "active") {
    redirect(buildAccessStatusUrl(access.access_state) as never);
  }

  return <AppShell>{children}</AppShell>;
}
