"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountPage() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.next !== form.confirm) {
      setMessage({ tone: "error", text: "The new passwords do not match." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current_password: form.current, new_password: form.next })
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!response.ok) {
      setMessage({ tone: "error", text: payload?.error || "The password could not be changed." });
      return;
    }
    setForm({ current: "", next: "", confirm: "" });
    setMessage({ tone: "success", text: "Password changed. Other signed-in sessions were closed." });
  }

  return <div className="mx-auto max-w-xl">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-blue-700" />Account security</CardTitle>
        <CardDescription>Use a unique password of at least 12 characters. Changing it signs this account out on other devices.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div><Label htmlFor="current-password">Current password</Label><Input id="current-password" className="mt-1" type="password" autoComplete="current-password" value={form.current} onChange={(event) => setForm((value) => ({ ...value, current: event.target.value }))} required /></div>
          <div><Label htmlFor="new-password">New password</Label><Input id="new-password" className="mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.next} onChange={(event) => setForm((value) => ({ ...value, next: event.target.value }))} required /></div>
          <div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" className="mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.confirm} onChange={(event) => setForm((value) => ({ ...value, confirm: event.target.value }))} required /></div>
          {message ? <p className={`rounded-xl px-4 py-3 text-sm ${message.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message.text}</p> : null}
          <Button className="w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Change password</Button>
        </form>
      </CardContent>
    </Card>
  </div>;
}
