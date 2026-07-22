"use client";

import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Plus,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
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
import { canAccessQcRole, canManageQcRole } from "@/lib/guards";
import { getAppClient } from "@/lib/app-client";

type QcControl = {
  expected_value: string | null;
  expiry_date: string | null;
  facility_id: string;
  id: string;
  is_active: boolean;
  level: string | null;
  lot_number: string | null;
  max_value: number | null;
  min_value: number | null;
  name: string;
  unit: string | null;
};

type QcRun = {
  control_id: string;
  created_at: string;
  id: string;
  notes: string | null;
  performed_at: string;
  status: "pass" | "fail" | "review";
  value_numeric: number | null;
  value_text: string | null;
  qc_controls?: Pick<QcControl, "name" | "lot_number"> | null;
};

type Analyzer = {
  id: string;
  is_active: boolean;
  location: string | null;
  model: string | null;
  name: string;
  serial_number: string | null;
};

type EquipmentLog = {
  analyzer_id: string;
  analyzers?: Pick<Analyzer, "name"> | null;
  created_at: string;
  due_date: string | null;
  id: string;
  notes: string | null;
  status: string;
};

type CalibrationLog = EquipmentLog & {
  calibration_date: string;
};

type MaintenanceLog = EquipmentLog & {
  maintenance_date: string;
  maintenance_type: string;
};

type QcData = {
  analyzers: Analyzer[];
  calibrations: CalibrationLog[];
  controls: QcControl[];
  maintenance: MaintenanceLog[];
  runs: QcRun[];
};

type EquipmentLogFormState = {
  analyzer_id: string;
  date: string;
  due_date: string;
  maintenance_type?: string;
  notes: string;
  status: string;
};

type QcQueryResponse<T> = Promise<{
  data: T | null;
  error: Error | null;
}>;

type QcOrderedQuery<T> = {
  limit: (count: number) => QcQueryResponse<T>;
};

type QcSelectableQuery<T> = {
  order: (
    column: string,
    options: { ascending: boolean }
  ) => QcOrderedQuery<T>;
};

type QcTable = {
  insert: (payload: Record<string, unknown>) => QcQueryResponse<unknown>;
  select: <T = unknown[]>(columns: string) => QcSelectableQuery<T>;
};

type DatabaseQcClient = {
  from: (table: string) => QcTable;
};

const controlSchema = z.object({
  name: z.string().trim().min(2, "Control name is required."),
  lot_number: z.string().trim().optional(),
  level: z.string().trim().optional(),
  expected_value: z.string().trim().optional(),
  min_value: z.coerce.number().optional(),
  max_value: z.coerce.number().optional(),
  unit: z.string().trim().optional(),
  expiry_date: z.string().optional()
});

const analyzerSchema = z.object({
  name: z.string().trim().min(2, "Analyzer name is required."),
  model: z.string().trim().optional(),
  serial_number: z.string().trim().optional(),
  location: z.string().trim().optional()
});

const runSchema = z.object({
  control_id: z.string().uuid("Select a QC control."),
  notes: z.string().trim().optional(),
  status: z.enum(["pass", "fail", "review"]),
  value: z.string().trim().min(1, "Enter the observed QC value.")
});

