"use client";

import { useState } from "react";
import { Download, FileArchive, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { canAccessAdministrationRole } from "@/lib/guards";

function getFilenameFromHeader(contentDisposition: string | null, fallback: string) {
  const match = contentDisposition?.match(/filename=\"?([^"]+)\"?/i);
  return match?.[1] || fallback;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function PlatformBackupPanel() {
  const { accessState, facilityName, role } = useAuth();
  const { toast } = useToast();
  const [exportingFormat, setExportingFormat] = useState<"json" | "excel" | "pdf" | null>(null);
  const canAccessAdministration = canAccessAdministrationRole(role);

  if (!canAccessAdministration) {
    return null;
  }

  const handleExport = async (format: "json" | "excel" | "pdf") => {
    try {
      setExportingFormat(format);
      const response = await fetch(`/api/admin/backup?format=${format}`, {
        method: "GET"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Backup export could not be generated.");
      }

      const blob = await response.blob();
      const fallbackFilename =
        format === "json"
          ? "tapxora-lims-backup.json"
          : format === "excel"
            ? "tapxora-lims-backup.xls"
            : "tapxora-lims-backup-summary.pdf";

      downloadBlob(
        blob,
        getFilenameFromHeader(response.headers.get("content-disposition"), fallbackFilename)
      );

      toast({
        title: "Backup export ready",
        description:
          format === "json"
            ? "Structured JSON backup downloaded for restore workflows."
            : format === "excel"
              ? "Detailed Excel backup workbook downloaded."
              : "Backup summary PDF downloaded.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Backup export failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error"
      });
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-blue-700" />
              Backup and export
            </CardTitle>
            <CardDescription>
              Download the full scoped database for this admin view, including patients,
              tests, results, billing, accounts, inventory, and audit records.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {role === "SuperAdmin"
              ? "Super Admin scope"
              : facilityName
                ? `${facilityName} and child branches`
                : "Current facility scope"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-700">
          The Excel export is meant for human review, the JSON export is the structured backup
          that can be used for restore workflows, and the PDF gives a quick audit-friendly
          summary of what was exported.
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Button type="button" disabled={Boolean(exportingFormat)} onClick={() => handleExport("excel")}>
            {exportingFormat === "excel" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export Excel backup
          </Button>

          <Button type="button" variant="outline" disabled={Boolean(exportingFormat)} onClick={() => handleExport("json")}>
            {exportingFormat === "json" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export JSON backup
          </Button>

          <Button type="button" variant="outline" disabled={Boolean(exportingFormat)} onClick={() => handleExport("pdf")}>
            {exportingFormat === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export PDF summary
          </Button>
        </div>

        {accessState && accessState !== "active" ? (
          <p className="text-xs text-amber-700">
            Export is available only while the admin account and facility are active.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
