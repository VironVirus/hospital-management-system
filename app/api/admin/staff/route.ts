import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AppRole } from "@/lib/auth-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Tables } from "@/types/supabase";

export const runtime = "nodejs";

const allowedRoleValues = [
  "Admin",
  "Receptionist",
  "LabScientist",
  "Verifier",
  "Accountant"
] as const satisfies AppRole[];

const requestSchema = z.object({
  display_name: z.string().trim().min(2, "Staff name is required"),
  email: z.string().trim().email("Enter a valid staff email address"),
  facility_id: z.string().uuid("Choose a valid facility"),
  password: z.string().trim().min(8, "Temporary password must be at least 8 characters").max(72).optional().or(z.literal("")),
  role: z.enum(allowedRoleValues)
});

type ActorProfile = Pick<Tables<"profiles">, "facility_id" | "id" | "role">;
type FacilitySummary = Pick<Tables<"facilities">, "code" | "id" | "name">;

function generateTemporaryPassword() {
  return `Tapxora-${randomBytes(6).toString("hex")}`;
}

function canCreateRole(actorRole: AppRole, targetRole: AppRole) {
  if (actorRole === "SuperAdmin") {
    return targetRole !== "SuperAdmin";
  }

  return !["SuperAdmin", "Admin"].includes(targetRole);
}

export async function POST(request: NextRequest) {
  const authResponse = NextResponse.next();
  const supabase = createSupabaseServerClient(request, authResponse);

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase server environment variables are not configured." },
      { status: 500 }
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid staff account request." },
      { status: 400 }
    );
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "You must be signed in to create staff accounts." }, { status: 401 });
  }

  const { data: actorProfileData, error: actorError } = await supabase
    .from("profiles")
    .select("id, role, facility_id")
    .eq("id", user.id)
    .single();
  const actorProfile = (actorProfileData ?? null) as ActorProfile | null;

  if (actorError || !actorProfile) {
    return NextResponse.json({ error: "Your staff profile could not be loaded." }, { status: 403 });
  }

  if (!["SuperAdmin", "Admin"].includes(actorProfile.role)) {
    return NextResponse.json({ error: "Only Admin or Super Admin users can create staff accounts." }, { status: 403 });
  }

  if (!canCreateRole(actorProfile.role, parsed.data.role)) {
    return NextResponse.json(
      { error: "Only the Super Admin can create another Admin account." },
      { status: 403 }
    );
  }

  if (actorProfile.role !== "SuperAdmin" && parsed.data.facility_id !== actorProfile.facility_id) {
    return NextResponse.json(
      { error: "Branch Admins can create staff only inside their own facility." },
      { status: 403 }
    );
  }

  const { data: facilityData, error: facilityError } = await supabase
    .from("facilities")
    .select("id, name, code")
    .eq("id", parsed.data.facility_id)
    .single();
  const facility = (facilityData ?? null) as FacilitySummary | null;

  if (facilityError || !facility) {
    return NextResponse.json(
      { error: "That facility is not visible in your current scope." },
      { status: 403 }
    );
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json(
        {
          error:
          "Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY on this deployment before creating staff accounts from the dashboard."
        },
        { status: 500 }
      );
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password?.trim() || generateTemporaryPassword();
  const passwordWasGenerated = !parsed.data.password?.trim();

  const { data: existingProfileData } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();
  const existingProfile = (existingProfileData ?? null) as Pick<Tables<"profiles">, "id"> | null;

  if (existingProfile?.id) {
    return NextResponse.json(
      { error: "A staff account already exists for that email address." },
      { status: 409 }
    );
  }

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    password,
    user_metadata: {
      full_name: parsed.data.display_name
    }
  });

  if (createUserError || !createdUser.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? "The staff account could not be created." },
      { status: 400 }
    );
  }

  const profilePayload = {
    display_name: parsed.data.display_name.trim(),
    email: normalizedEmail,
    facility_id: facility.id,
    id: createdUser.user.id,
    role: parsed.data.role
  };

  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(createdUser.user.id);

    return NextResponse.json(
      { error: profileError.message || "The staff profile could not be saved." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    temporary_password: passwordWasGenerated ? password : null,
    user: {
      display_name: profilePayload.display_name,
      email: normalizedEmail,
      facility_code: facility.code,
      facility_name: facility.name,
      id: createdUser.user.id,
      password_was_generated: passwordWasGenerated,
      role: parsed.data.role
    }
  });
}
