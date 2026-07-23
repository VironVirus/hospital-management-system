import type { ReactNode } from "react";
import { Hospital } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6">
      <section className="w-full max-w-md space-y-6">
        <header className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white">
            <Hospital className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-950 dark:text-white">St Gianna Specialist Hospital</h1>
          <p className="mt-1 text-sm text-slate-500">Transekulu, Enugu</p>
        </header>
        {children}
      </section>
    </main>
  );
}
