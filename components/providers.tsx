"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { OfflineProvider } from "@/components/offline-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 5 * 60_000,
            staleTime: 10_000,
            retry: 1,
            refetchOnReconnect: true,
            refetchOnWindowFocus: true
          },
          mutations: {
            retry: 0
          }
        }
      })
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore registration issues in unsupported environments.
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <OfflineProvider>
            <AuthProvider>{children}</AuthProvider>
          </OfflineProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
