"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
      <Card className="w-full border-red-100 bg-white/95 shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5" />
            Something went wrong
          </CardTitle>
          <CardDescription className="text-red-800">Please try again.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.digest ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Reference: {error.digest}
            </p>
          ) : null}
          <Button onClick={reset} type="button">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
