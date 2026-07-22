"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LogoutPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const hasSignedOut = useRef(false);

  useEffect(() => {
    if (hasSignedOut.current) {
      return;
    }

    hasSignedOut.current = true;

    const run = async () => {
      try {
        await signOut();
      } finally {
        router.refresh();
      }
      router.replace("/login");
    };

    run();
  }, [router, signOut]);

  return (
    <Card className="border-blue-100 bg-white/90 shadow-xl shadow-blue-100/50 backdrop-blur">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-slate-950">Signing you out</CardTitle>
        <CardDescription>
          Your secure hospital session is being cleared.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Please wait while we finish logging you out.
        </div>
        <Button variant="outline" className="w-full" onClick={() => router.replace("/login")}>
          <LogOut className="h-4 w-4" />
          Back to sign in
        </Button>
      </CardContent>
    </Card>
  );
}
