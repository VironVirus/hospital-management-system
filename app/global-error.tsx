"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error: _error
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
        <main className="mx-auto flex max-w-2xl items-center">
          <div className="w-full rounded-3xl border border-red-400/30 bg-slate-900/90 p-8 shadow-xl">
            <div className="flex items-center gap-3 text-red-300">
              <AlertTriangle className="h-5 w-5" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="mt-4 text-sm text-slate-300">Please try again.</p>
          </div>
        </main>
      </body>
    </html>
  );
}
