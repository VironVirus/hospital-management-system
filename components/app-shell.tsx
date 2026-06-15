"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Boxes,
  Building2,
  CircleUserRound,
  ClipboardPlus,
  FileText,
  FlaskConical,
  LogOut,
  Menu,
  MoonStar,
  ScanLine,
  ShieldCheck,
  SunMedium,
  Stethoscope,
  TestTube2,
  X,
  Wallet
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useOffline } from "@/components/offline-provider";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { appRoles, type AppRole } from "@/lib/auth-types";

type NavigationItem = {
  href: Route;
  label: string;
  icon: typeof Activity;
  roles: AppRole[];
};

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Activity, roles: appRoles },
  {
    href: "/patients",
    label: "Patients",
    icon: Building2,
    roles: ["Admin", "Receptionist", "LabScientist"] as AppRole[]
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Boxes,
    roles: ["Admin", "LabScientist", "Accountant"] as AppRole[]
  },
  {
    href: "/orders",
    label: "Tests",
    icon: ClipboardPlus,
    roles: ["Admin", "Receptionist", "LabScientist"] as AppRole[]
  },
  {
    href: "/orders/reception",
    label: "Sample Reception",
    icon: ScanLine,
    roles: ["Admin", "Receptionist", "LabScientist", "Verifier"] as AppRole[]
  },
  {
    href: "/results",
    label: "Results",
    icon: Stethoscope,
    roles: ["Admin", "LabScientist", "Verifier"] as AppRole[]
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    roles: ["Admin", "Receptionist", "Verifier"] as AppRole[]
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Wallet,
    roles: ["Admin", "Accountant"] as AppRole[]
  },
  {
    href: "/billing",
    label: "Billing",
    icon: Wallet,
    roles: ["Admin", "Accountant"] as AppRole[]
  },
  {
    href: "/admin",
    label: "Administration",
    icon: ShieldCheck,
    roles: ["Admin"] as AppRole[]
  },
  {
    href: "/admin/tests",
    label: "Test Catalogue",
    icon: TestTube2,
    roles: ["Admin"] as AppRole[]
  },
  {
    href: "/admin/audit",
    label: "Audit Logs",
    icon: Activity,
    roles: ["Admin"] as AppRole[]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { conflicts, failed, isOnline, pending, processing, syncNow } = useOffline();
  const { profile, role, user, loading } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavigation =
    role ? navigation.filter((item) => item.roles.includes(role)) : navigation;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-soft">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">LIMS Nigeria</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Offline-first laboratory suite
          </p>
        </div>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        {visibleNavigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-slate-200">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-900 dark:text-slate-50">Network status</p>
            <Badge variant={isOnline ? "default" : "secondary"}>
              {isOnline ? "Online" : "Offline"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {pending > 0 || failed > 0
              ? `${pending + failed} queued change(s) waiting to sync.`
              : "Local changes are cached in Dexie and replayed when connectivity returns."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pending > 0 ? <Badge variant="outline">{pending} pending</Badge> : null}
            {failed > 0 ? <Badge variant="secondary">{failed} retrying</Badge> : null}
            {conflicts > 0 ? (
              <Badge className="border-transparent bg-amber-100 text-amber-700">
                {conflicts} manual review
              </Badge>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-9 w-full justify-start"
            disabled={!isOnline || processing}
            onClick={() => void syncNow()}
          >
            {processing ? "Syncing queued changes..." : "Sync queued changes now"}
          </Button>
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
              <CircleUserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                {profile?.display_name || user?.email || "Signed in user"}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user?.email || "No email available"}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Role
            </p>
            <Badge variant="outline">{loading ? "Loading..." : role || "Unknown"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Facility
            </p>
            <Badge variant="secondary">
              {profile?.facility_id ? "Assigned" : "Pending setup"}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 flex-1 justify-start"
              onClick={toggleTheme}
            >
              {resolvedTheme === "dark" ? (
                <SunMedium className="h-4 w-4" />
              ) : (
                <MoonStar className="h-4 w-4" />
              )}
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
            <Button asChild variant="outline" className="h-9 flex-1 justify-start">
              <Link href="/logout">
                <LogOut className="h-4 w-4" />
                Sign out
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,251,255,1))] dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">
      {mobileMenuOpen ? (
        <div className="print-hidden fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden">
          <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col border-r border-border bg-white/95 shadow-2xl dark:bg-slate-950/95">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Navigation
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      <aside className="print-hidden hidden border-b border-border bg-white/90 backdrop-blur dark:bg-slate-950/90 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
        {sidebar}
      </aside>

      <div className="lg:pl-72">
        <header className="print-hidden sticky top-0 z-20 border-b border-border bg-white/80 backdrop-blur dark:bg-slate-950/80">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Laboratory dashboard
                </p>
                <h1 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  Operational overview
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:inline-flex"
                onClick={toggleTheme}
              >
                {resolvedTheme === "dark" ? (
                  <SunMedium className="h-4 w-4" />
                ) : (
                  <MoonStar className="h-4 w-4" />
                )}
              </Button>
              <Button variant="outline" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link href="/logout">
                  <LogOut className="h-4 w-4" />
                  Logout
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
