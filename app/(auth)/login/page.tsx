"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile, session, loading: authLoading } = useAuth();
  const [form, setForm] = useState<LoginFormValues>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace("/hospital");
  }, [authLoading, router, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your login details.");
    try {
      setLoading(true);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data)
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Sign-in failed.");
      await refreshProfile();
      router.replace("/hospital");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally { setLoading(false); }
  };

  return <Card className="border-blue-100 bg-white/90 shadow-xl shadow-blue-100/50 backdrop-blur">
    <CardHeader><CardTitle className="text-2xl text-slate-950">Staff sign in</CardTitle></CardHeader>
    <CardContent><form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="staff@stgiannahospital.com" required /></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="••••••••" required /></div>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading || authLoading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{loading ? "Signing in..." : "Sign in"}</Button>
    </form></CardContent>
  </Card>;
}
