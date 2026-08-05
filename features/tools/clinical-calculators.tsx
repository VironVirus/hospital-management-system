"use client";

import { useMemo, useState } from "react";
import { Activity, CalendarDays, Calculator, HeartPulse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function ResultBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 dark:border-teal-900 dark:bg-teal-950/40"><p className="text-xs font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">{label}</p><p className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{value}</p></div>;
}

export function ClinicalCalculators() {
  const [lastPeriod, setLastPeriod] = useState("");
  const [cycleLength, setCycleLength] = useState("28");
  const [periodLength, setPeriodLength] = useState("5");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");

  const cycle = useMemo(() => {
    const start = parseDate(lastPeriod);
    const days = Number(cycleLength);
    const bleedingDays = Number(periodLength);
    if (!start || !Number.isFinite(days) || days < 21 || days > 45 || !Number.isFinite(bleedingDays) || bleedingDays < 1 || bleedingDays > 10) return null;
    const nextPeriod = addDays(start, days);
    const ovulation = addDays(nextPeriod, -14);
    return {
      fertileEnd: formatDate(addDays(ovulation, 1)),
      fertileStart: formatDate(addDays(ovulation, -5)),
      nextPeriod: formatDate(nextPeriod),
      periodEnd: formatDate(addDays(nextPeriod, bleedingDays - 1)),
      ovulation: formatDate(ovulation)
    };
  }, [cycleLength, lastPeriod, periodLength]);

  const bmi = useMemo(() => {
    const heightCm = Number(height);
    const weightKg = Number(weight);
    if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250 || !Number.isFinite(weightKg) || weightKg < 10 || weightKg > 500) return null;
    const heightM = heightCm / 100;
    const value = weightKg / (heightM * heightM);
    const category = value < 18.5 ? "Underweight" : value < 25 ? "Healthy range" : value < 30 ? "Overweight" : "Obesity range";
    return {
      category,
      healthyWeight: `${(18.5 * heightM * heightM).toFixed(1)}–${(24.9 * heightM * heightM).toFixed(1)} kg`,
      value: value.toFixed(1)
    };
  }, [height, weight]);

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-3 text-2xl font-semibold text-slate-950 dark:text-slate-50"><Calculator className="h-6 w-6 text-teal-700 dark:text-teal-300" />Tools</h1></div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-rose-600" />Menstrual and ovulation calculator</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3"><Label htmlFor="last-period">First day of last period</Label><Input id="last-period" className="mt-1" type="date" value={lastPeriod} onChange={(event) => setLastPeriod(event.target.value)} /></div>
            <div><Label htmlFor="cycle-length">Cycle length</Label><Input id="cycle-length" className="mt-1" type="number" min="21" max="45" value={cycleLength} onChange={(event) => setCycleLength(event.target.value)} /></div>
            <div><Label htmlFor="period-length">Period length</Label><Input id="period-length" className="mt-1" type="number" min="1" max="10" value={periodLength} onChange={(event) => setPeriodLength(event.target.value)} /></div>
          </div>
          {cycle ? <div className="grid gap-3 sm:grid-cols-2"><ResultBox label="Next period" value={`${cycle.nextPeriod} – ${cycle.periodEnd}`} /><ResultBox label="Estimated ovulation" value={cycle.ovulation} /><div className="sm:col-span-2"><ResultBox label="Estimated fertile window" value={`${cycle.fertileStart} – ${cycle.fertileEnd}`} /></div></div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Enter the cycle details.</div>}
          <p className="text-xs text-slate-500">Cycle dates are estimates and should not be used as contraception.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5 text-teal-700" />BMI calculator</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="bmi-height">Height (cm)</Label><Input id="bmi-height" className="mt-1" type="number" min="80" max="250" step="0.1" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="170" /></div><div><Label htmlFor="bmi-weight">Weight (kg)</Label><Input id="bmi-weight" className="mt-1" type="number" min="10" max="500" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="70" /></div></div>
          {bmi ? <div className="grid gap-3 sm:grid-cols-2"><ResultBox label="BMI" value={bmi.value} /><ResultBox label="Category" value={bmi.category} /><div className="sm:col-span-2"><ResultBox label="Healthy weight for this height" value={bmi.healthyWeight} /></div></div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500"><Activity className="mx-auto mb-2 h-5 w-5" />Enter height and weight.</div>}
          <p className="text-xs text-slate-500">Adult BMI screening only.</p>
        </CardContent>
      </Card>
    </div>
  </div>;
}
