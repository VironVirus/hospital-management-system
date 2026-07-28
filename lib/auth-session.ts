import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2/promise";
import { getPool, isDatabaseConfigured, migrateDatabase } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import { hashToken } from "@/lib/security";
import type { AppRole, UserProfile } from "@/lib/auth-types";
import { loadServerEnv } from "@/lib/server-env";

export const SESSION_COOKIE = "st_gianna_session";
export const PREVIEW_SESSION_COOKIE = "st_gianna_preview_session";
const SESSION_HOURS = 12;

export type SessionUser = {
  id: string;
  email: string;
};

export type AppSession = {
  user: SessionUser;
  profile: UserProfile;
  facilityName: string;
  expiresAt: string;
};

type SessionRow = RowDataPacket & {
  session_id: string;
  expires_at: Date | string;
  id: string;
  email: string;
  display_name: string | null;
  facility_id: string;
  role: AppRole;
  approval_status: "Pending" | "Approved" | "Rejected";
  created_at: Date | string;
  updated_at: Date | string;
  facility_name: string;
};

function canUsePreviewAuth() {
  return process.env.NODE_ENV !== "production";
}

function getPreviewIdentity() {
  loadServerEnv();
  return {
    identifier: (process.env.HMS_ADMIN_EMAIL?.trim().toLowerCase() || "admin"),
    password: (process.env.HMS_ADMIN_PASSWORD?.trim() || "StGiannaPreview1234"),
    displayName: process.env.HMS_ADMIN_NAME?.trim() || "Hospital Administrator"
  };
}

function buildPreviewSession(): AppSession {
  const now = new Date().toISOString();
  const preview = getPreviewIdentity();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();

  return {
    user: { id: "preview-admin", email: preview.identifier },
    profile: {
      id: "preview-admin",
      display_name: preview.displayName,
      email: preview.identifier,
      facility_id: HOSPITAL_ID,
      role: "Admin",
      approval_status: "Approved",
      created_at: now,
      updated_at: now
    },
    facilityName: "St Gianna Specialist Hospital",
    expiresAt
  };
}

async function getPreviewSessionFromCookie() {
  if (!canUsePreviewAuth()) return null;
  const store = await cookies();
  if (store.get(PREVIEW_SESSION_COOKIE)?.value !== "1") return null;
  return buildPreviewSession();
}

export async function createPreviewSession(identifier: string, password: string) {
  if (!canUsePreviewAuth()) return false;

  const preview = getPreviewIdentity();
  if (identifier.trim().toLowerCase() !== preview.identifier || password !== preview.password) {
    return false;
  }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.set(PREVIEW_SESSION_COOKIE, "1", {
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: "/",
    expires: expiresAt
  });
  return true;
}

export function isPreviewSession(session: AppSession | null | undefined) {
  return session?.user.id === "preview-admin";
}

export async function createSession(userId: string) {
  await migrateDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getPool().execute(
    "INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [randomUUID(), userId, hashToken(token), expiresAt]
  );
  const store = await cookies();
  store.delete(PREVIEW_SESSION_COOKIE);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && isDatabaseConfigured()) {
    try {
      await migrateDatabase();
      await getPool().execute("DELETE FROM user_sessions WHERE token_hash = ?", [hashToken(token)]);
    } catch {}
  }
  store.delete(SESSION_COOKIE);
  store.delete(PREVIEW_SESSION_COOKIE);
}

export async function getCurrentSession(): Promise<AppSession | null> {
  if (!isDatabaseConfigured()) return getPreviewSessionFromCookie();

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return getPreviewSessionFromCookie();

  try {
    await migrateDatabase();
    const [rows] = await getPool().query<SessionRow[]>(
      `SELECT s.id AS session_id, s.expires_at, p.id, p.email, p.display_name,
        p.facility_id, p.role, p.approval_status, p.created_at, p.updated_at, f.name AS facility_name
       FROM user_sessions s
       JOIN profiles p ON p.id = s.user_id
       JOIN facilities f ON f.id = p.facility_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)
         AND p.is_active = 1 AND p.approval_status = 'Approved'
       LIMIT 1`,
      [hashToken(token)]
    );
    const row = rows[0];
    if (!row) return getPreviewSessionFromCookie();
    void getPool().execute("UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = ?", [row.session_id]);
    return {
      user: { id: row.id, email: row.email },
      profile: {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        facility_id: row.facility_id,
        role: row.role,
        approval_status: row.approval_status,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString()
      },
      facilityName: row.facility_name,
      expiresAt: new Date(row.expires_at).toISOString()
    };
  } catch {
    return getPreviewSessionFromCookie();
  }
}
