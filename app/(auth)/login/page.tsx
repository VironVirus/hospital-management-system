"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { loginSchema, type LoginFormValues } from "@/lib/validators/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

const initialState: LoginFormValues = {
  email: "",
  password: ""
};

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile, session, loading: authLoading } = useAuth();
  const [form, setForm] = useState<LoginFormValues>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      router.replace("/dashboard");
    }
  }, [authLoading, router, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your login details.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.");
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword(parsed.data);

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    await refreshProfile(data.user?.id);
    setLoading(false);
    router.replace("/dashboard");
    router.refresh();
  };

  const sendMagicLink = async () => {
    setError(null);
    setSuccess(null);

    const emailResult = loginSchema.pick({ email: true }).safeParse(form);
    if (!emailResult.success) {
      setError(emailResult.error.issues[0]?.message ?? "Enter your email address.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.");
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: emailResult.data.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
      }
    });

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setSuccess("Magic link sent. Check your email to continue.");
  };

  return (
    <Card className="border-blue-100 bg-white/90 shadow-xl shadow-blue-100/50 backdrop-blur">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-slate-950">Sign in</CardTitle>
        <CardDescription>
          Use email/password or a magic link to enter the laboratory workspace. Accounts
          still waiting for Super Admin approval will be held outside the main app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="lab.admin@hospital.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value
                }))
              }
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {success}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading || authLoading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Signing in..." : "Sign in with password"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={sendMagicLink}
            disabled={loading || authLoading}
          >
            <Mail className="h-4 w-4" />
            Send magic link
          </Button>

          <p className="text-center text-sm text-slate-600">
            New here?{" "}
            <Link href="/register" className="font-medium text-blue-700 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
