"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Save } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { canAccessAdministrationRole } from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";

export type LabBrandingSettings = {
  accreditation: string | null;
  address: string | null;
  facility_id: string;
  lab_name: string | null;
  report_footer: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  support_line: string | null;
};

type BrandingFormState = Omit<LabBrandingSettings, "facility_id">;

type LabBrandingSettingsPanelProps = {
  description?: string;
  facilityIdOverride?: string | null;
  facilityName?: string | null;
  title?: string;
};

const emptyForm: BrandingFormState = {
  accreditation: "",
  address: "",
  lab_name: "",
  report_footer: "",
  signatory_name: "HOD of Lab / Chief Scientist",
  signatory_title: "Head of Laboratory / Chief Scientist",
  support_line: ""
};

function getDatabaseForBranding() {
  const database = getAppClient();
  if (!database) {
    throw new Error("Service unavailable.");
  }

  return database as unknown as {
    from: (table: "lab_branding_settings") => {
      select: (columns: string) => {
        eq: (
          column: "facility_id",
          value: string
        ) => {
          maybeSingle: () => Promise<{
            data: LabBrandingSettings | null;
            error: Error | null;
          }>;
        };
      };
      upsert: (
        payload: LabBrandingSettings & { updated_by: string | null },
        options: { onConflict: "facility_id" }
      ) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: LabBrandingSettings | null;
            error: Error | null;
          }>;
        };
      };
    };
  };
}

export async function fetchLabBrandingSettings(
  facilityId: string
): Promise<LabBrandingSettings | null> {
  const database = getDatabaseForBranding();
  const { data, error } = await database
    .from("lab_branding_settings")
    .select("*")
    .eq("facility_id", facilityId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function normalizeFormValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function LabBrandingSettingsPanel({
  description = "Control the identity shown on PDFs, printed reports, and patient-facing documents.",
  facilityIdOverride,
  facilityName,
  title = "Lab branding and reports"
}: LabBrandingSettingsPanelProps) {
  const { facilityId, loading, role, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<BrandingFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const canAccessAdministration = canAccessAdministrationRole(role);
  const targetFacilityId = facilityIdOverride ?? facilityId;
  const canManageTargetFacility = Boolean(targetFacilityId && targetFacilityId === facilityId);

  const brandingQuery = useQuery({
    queryKey: ["lab-branding", targetFacilityId],
    queryFn: () => fetchLabBrandingSettings(targetFacilityId as string),
    enabled: Boolean(targetFacilityId) && canAccessAdministration && canManageTargetFacility
  });

  useEffect(() => {
    if (!brandingQuery.data) {
      setForm(emptyForm);
      return;
    }

    setForm({
      accreditation: brandingQuery.data.accreditation ?? "",
      address: brandingQuery.data.address ?? "",
      lab_name: brandingQuery.data.lab_name ?? "",
      report_footer: brandingQuery.data.report_footer ?? "",
      signatory_name:
        brandingQuery.data.signatory_name ?? "HOD of Lab / Chief Scientist",
      signatory_title:
        brandingQuery.data.signatory_title ?? "Head of Laboratory / Chief Scientist",
      support_line: brandingQuery.data.support_line ?? ""
    });
  }, [brandingQuery.data]);

  const previewName = useMemo(
    () => form.lab_name?.trim() || facilityName?.trim() || "Hospital report preview",
    [facilityName, form.lab_name]
  );

  if (loading) {
    return (
      <Card className="border-blue-100 shadow-sm">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
          Loading branding settings...
        </CardContent>
      </Card>
    );
  }

  if (!canAccessAdministration) {
    return null;
  }

  if (targetFacilityId && !canManageTargetFacility) {
    return (
      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Branding can only be edited for this hospital.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const updateField = (key: keyof BrandingFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!targetFacilityId) {
      toast({
        title: "Access unavailable",
        description: "Unable to save.",
        variant: "error"
      });
      return;
    }

    if (!canManageTargetFacility) {
      toast({
        title: "Facility access required",
        description:
          "You can only update branding for this hospital.",
        variant: "error"
      });
      return;
    }

    setSaving(true);

    try {
      const database = getDatabaseForBranding();
      const payload = {
        accreditation: normalizeFormValue(form.accreditation ?? ""),
        address: normalizeFormValue(form.address ?? ""),
        facility_id: targetFacilityId,
        lab_name: normalizeFormValue(form.lab_name ?? ""),
        report_footer: normalizeFormValue(form.report_footer ?? ""),
        signatory_name: normalizeFormValue(form.signatory_name ?? ""),
        signatory_title: normalizeFormValue(form.signatory_title ?? ""),
        support_line: normalizeFormValue(form.support_line ?? ""),
        updated_by: user?.id ?? null
      };

      const { error } = await database
        .from("lab_branding_settings")
        .upsert(payload, { onConflict: "facility_id" })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["lab-branding", targetFacilityId] });
      await queryClient.invalidateQueries({ queryKey: ["lab-branding"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-queue"] });
      toast({
        title: "Branding saved",
        description:
          facilityName && facilityName.trim().length > 0
            ? `${facilityName} will now use the updated report identity.`
            : "Reports will now use the updated lab identity."
      });
    } catch (error) {
      toast({
        title: "Branding could not be saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-700" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {brandingQuery.isLoading ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
            Loading branding settings...
          </div>
        ) : null}

        {brandingQuery.isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
            {brandingQuery.error instanceof Error
              ? brandingQuery.error.message
              : "Unable to load branding settings."}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Report preview
          </p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="space-y-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{previewName}</p>
              <p>{form.support_line?.trim() || "Add the hospital phone or email support line"}</p>
              <p>{form.address?.trim() || "Add the hospital address shown on reports"}</p>
              <p className="text-xs text-slate-500">
                {form.signatory_name?.trim() || "Signatory"} |{" "}
                {form.signatory_title?.trim() || "Role"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lab-name">Lab name</Label>
            <Input
              id="lab-name"
              value={form.lab_name ?? ""}
              onChange={(event) => updateField("lab_name", event.target.value)}
              placeholder="St Gianna Specialist Hospital"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="support-line">Phone / email line</Label>
            <Input
              id="support-line"
              value={form.support_line ?? ""}
              onChange={(event) => updateField("support_line", event.target.value)}
              placeholder="Hospital phone number or email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accreditation">Accreditation / tagline</Label>
            <Input
              id="accreditation"
              value={form.accreditation ?? ""}
              onChange={(event) => updateField("accreditation", event.target.value)}
              placeholder="Accreditation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signatory-name">Signatory name</Label>
            <Input
              id="signatory-name"
              value={form.signatory_name ?? ""}
              onChange={(event) => updateField("signatory_name", event.target.value)}
              placeholder="HOD of Lab / Chief Scientist"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signatory-title">Signatory title</Label>
            <Input
              id="signatory-title"
              value={form.signatory_title ?? ""}
              onChange={(event) => updateField("signatory_title", event.target.value)}
              placeholder="Head of Laboratory / Chief Scientist"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Lab address</Label>
          <Textarea
            id="address"
            value={form.address ?? ""}
            onChange={(event) => updateField("address", event.target.value)}
            placeholder="Full hospital address"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-footer">Report footer</Label>
          <Textarea
            id="report-footer"
            value={form.report_footer ?? ""}
            onChange={(event) => updateField("report_footer", event.target.value)}
            placeholder="Results should be interpreted alongside clinical findings and patient history."
          />
        </div>

        <Button type="button" onClick={handleSave} disabled={saving || !targetFacilityId}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save branding
        </Button>
      </CardContent>
    </Card>
  );
}
