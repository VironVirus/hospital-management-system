import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
      <section className="hidden overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.2),_transparent_35%),linear-gradient(180deg,_#0f172a_0%,_#1e3a8a_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-blue-100">
            St Gianna Specialist Hospital
          </p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight">
            Built for reliable lab work in clinics, hospitals, and diagnostic
            centers.
          </h1>
          <p className="max-w-lg text-base leading-7 text-blue-100">
            Secure access, fast online workflows, and a clean medical interface
            that stays calm under real-world pressure.
          </p>
        </div>

        <div className="grid max-w-xl gap-4 sm:grid-cols-3">
          {[
            ["Auth", "Secure sign-in"],
            ["Live", "Direct online updates"],
            ["RLS", "Protect clinical data"]
          ].map(([title, copy]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"
            >
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-blue-100">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
