"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
});

type RegisterFormValues = z.infer<typeof registerSchema>;

const initialState: RegisterFormValues = {
  fullName: "",
  email: "",
  password: ""
};

export default function RegisterPage() {
  const router = useRouter();
  const { refreshProfile, session, loading: authLoading } = useAuth();
  const [form, setForm] = useState<RegisterFormValues>(initialState);
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

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your registration details.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY first.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
      }
    });
    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      await refreshProfile(data.session.user.id);
      setLoading(false);
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setLoading(false);
    setSuccess(
      "Account created. Check your email to confirm it, then wait for Super Admin approval before using the workspace."
    );
  };

  const sendMagicLink = async () => {
    setError(null);
    setSuccess(null);

    const emailResult = registerSchema.pick({ email: true }).safeParse(form);
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

    setSuccess(
      "Magic link sent. Check your email to continue. New accounts still need Super Admin approval before access is granted."
    );
  };

  return (
    <Card className="border-blue-100 bg-white/90 shadow-xl shadow-blue-100/50 backdrop-blur">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-slate-950">Create an account</CardTitle>
        <CardDescription>
          Register with email/password or request a magic link. Every new account must be
          approved by the Super Admin before it can use the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              value={form.fullName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  fullName: event.target.value
                }))
              }
              placeholder="Amina Bello"
            />
          </div>

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
              placeholder="amina@lab.ng"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
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
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={sendMagicLink}
            disabled={loading || authLoading}
          >
            <Mail className="h-4 w-4" />
            Send magic link instead
          </Button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-blue-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
