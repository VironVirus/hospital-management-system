"use client";

import { useState } from "react";
import { CalendarDays, Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { buildHospitalActivityHtml, type HospitalActivityReport } from "@/features/admin/hospital-activity-report";
import { printHtmlDocument } from "@/lib/print";

function lagosDateInput() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function fetchHospitalActivityReport(from: string, to: string) {
  const response = await fetch(`/api/admin/hospital-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null) as HospitalActivityReport | { error?: string } | null;
  if (!response.ok || !payload || "error" in payload) throw new Error(payload && "error" in payload ? payload.error || "Report unavailable." : "Report unavailable.");
  return payload as HospitalActivityReport;
}

export function HospitalActivityReportPanel() {
  const today = lagosDateInput();
  const { toast } = useToast();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<HospitalActivityReport | null>(null);
  const [busy, setBusy] = useState<"view" | "print" | "download" | null>(null);

  const load = async (action: "view" | "print" | "download", rangeFrom = from, rangeTo = to) => {
    try {
      setBusy(action);
      const nextReport = await fetchHospitalActivityReport(rangeFrom, rangeTo);
      setReport(nextReport);
      if (action === "print") printHtmlDocument(buildHospitalActivityHtml(nextReport));
      if (action === "download") {
        const [{ pdf }, { HospitalActivityReportDocument }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("@/features/admin/hospital-activity-report-pdf")
        ]);
        const blob = await pdf(<HospitalActivityReportDocument report={nextReport} />).toBlob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `hospital-report-${rangeFrom}-to-${rangeTo}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast({ title: "Hospital report downloaded", variant: "success" });
      }
    } catch (error) {
      toast({ title: "Hospital report not available", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  return <Card className="border-blue-100"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-700" />Hospital activity report</CardTitle><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setFrom(today); setTo(today); void load("view", today, today); }}>Today&apos;s report</Button></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end"><div><Label htmlFor="hospital-report-from">From</Label><Input id="hospital-report-from" className="mt-1" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></div><div><Label htmlFor="hospital-report-to">To</Label><Input id="hospital-report-to" className="mt-1" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></div><Button variant="outline" disabled={busy !== null || !from || !to} onClick={() => void load("view")}>{busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}View</Button><Button variant="outline" disabled={busy !== null || !from || !to} onClick={() => void load("print")}>{busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print</Button><Button disabled={busy !== null || !from || !to} onClick={() => void load("download")}>{busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</Button></div>{report ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{report.summary.map((item) => <div key={item.label} className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="truncate text-xs text-slate-600">{item.label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{item.value}</p></div>)}</div> : null}</CardContent></Card>;
}
