"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BedDouble,
  Building2,
  CircleUserRound,
  ClipboardPlus,
  FileText,
  FlaskConical,
  HeartPulse,
  Hospital,
  KeyRound,
  LogOut,
  Menu,
  MoonStar,
  Pill,
  ScanLine,
  ScanSearch,
  ShieldCheck,
  SunMedium,
  Stethoscope,
  Store,
  Syringe,
  TestTube2,
  X,
  Wallet
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatAppRole, type AppRole } from "@/lib/auth-types";

type NavigationItem = {
  href: Route;
  label: string;
  icon: typeof Activity;
  roles: AppRole[];
  group: "Care" | "Diagnostics" | "Operations" | "Administration";
};

const navigation: NavigationItem[] = [
  { href: "/hospital", label: "Hospital", icon: Hospital, roles: ["Admin", "Doctor", "Nurse"] as AppRole[], group: "Care" },
  {
    href: "/clinical",
    label: "Clinical",
    icon: HeartPulse,
    roles: ["Admin", "Receptionist", "Doctor", "Nurse", "LabScientist", "Pharmacist", "Radiologist"] as AppRole[],
    group: "Care"
  },
  {
    href: "/wards",
    label: "Wards",
    icon: BedDouble,
    roles: ["Admin", "Doctor", "Nurse", "Receptionist"] as AppRole[],
    group: "Care"
  },
  {
    href: "/nursing",
    label: "Nursing",
    icon: Syringe,
    roles: ["Admin", "Nurse"] as AppRole[],
    group: "Care"
  },
  {
    href: "/patients",
    label: "Patients",
    icon: Building2,
    roles: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"] as AppRole[],
    group: "Care"
  },
  {
    href: "/inventory",
    label: "Store",
    icon: Store,
    roles: ["Admin", "LabScientist", "Accountant", "Storekeeper", "Pharmacist"] as AppRole[],
    group: "Operations"
  },
  {
    href: "/pharmacy",
    label: "Pharmacy",
    icon: Pill,
    roles: ["Admin", "Doctor", "Nurse", "Pharmacist", "Storekeeper"] as AppRole[],
    group: "Operations"
  },
  {
    href: "/radiology",
    label: "Radiology",
    icon: ScanSearch,
    roles: ["Admin", "Receptionist", "Doctor", "Nurse", "Radiologist", "Accountant"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/hospital-billing",
    label: "Patient Billing",
    icon: Wallet,
    roles: ["Admin", "Receptionist", "Accountant", "Doctor", "Nurse"] as AppRole[],
    group: "Operations"
  },
  { href: "/dashboard", label: "Laboratory", icon: Activity, roles: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant"] as AppRole[], group: "Diagnostics" },
  {
    href: "/orders",
    label: "Tests",
    icon: ClipboardPlus,
    roles: ["Admin", "Receptionist", "LabScientist"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/orders/reception",
    label: "Sample Reception",
    icon: ScanLine,
    roles: ["Admin", "Receptionist", "LabScientist", "Verifier"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/results",
    label: "Results",
    icon: Stethoscope,
    roles: ["Admin", "LabScientist", "Verifier"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/qc",
    label: "Quality Control",
    icon: FlaskConical,
    roles: ["Admin", "LabScientist", "Verifier"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/reports",
    label: "Reports",
    icon: FileText,
    roles: ["Admin", "Receptionist", "Verifier"] as AppRole[],
    group: "Diagnostics"
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Wallet,
    roles: ["Admin", "Accountant"] as AppRole[],
    group: "Operations"
  },
  {
    href: "/billing",
    label: "Laboratory Billing",
    icon: Wallet,
    roles: ["Admin", "Accountant"] as AppRole[],
    group: "Operations"
  },
  {
    href: "/admin",
    label: "Administration",
    icon: ShieldCheck,
    roles: ["Admin"] as AppRole[],
    group: "Administration"
  },
  {
    href: "/admin/tests",
    label: "Test Catalogue",
    icon: TestTube2,
    roles: ["Admin"] as AppRole[],
    group: "Administration"
  },
  {
    href: "/admin/audit",
    label: "Audit Logs",
    icon: Activity,
    roles: ["Admin"] as AppRole[],
    group: "Administration"
  }
];

const navigationGroups: NavigationItem["group"][] = [
  "Care",
  "Diagnostics",
  "Operations",
  "Administration"
];

const mobileNavigationPriority: Route[] = [
  "/hospital",
  "/patients",
  "/clinical",
  "/nursing",
  "/dashboard",
  "/orders",
  "/results",
  "/wards",
  "/pharmacy",
  "/radiology",
  "/inventory",
  "/accounts",
  "/admin"
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { facilityName, profile, role, user, loading } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavigation =
    role ? navigation.filter((item) => item.roles.includes(role)) : [];

  const currentPage = visibleNavigation
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    )
    .sort((left, right) => right.href.length - left.href.length)[0];

  const mobileNavigation = mobileNavigationPriority
    .map((href) => visibleNavigation.find((item) => item.href === href))
    .filter((item): item is NavigationItem => Boolean(item))
    .slice(0, 4);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-soft">
          <Hospital className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">St Gianna Specialist Hospital</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Transekulu, Enugu
          </p>
        </div>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {navigationGroups.map((group) => {
          const items = visibleNavigation.filter((item) => item.group === group);
          if (!items.length) return null;

          return (
            <div key={group} className="space-y-1">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                {group}
              </p>
              {items.map((item) => {
                const Icon = item.icon;
                const active = currentPage?.href === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500 dark:text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      active
                        ? "bg-white/15"
                        : "bg-slate-100 text-slate-500 group-hover:bg-white dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-slate-700"
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="space-y-2 px-3 pb-3">
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
            <Badge variant="outline">{loading ? "Loading..." : formatAppRole(role)}</Badge>
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
          <Button asChild variant="ghost" className="h-9 w-full justify-start">
            <Link href="/account">
              <KeyRound className="h-4 w-4" />
              Change password
            </Link>
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,251,255,1))] dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">
      {mobileMenuOpen ? (
        <div
          className="print-hidden fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[92%] max-w-sm flex-col border-r border-border bg-white shadow-2xl dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Navigation
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close navigation"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      <aside className="print-hidden hidden border-b border-border bg-white/95 backdrop-blur dark:bg-slate-950/95 lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
        {sidebar}
      </aside>

      <div className="lg:pl-72">
        <header className="print-hidden sticky top-0 z-20 border-b border-border bg-white/80 backdrop-blur dark:bg-slate-950/80">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between px-3 sm:px-5 lg:px-8">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-slate-950 sm:text-lg dark:text-slate-50">
                  {currentPage?.label || "St Gianna Hospital"}
                </h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
                  {facilityName || "St Gianna Specialist Hospital"}
                </p>
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
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link href="/logout">
                  <LogOut className="h-4 w-4" />
                  Logout
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-3 py-4 pb-28 sm:px-5 sm:py-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Quick navigation"
        className="mobile-safe-bottom print-hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-1 pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden dark:bg-slate-950/95"
      >
        <div className="mx-auto flex max-w-lg">
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            const active = currentPage?.href === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition-colors",
                  active
                    ? "text-blue-700 dark:text-blue-300"
                    : "text-slate-500 dark:text-slate-400"
                )}
              >
                <span className={cn("rounded-xl p-1.5", active && "bg-blue-50 dark:bg-blue-500/15")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-slate-500 transition-colors dark:text-slate-400"
            aria-label="Open all navigation"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="rounded-xl p-1.5">
              <Menu className="h-5 w-5" />
            </span>
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
