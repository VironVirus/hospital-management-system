"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppSession, SessionUser } from "@/lib/auth-session";
import type { AppRole, UserProfile } from "@/lib/auth-types";

type AuthContextValue = {
  session: AppSession | null;
  user: SessionUser | null;
  profile: UserProfile | null;
  role: AppRole | null;
  facilityId: string | null;
  facilityName: string | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "include" });
    const payload = await response.json().catch(() => null) as { session?: AppSession | null } | null;
    setSession(payload?.session ?? null);
  }, []);

  useEffect(() => {
    void refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setSession(null);
  }, []);

  return <AuthContext.Provider value={{
    session,
    user: session?.user ?? null,
    profile: session?.profile ?? null,
    role: session?.profile.role ?? null,
    facilityId: session?.profile.facility_id ?? null,
    facilityName: session?.facilityName ?? null,
    loading,
    refreshProfile,
    signOut
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
