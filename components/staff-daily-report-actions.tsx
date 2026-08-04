"use client";

import { useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildHospitalActivityHtml, type HospitalActivityReport } from "@/features/admin/hospital-activity-report";
import { useToast } from "@/hooks/use-toast";
import { printHtmlDocument } from "@/lib/print";
import { cn } from "@/lib/utils";

async function fetchDailyReport() {
  const response = await fetch("/api/staff/daily-report", { cache: "no-store" });
  const payload = await response.json().catch(() => null) as HospitalActivityReport | { error?: string } | null;
  if (!response.ok || !payload || "error" in payload) {
    throw new Error(payload && "error" in payload ? payload.error || "Report unavailable." : "Report unavailable.");
  }
  return payload as HospitalActivityReport;
}

export function StaffDailyReportActions({ className, labels = true }: { className?: string; labels?: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"print" | "download" | null>(null);

  const run = async (action: "print" | "download") => {
    try {
      setBusy(action);
      const report = await fetchDailyReport();
      if (action === "print") {
        printHtmlDocument(buildHospitalActivityHtml(report));
        return;
      }
      const [{ pdf }, { HospitalActivityReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/admin/hospital-activity-report-pdf")
      ]);
      const blob = await pdf(<HospitalActivityReportDocument report={report} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `daily-activity-${report.from}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Daily report downloaded", variant: "success" });
    } catch (error) {
      toast({ title: "Daily report unavailable", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  return <div className={cn("flex gap-2", className)}><Button type="button" variant="outline" size={labels ? "default" : "icon"} className={labels ? "flex-1" : undefined} disabled={busy !== null} aria-label="Print daily report" onClick={() => void run("print")}>{busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}{labels ? "Print daily report" : null}</Button><Button type="button" variant="outline" size={labels ? "default" : "icon"} disabled={busy !== null} aria-label="Download daily report" onClick={() => void run("download")}>{busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{labels ? <span className="sr-only">Download daily report</span> : null}</Button></div>;
}
