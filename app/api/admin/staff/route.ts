import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth-session";
import { getPool, migrateDatabase } from "@/lib/db";
import { HOSPITAL_ID } from "@/lib/db/schema";
import { hashPassword } from "@/lib/security";
import type { AppRole } from "@/lib/auth-types";

export const runtime = "nodejs";

const allowedRoles = ["Admin", "Receptionist", "Doctor", "Nurse", "Pharmacist", "Storekeeper", "Radiologist", "LabScientist", "Verifier", "Accountant"] as const satisfies AppRole[];
const requestSchema = z.object({
  display_name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().trim().min(12).max(72).optional().or(z.literal("")),
  role: z.enum(allowedRoles)
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || session.profile.role !== "Admin") return NextResponse.json({ error: "Only the hospital Admin can create staff accounts." }, { status: 403 });
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid staff account." }, { status: 400 });
    await migrateDatabase();
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password || `StGianna-${randomBytes(6).toString("hex")}`;
    const generated = !parsed.data.password;
    const id = randomUUID();
    await getPool().execute(
      `INSERT INTO profiles (id, facility_id, display_name, email, password_hash, role, approval_status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 'Approved', 1)`,
      [id, HOSPITAL_ID, parsed.data.display_name, email, await hashPassword(password), parsed.data.role]
    );
    return NextResponse.json({
      temporary_password: generated ? password : null,
      user: { id, display_name: parsed.data.display_name, email, role: parsed.data.role }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account could not be created.";
    return NextResponse.json({ error: message.includes("Duplicate") ? "A staff account already uses that email." : message }, { status: 400 });
  }
}
