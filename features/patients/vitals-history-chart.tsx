"use client";

import { Activity, HeartPulse } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VitalSign } from "@/types/hospital";

function chartDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function VitalsHistoryChart({ vitals }: { vitals: VitalSign[] }) {
  const { resolvedTheme } = useTheme();
  const data = [...vitals].reverse().map((vital) => ({
    date: chartDate(vital.measured_at),
    diastolic: vital.diastolic_bp,
    oxygen: vital.oxygen_saturation,
    pulse: vital.pulse_bpm,
    systolic: vital.systolic_bp,
    temperature: vital.temperature_c
  }));
  const textColor = resolvedTheme === "dark" ? "#cbd5e1" : "#475569";
  const gridColor = resolvedTheme === "dark" ? "#334155" : "#e2e8f0";
  const tooltipStyle = {
    backgroundColor: resolvedTheme === "dark" ? "#0f172a" : "#ffffff",
    border: `1px solid ${gridColor}`,
    borderRadius: "12px",
    color: resolvedTheme === "dark" ? "#f8fafc" : "#0f172a"
  };

  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-rose-600" />Vitals history</CardTitle></CardHeader><CardContent>{data.length ? <div className="h-[320px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -18 }}><CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" stroke={textColor} tick={{ fill: textColor, fontSize: 11 }} minTickGap={26} /><YAxis yAxisId="main" domain={[0, "auto"]} stroke={textColor} tick={{ fill: textColor, fontSize: 11 }} /><YAxis yAxisId="temperature" orientation="right" domain={[30, 43]} stroke={textColor} tick={{ fill: textColor, fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: textColor }} /><Legend wrapperStyle={{ color: textColor, fontSize: 12 }} /><Line yAxisId="main" type="monotone" dataKey="systolic" name="Systolic BP" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls /><Line yAxisId="main" type="monotone" dataKey="diastolic" name="Diastolic BP" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} connectNulls /><Line yAxisId="main" type="monotone" dataKey="pulse" name="Pulse" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} connectNulls /><Line yAxisId="main" type="monotone" dataKey="oxygen" name="SpO₂" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} connectNulls /><Line yAxisId="temperature" type="monotone" dataKey="temperature" name="Temperature" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} connectNulls /></LineChart></ResponsiveContainer></div> : <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center text-sm text-slate-500"><Activity className="mb-2 h-5 w-5" />No vital signs recorded.</div>}</CardContent></Card>;
}
