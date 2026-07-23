"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BedDouble,
  Bell,
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
};

const navigation: NavigationItem[] = [
  { href: "/hospital", label: "Hospital Overview", icon: Hospital, roles: ["Admin", "Doctor", "Nurse"] as AppRole[] },
  {
    href: "/clinical",
    label: "Doctor & Clinical",
    icon: HeartPulse,
    roles: ["Admin", "Receptionist", "Doctor", "Nurse", "LabScientist", "Pharmacist", "Radiologist"] as AppRole[]
  },
  {
    href: "/wards",
    label: "Nursing & Wards",
    icon: BedDouble,
    roles: ["Admin", "Doctor", "Nurse", "Receptionist"] as AppRole[]
  },
  {
    href: "/patients",
    label: "Reception & Patients",
    icon: Building2,
    roles: ["Admin", "Receptionist", "LabScientist", "Doctor", "Nurse", "Pharmacist", "Radiologist"] as AppRole[]
  },
  {
    href: "/inventory",
    label: "Store & Inventory",
    icon: Store,
    roles: ["Admin", "LabScientist", "Accountant", "Storekeeper", "Pharmacist"] as AppRole[]
  },
  {
    href: "/pharmacy",
    label: "Pharmacy",
    icon: Pill,
    roles: ["Admin", "Doctor", "Nurse", "Pharmacist", "Storekeeper"] as AppRole[]
  },
  {
    href: "/radiology",
    label: "Radiology",
    icon: ScanSearch,
    roles: ["Admin", "Receptionist", "Doctor", "Nurse", "Radiologist", "Accountant"] as AppRole[]
  },
  {
    href: "/hospital-billing",
    label: "Patient Billing",
    icon: Wallet,
    roles: ["Admin", "Receptionist", "Accountant", "Doctor", "Nurse"] as AppRole[]
  },
  { href: "/dashboard", label: "Laboratory", icon: Activity, roles: ["Admin", "Receptionist", "LabScientist", "Verifier", "Accountant"] as AppRole[] },
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
    href: "/qc",
    label: "Quality Control",
    icon: FlaskConical,
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
  const { facilityName, profile, role, user, loading } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavigation =
    role ? navigation.filter((item) => item.roles.includes(role)) : [];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-soft">
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
              Hospital
            </p>
            <Badge variant="secondary">
              {facilityName || "Hospital"}
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
              <h1 className="text-lg font-semibold text-slate-950 dark:text-slate-50">St Gianna Specialist Hospital</h1>
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
