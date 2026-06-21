"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  type ReactNode
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  isAccessStateActive,
  type AccessSnapshot
} from "@/lib/access-control";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { AppRole, UserProfile } from "@/lib/auth-types";

type AuthContextValue = {
  accessMessage: string | null;
  accessSnapshot: AccessSnapshot | null;
  accessState: string | null;
  approvalStatus: UserProfile["approval_status"] | null;
  facilityAccessEndsAt: string | null;
  facilityAccessMode: AccessSnapshot["facility_access_mode"] | null;
  facilityName: string | null;
  hasAppAccess: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  facilityId: string | null;
  loading: boolean;
  refreshProfile: (userId?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfile(userId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, email, avatar_url, facility_id, role, approval_status, approval_note, approved_at, approved_by, created_at, updated_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingEmailColumn =
      error.message.toLowerCase().includes("email") &&
      error.message.toLowerCase().includes("profiles");

    if (!missingEmailColumn) {
      return null;
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_url, facility_id, role, approval_status, approval_note, approved_at, approved_by, created_at, updated_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (fallbackError || !fallbackData) {
      return null;
    }

    return { ...fallbackData, email: null } as UserProfile;
  }

  if (!data) {
    return null;
  }

  return data as UserProfile;
}

async function loadAccessSnapshot() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("current_user_access_snapshot");

  if (error) {
    return null;
  }

  return (data?.[0] ?? null) as AccessSnapshot | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => getSupabaseBrowserClient());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessSnapshot, setAccessSnapshot] = useState<AccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const syncProfile = async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      setAccessSnapshot(null);
      return;
    }

    const [nextProfile, nextSnapshot] = await Promise.all([
      loadProfile(userId),
      loadAccessSnapshot()
    ]);
    setProfile(nextProfile);
    setAccessSnapshot(nextSnapshot);
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }

      setSession(data.session);
      await syncProfile(data.session?.user.id ?? null);
      if (mounted) {
        setLoading(false);
      }
    };

    bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      await syncProfile(nextSession?.user.id ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshProfile = useCallback(async (userId?: string) => {
    const profileUserId = userId ?? session?.user.id ?? null;
    if (!profileUserId) {
      setProfile(null);
      setAccessSnapshot(null);
      return;
    }

    const [nextProfile, nextSnapshot] = await Promise.all([
      loadProfile(profileUserId),
      loadAccessSnapshot()
    ]);
    setProfile(nextProfile);
    setAccessSnapshot(nextSnapshot);
  }, [session?.user]);

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      setProfile(null);
      setAccessSnapshot(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }

    setSession(null);
    setProfile(null);
    setAccessSnapshot(null);
  }, [supabase]);

  const accessState = accessSnapshot?.access_state ?? null;
  const hasAppAccess = !session || isAccessStateActive(accessState);

  const value: AuthContextValue = {
    accessMessage: accessSnapshot?.access_message ?? null,
    accessSnapshot,
    accessState,
    approvalStatus: profile?.approval_status ?? null,
    facilityAccessEndsAt: accessSnapshot?.facility_access_ends_at ?? null,
    facilityAccessMode: accessSnapshot?.facility_access_mode ?? null,
    facilityName: accessSnapshot?.facility_name ?? null,
    hasAppAccess,
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    facilityId: profile?.facility_id ?? null,
    loading,
    refreshProfile,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