const logSchema = z.object({
  analyzer_id: z.string().uuid("Select an analyzer."),
  date: z.string().min(1, "Date is required."),
  due_date: z.string().optional(),
  notes: z.string().trim().optional(),
  status: z.string().min(1, "Status is required.")
});

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function requireDatabase() {
  const database = getAppClient();
  if (!database) {
    throw new Error("MySQL is not configured.");
  }

  return database as unknown as DatabaseQcClient;
}

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function cleanDate(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function toOptionalNumber(value: number | undefined) {
  return Number.isFinite(value) ? value : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

async function fetchQcData(): Promise<QcData> {
  const database = requireDatabase();
  const [controls, runs, analyzers, calibrations, maintenance] = await Promise.all([
    database
      .from("qc_controls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80),
    database
      .from("qc_runs")
      .select("*, qc_controls(name, lot_number)")
      .order("performed_at", { ascending: false })
      .limit(60),
    database
      .from("analyzers")
      .select("*")
      .order("name", { ascending: true })
      .limit(80),
    database
      .from("calibration_logs")
      .select("*, analyzers(name)")
      .order("calibration_date", { ascending: false })
      .limit(60),
    database
      .from("maintenance_logs")
      .select("*, analyzers(name)")
      .order("maintenance_date", { ascending: false })
      .limit(60)
  ]);

  for (const response of [controls, runs, analyzers, calibrations, maintenance]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  return {
    analyzers: (analyzers.data ?? []) as Analyzer[],
    calibrations: (calibrations.data ?? []) as CalibrationLog[],
    controls: (controls.data ?? []) as QcControl[],
    maintenance: (maintenance.data ?? []) as MaintenanceLog[],
    runs: (runs.data ?? []) as QcRun[]
  };
}

export function QcWorkspace() {
  const { facilityId, role, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canAccess = canAccessQcRole(role);
  const canManage = canManageQcRole(role);
  const [saving, setSaving] = useState<string | null>(null);
  const [controlForm, setControlForm] = useState({
    expected_value: "",
    expiry_date: "",
    level: "",
    lot_number: "",
    max_value: "",
    min_value: "",
    name: "",
    unit: ""
  });
  const [runForm, setRunForm] = useState({
    control_id: "",
    notes: "",
    status: "review" as QcRun["status"],
    value: ""
  });
  const [analyzerForm, setAnalyzerForm] = useState({
    location: "",
    model: "",
    name: "",
    serial_number: ""
  });
  const [calibrationForm, setCalibrationForm] = useState<EquipmentLogFormState>({
    analyzer_id: "",
    date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
    status: "current"
  });
  const [maintenanceForm, setMaintenanceForm] = useState<EquipmentLogFormState>({
    analyzer_id: "",
    date: new Date().toISOString().slice(0, 10),
    due_date: "",
    maintenance_type: "Preventive",
    notes: "",
    status: "completed"
  });

  const qcQuery = useQuery({
    queryKey: ["qc-workspace", facilityId],
    queryFn: fetchQcData,
    enabled: canAccess && Boolean(facilityId)
  });

  const qcSummary = useMemo(() => {
    const controls = qcQuery.data?.controls ?? [];
    const runs = qcQuery.data?.runs ?? [];
    const analyzers = qcQuery.data?.analyzers ?? [];
    const failedRuns = runs.filter((run) => run.status === "fail").length;

    return {
      activeAnalyzers: analyzers.filter((analyzer) => analyzer.is_active).length,
      activeControls: controls.filter((control) => control.is_active).length,
      failedRuns,
      recentRuns: runs.length
    };
  }, [qcQuery.data]);

  const refreshQc = async () => {
    await queryClient.invalidateQueries({ queryKey: ["qc-workspace"] });
  };

  const handleError = (title: string, error: unknown) => {
    toast({
      title,
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "error"
    });
  };

  const addControl = async () => {
    if (!facilityId) {
      return;
    }

    const parsed = controlSchema.safeParse({
      ...controlForm,
      max_value: controlForm.max_value || undefined,
      min_value: controlForm.min_value || undefined
    });

    if (!parsed.success) {
      handleError("Check the QC control form", new Error(parsed.error.errors[0]?.message));
      return;
    }

    setSaving("control");
    try {
      const database = requireDatabase();
      const { error } = await database.from("qc_controls").insert({
        expected_value: clean(parsed.data.expected_value),
        expiry_date: cleanDate(parsed.data.expiry_date),
        facility_id: facilityId,
        level: clean(parsed.data.level),
        lot_number: clean(parsed.data.lot_number),
        max_value: toOptionalNumber(parsed.data.max_value),
        min_value: toOptionalNumber(parsed.data.min_value),
        name: parsed.data.name,
        unit: clean(parsed.data.unit),
        created_by: user?.id ?? null
      });

      if (error) {
        throw error;
      }

      setControlForm({
        expected_value: "",
        expiry_date: "",
        level: "",
        lot_number: "",
        max_value: "",
        min_value: "",
        name: "",
        unit: ""
      });
      await refreshQc();
      toast({ title: "QC control saved" });
    } catch (error) {
      handleError("QC control could not be saved", error);
    } finally {
      setSaving(null);
    }
  };

  const addRun = async () => {
    if (!facilityId) {
      return;
    }

    const parsed = runSchema.safeParse(runForm);
    if (!parsed.success) {
      handleError("Check the QC run form", new Error(parsed.error.errors[0]?.message));
      return;
    }

    const numericValue = Number(parsed.data.value);
    setSaving("run");
    try {
      const database = requireDatabase();
      const { error } = await database.from("qc_runs").insert({
        control_id: parsed.data.control_id,
        facility_id: facilityId,
        notes: clean(parsed.data.notes),
        performed_by: user?.id ?? null,
        status: parsed.data.status,
        value_numeric: Number.isFinite(numericValue) ? numericValue : null,
        value_text: Number.isFinite(numericValue) ? null : parsed.data.value
      });

      if (error) {
        throw error;
      }

      setRunForm({ control_id: "", notes: "", status: "review", value: "" });
      await refreshQc();
      toast({ title: "QC run recorded" });
    } catch (error) {
      handleError("QC run could not be saved", error);
    } finally {
      setSaving(null);
    }
  };

  const addAnalyzer = async () => {
    if (!facilityId) {
      return;
    }

    const parsed = analyzerSchema.safeParse(analyzerForm);
    if (!parsed.success) {
      handleError("Check the analyzer form", new Error(parsed.error.errors[0]?.message));
      return;
    }

    setSaving("analyzer");
    try {
      const database = requireDatabase();
      const { error } = await database.from("analyzers").insert({
        facility_id: facilityId,
        location: clean(parsed.data.location),
        model: clean(parsed.data.model),
        name: parsed.data.name,
        serial_number: clean(parsed.data.serial_number),
        created_by: user?.id ?? null
      });

      if (error) {
        throw error;
      }

      setAnalyzerForm({ location: "", model: "", name: "", serial_number: "" });
      await refreshQc();
      toast({ title: "Analyzer saved" });
    } catch (error) {
      handleError("Analyzer could not be saved", error);
    } finally {
      setSaving(null);
    }
  };

  const addCalibration = async () => {
    if (!facilityId) {
      return;
    }

    const parsed = logSchema.safeParse(calibrationForm);
    if (!parsed.success) {
      handleError("Check the calibration form", new Error(parsed.error.errors[0]?.message));
      return;
    }

    setSaving("calibration");
    try {
      const database = requireDatabase();
      const { error } = await database.from("calibration_logs").insert({
        analyzer_id: parsed.data.analyzer_id,
        calibration_date: parsed.data.date,
        due_date: cleanDate(parsed.data.due_date),
        facility_id: facilityId,
        notes: clean(parsed.data.notes),
        performed_by: user?.id ?? null,
        status: parsed.data.status
      });

      if (error) {
        throw error;
      }

      setCalibrationForm({
        analyzer_id: "",
        date: new Date().toISOString().slice(0, 10),
        due_date: "",
        notes: "",
        status: "current"
      });
      await refreshQc();
      toast({ title: "Calibration logged" });
    } catch (error) {
      handleError("Calibration could not be saved", error);
    } finally {
      setSaving(null);
    }
  };

  const addMaintenance = async () => {
    if (!facilityId) {
      return;
    }

    const parsed = logSchema.safeParse(maintenanceForm);
    if (!parsed.success) {
      handleError("Check the maintenance form", new Error(parsed.error.errors[0]?.message));
      return;
    }

    setSaving("maintenance");
    try {
      const database = requireDatabase();
      const { error } = await database.from("maintenance_logs").insert({
        analyzer_id: parsed.data.analyzer_id,
        due_date: cleanDate(parsed.data.due_date),
        facility_id: facilityId,
        maintenance_date: parsed.data.date,
        maintenance_type: clean(maintenanceForm.maintenance_type) ?? "Preventive",
        notes: clean(parsed.data.notes),
        performed_by: user?.id ?? null,
        status: parsed.data.status
      });

      if (error) {
        throw error;
      }

      setMaintenanceForm({
        analyzer_id: "",
        date: new Date().toISOString().slice(0, 10),
        due_date: "",
        maintenance_type: "Preventive",
        notes: "",
        status: "completed"
      });
      await refreshQc();
      toast({ title: "Maintenance logged" });
    } catch (error) {
      handleError("Maintenance could not be saved", error);
    } finally {
      setSaving(null);
    }
  };

  if (!canAccess) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-950">Quality control access required</CardTitle>
          <CardDescription className="text-amber-900">
            QC is available to Admin, Lab Scientist, and HOD of Lab / Chief Scientist roles.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!facilityId) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="text-amber-950">Facility assignment required</CardTitle>
          <CardDescription className="text-amber-900">
            Complete the hospital setup before recording QC activity.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 p-6 text-white shadow-lg">
        <Badge className="bg-white/10 text-white hover:bg-white/10">Quality Control</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Controls, calibration, and analyzer maintenance
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">
          Keep a traceable QC record for reagent controls, analyzer checks, calibration due dates,
          and maintenance events before patient results are released.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryTile label="Active controls" value={qcSummary.activeControls} icon={FlaskConical} />
        <SummaryTile label="Recent QC runs" value={qcSummary.recentRuns} icon={Activity} />
        <SummaryTile label="Failed runs" value={qcSummary.failedRuns} icon={AlertTriangle} />
        <SummaryTile label="Active analyzers" value={qcSummary.activeAnalyzers} icon={Wrench} />
      </section>

      {qcQuery.isError ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-950">QC data could not load</CardTitle>
            <CardDescription className="text-red-900">
              {qcQuery.error instanceof Error ? qcQuery.error.message : "Please try again."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>QC controls</CardTitle>
            <CardDescription>Register control lots and expected ranges.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {canManage ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Control name">
                  <Input
                    value={controlForm.name}
                    onChange={(event) =>
                      setControlForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Normal control"
                  />
                </Field>
                <Field label="Lot number">
                  <Input
                    value={controlForm.lot_number}
                    onChange={(event) =>
                      setControlForm((current) => ({
                        ...current,
                        lot_number: event.target.value
                      }))
                    }
                    placeholder="LOT-2026-01"
                  />
                </Field>
                <Field label="Level">
                  <Input
                    value={controlForm.level}
                    onChange={(event) =>
                      setControlForm((current) => ({ ...current, level: event.target.value }))
                    }
                    placeholder="Normal / High / Low"
                  />
                </Field>
                <Field label="Expected value">
                  <Input
                    value={controlForm.expected_value}
                    onChange={(event) =>
                      setControlForm((current) => ({
                        ...current,
                        expected_value: event.target.value
                      }))
                    }
                    placeholder="12.5"
                  />
                </Field>
                <Field label="Minimum">
                  <Input
                    type="number"
                    value={controlForm.min_value}
                    onChange={(event) =>
                      setControlForm((current) => ({
                        ...current,
                        min_value: event.target.value
                      }))
                    }
                  />
                </Field>
                <Field label="Maximum">
                  <Input
                    type="number"
                    value={controlForm.max_value}
                    onChange={(event) =>
                      setControlForm((current) => ({
                        ...current,
                        max_value: event.target.value
                      }))
                    }
                  />
                </Field>
                <Field label="Unit">
                  <Input
                    value={controlForm.unit}
                    onChange={(event) =>
                      setControlForm((current) => ({ ...current, unit: event.target.value }))
                    }
                    placeholder="g/dL"
                  />
                </Field>
                <Field label="Expiry date">
                  <Input
                    type="date"
                    value={controlForm.expiry_date}
                    onChange={(event) =>
                      setControlForm((current) => ({
                        ...current,
                        expiry_date: event.target.value
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  className="md:col-span-2"
                  disabled={saving === "control"}
                  onClick={addControl}
                >
                  {saving === "control" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add QC control
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              {(qcQuery.data?.controls ?? []).slice(0, 8).map((control) => (
                <div key={control.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{control.name}</p>
                      <p className="text-sm text-slate-600">
                        Lot {control.lot_number || "N/A"} / {control.level || "No level"}
                      </p>
                    </div>
                    <Badge variant={control.is_active ? "secondary" : "outline"}>
                      {control.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Expected: {control.expected_value || "N/A"} {control.unit || ""} / Range:{" "}
                    {control.min_value ?? "-"} - {control.max_value ?? "-"} / Expiry:{" "}
                    {formatDate(control.expiry_date)}
                  </p>
                </div>
              ))}
              {qcQuery.isLoading ? <LoadingLine label="Loading QC controls..." /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>QC runs</CardTitle>
            <CardDescription>Record daily or batch control results before patient work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {canManage ? (
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Control">
                  <select
                    className={inputClass}
                    value={runForm.control_id}
                    onChange={(event) =>
                      setRunForm((current) => ({
                        ...current,
                        control_id: event.target.value
                      }))
                    }
                  >
                    <option value="">Select control</option>
                    {(qcQuery.data?.controls ?? []).map((control) => (
                      <option key={control.id} value={control.id}>
                        {control.name} {control.lot_number ? `(${control.lot_number})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Observed value">
                  <Input
                    value={runForm.value}
                    onChange={(event) =>
                      setRunForm((current) => ({ ...current, value: event.target.value }))
                    }
                    placeholder="12.4 or Positive"
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={runForm.status}
                    onChange={(event) =>
                      setRunForm((current) => ({
                        ...current,
                        status: event.target.value as QcRun["status"]
                      }))
                    }
                  >
                    <option value="review">Review</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </Field>
                <Field label="Notes">
                  <Input
                    value={runForm.notes}
                    onChange={(event) =>
                      setRunForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </Field>
                <Button
                  type="button"
                  className="md:col-span-4"
                  disabled={saving === "run"}
                  onClick={addRun}
                >
                  {saving === "run" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Record QC run
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              {(qcQuery.data?.runs ?? []).slice(0, 10).map((run) => (
                <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {run.qc_controls?.name ?? "QC control"}
                      </p>
                      <p className="text-sm text-slate-600">
                        {run.value_numeric ?? run.value_text ?? "No value"} /{" "}
                        {formatDate(run.performed_at)}
                      </p>
                    </div>
                    <Badge
                      className={run.status === "fail" ? "border-red-200 bg-red-50 text-red-700" : undefined}
                      variant={run.status === "pass" ? "secondary" : "outline"}
                    >
                      {run.status}
                    </Badge>
                  </div>
                  {run.notes ? <p className="mt-2 text-xs text-slate-500">{run.notes}</p> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>Analyzers</CardTitle>
            <CardDescription>Register instruments and their location.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {canManage ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Analyzer name">
                  <Input
                    value={analyzerForm.name}
                    onChange={(event) =>
                      setAnalyzerForm((current) => ({
                        ...current,
                        name: event.target.value
                      }))
                    }
                    placeholder="Mindray BC-20s"
                  />
                </Field>
                <Field label="Model">
                  <Input
                    value={analyzerForm.model}
                    onChange={(event) =>
                      setAnalyzerForm((current) => ({
                        ...current,
                        model: event.target.value
                      }))
                    }
                  />
                </Field>
                <Field label="Serial number">
                  <Input
                    value={analyzerForm.serial_number}
                    onChange={(event) =>
                      setAnalyzerForm((current) => ({
                        ...current,
                        serial_number: event.target.value
                      }))
                    }
                  />
                </Field>
                <Field label="Location">
                  <Input
                    value={analyzerForm.location}
                    onChange={(event) =>
                      setAnalyzerForm((current) => ({
                        ...current,
                        location: event.target.value
                      }))
                    }
                  />
                </Field>
                <Button
                  type="button"
                  className="md:col-span-2"
                  disabled={saving === "analyzer"}
                  onClick={addAnalyzer}
                >
                  {saving === "analyzer" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add analyzer
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              {(qcQuery.data?.analyzers ?? []).slice(0, 8).map((analyzer) => (
                <div key={analyzer.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-950">{analyzer.name}</p>
                  <p className="text-sm text-slate-600">
                    {analyzer.model || "No model"} / SN {analyzer.serial_number || "N/A"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {analyzer.location || "No location recorded"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>Calibration and maintenance</CardTitle>
            <CardDescription>Track analyzer readiness, due dates, and interventions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {canManage ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <EquipmentLogForm
                  analyzers={qcQuery.data?.analyzers ?? []}
                  buttonLabel="Log calibration"
                  dateLabel="Calibration date"
                  form={calibrationForm}
                  saving={saving === "calibration"}
                  statusOptions={["current", "due", "overdue"]}
                  onChange={setCalibrationForm}
                  onSubmit={addCalibration}
                />
                <EquipmentLogForm
                  analyzers={qcQuery.data?.analyzers ?? []}
                  buttonLabel="Log maintenance"
                  dateLabel="Maintenance date"
                  form={maintenanceForm}
                  saving={saving === "maintenance"}
                  statusOptions={["completed", "due", "overdue"]}
                  onChange={setMaintenanceForm}
                  onSubmit={addMaintenance}
                  showMaintenanceType
                />
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <RecentLogList
                title="Calibration"
                rows={(qcQuery.data?.calibrations ?? []).slice(0, 5).map((log) => ({
                  date: log.calibration_date,
                  id: log.id,
                  name: log.analyzers?.name ?? "Analyzer",
                  notes: log.notes,
                  status: log.status
                }))}
              />
              <RecentLogList
                title="Maintenance"
                rows={(qcQuery.data?.maintenance ?? []).slice(0, 5).map((log) => ({
                  date: log.maintenance_date,
                  id: log.id,
                  name: log.analyzers?.name ?? "Analyzer",
                  notes: log.notes,
                  status: log.status
                }))}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-blue-100 shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
        </div>
        <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin text-blue-700" />
      {label}
    </div>
  );
}

function EquipmentLogForm({
  analyzers,
  buttonLabel,
  dateLabel,
  form,
  onChange,
  onSubmit,
  saving,
  showMaintenanceType,
  statusOptions
}: {
  analyzers: Analyzer[];
  buttonLabel: string;
  dateLabel: string;
  form: EquipmentLogFormState;
  onChange: Dispatch<SetStateAction<EquipmentLogFormState>>;
  onSubmit: () => void;
  saving: boolean;
  showMaintenanceType?: boolean;
  statusOptions: string[];
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <Field label="Analyzer">
        <select
          className={inputClass}
          value={form.analyzer_id}
          onChange={(event) =>
            onChange((current: typeof form) => ({
              ...current,
              analyzer_id: event.target.value
            }))
          }
        >
          <option value="">Select analyzer</option>
          {analyzers.map((analyzer) => (
            <option key={analyzer.id} value={analyzer.id}>
              {analyzer.name}
            </option>
          ))}
        </select>
      </Field>
      {showMaintenanceType ? (
        <Field label="Maintenance type">
          <Input
            value={form.maintenance_type ?? ""}
            onChange={(event) =>
              onChange((current: typeof form) => ({
                ...current,
                maintenance_type: event.target.value
              }))
            }
          />
        </Field>
      ) : null}
      <Field label={dateLabel}>
        <Input
          type="date"
          value={form.date}
          onChange={(event) =>
            onChange((current: typeof form) => ({ ...current, date: event.target.value }))
          }
        />
      </Field>
      <Field label="Next due date">
        <Input
          type="date"
          value={form.due_date}
          onChange={(event) =>
            onChange((current: typeof form) => ({ ...current, due_date: event.target.value }))
          }
        />
      </Field>
      <Field label="Status">
        <select
          className={inputClass}
          value={form.status}
          onChange={(event) =>
            onChange((current: typeof form) => ({ ...current, status: event.target.value }))
          }
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <Textarea
          value={form.notes}
          onChange={(event) =>
            onChange((current: typeof form) => ({ ...current, notes: event.target.value }))
          }
        />
      </Field>
      <Button type="button" className="w-full" disabled={saving} onClick={onSubmit}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {buttonLabel}
      </Button>
    </div>
  );
}

function RecentLogList({
  rows,
  title
}: {
  rows: Array<{
    date: string;
    id: string;
    name: string;
    notes: string | null;
    status: string;
  }>;
  title: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-4 text-sm text-slate-600">
          No {title.toLowerCase()} log yet.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{row.name}</p>
                <p className="text-sm text-slate-600">{formatDate(row.date)}</p>
              </div>
              <Badge variant="outline">{row.status}</Badge>
            </div>
            {row.notes ? <p className="mt-2 text-xs text-slate-500">{row.notes}</p> : null}
          </div>
        ))
      )}
    </div>
  );
}
