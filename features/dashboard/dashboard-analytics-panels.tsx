"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { formatCurrency } from "@/features/dashboard/dashboard-utils";

type DashboardAnalyticsPanelsProps = {
  loading: boolean;
  paymentMethodBreakdown: Array<{ amount: number; method: string }>;
  revenueSummary: {
    billed: number;
    collected: number;
    outstanding: number;
    paidInvoices: number;
  };
  revenueTrend: Array<{ amount: number; label: string }>;
  tatStageMetrics: Array<{ averageHours: number; label: string; sampleCount: number }>;
  tatTrend: Array<{ averageHours: number; label: string; reports: number }>;
  topTests: Array<{ name: string; volume: number }>;
  volumeTrend: Array<{ label: string; routine: number; total: number; urgent: number }>;
};

const PAYMENT_COLORS = ["#1d4ed8", "#0f766e", "#38bdf8", "#f59e0b", "#475569"];
const CHART_GRID = "rgba(148, 163, 184, 0.18)";

function getNumericValue(
  value: number | string | readonly (number | string)[] | undefined
) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate === "number") {
    return candidate;
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ChartShell({
  actions,
  children,
  title
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-5 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}

export function DashboardAnalyticsPanels({
  loading,
  paymentMethodBreakdown,
  revenueSummary,
  revenueTrend,
  tatStageMetrics,
  tatTrend,
  topTests,
  volumeTrend
}: DashboardAnalyticsPanelsProps) {
  return (
    <>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartShell
          title="Turnaround Time"
          description="Average hours spent in key workflow stages and day-by-day reporting speed."
        >
          {loading ? (
            <EmptyChartState message="Loading turnaround analytics..." />
          ) : tatStageMetrics.every((metric) => metric.sampleCount === 0) ? (
            <EmptyChartState message="TAT metrics will appear once samples begin moving through the workflow." />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-4">
                {tatStageMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {metric.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">
                      {metric.averageHours.toFixed(1)}h
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {metric.sampleCount} completed sample(s)
                    </p>
                  </div>
                ))}
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tatStageMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => `${value}h`}
                    />
                    <Tooltip
                      formatter={(value) => [
                        `${getNumericValue(value).toFixed(1)} hrs`,
                        "Average TAT"
                      ]}
                    />
                    <Bar dataKey="averageHours" radius={[12, 12, 0, 0]} fill="#1d4ed8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartShell>

        <ChartShell
          title="Reporting trend"
          description="Daily average time to verified or reported completion over the last 14 days."
        >
          {loading ? (
            <EmptyChartState message="Loading reporting trend..." />
          ) : tatTrend.every((entry) => entry.reports === 0) ? (
            <EmptyChartState message="No completed reports in the last 14 days yet." />
          ) : (
            <div className="h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tatTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => `${value}h`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "averageHours"
                        ? [`${getNumericValue(value).toFixed(1)} hrs`, "Average TAT"]
                        : [getNumericValue(value), "Completed reports"]
                    }
                  />
                  <Legend />
                  <Bar
                    yAxisId="right"
                    dataKey="reports"
                    name="Completed reports"
                    radius={[10, 10, 0, 0]}
                    fill="#bfdbfe"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="averageHours"
                    name="Average TAT"
                    stroke="#0f766e"
                    strokeWidth={3}
                    dot={{ fill: "#0f766e", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartShell
          title="Test volume trends"
          description="Routine versus urgent/stat demand over the last 14 days."
        >
          {loading ? (
            <EmptyChartState message="Loading test volume trends..." />
          ) : volumeTrend.every((entry) => entry.total === 0) ? (
            <EmptyChartState message="No recent test volume to chart yet." />
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeTrend}>
                  <defs>
                    <linearGradient id="volumeTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="volumeUrgent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Total volume"
                    stroke="#1d4ed8"
                    fill="url(#volumeTotal)"
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="urgent"
                    name="Urgent/stat"
                    stroke="#f59e0b"
                    fill="url(#volumeUrgent)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell
          title="Most requested tests"
          description="Highest-volume assays in the current dashboard window."
        >
          {loading ? (
            <EmptyChartState message="Loading top requested tests..." />
          ) : topTests.length === 0 ? (
            <EmptyChartState message="Top requested tests will appear after orders are created." />
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTests} layout="vertical" margin={{ left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                  />
                  <Tooltip formatter={(value) => [getNumericValue(value), "Tests ordered"]} />
                  <Bar dataKey="volume" radius={[0, 12, 12, 0]} fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <ChartShell
          title="Revenue analytics"
          description="Collected payments and outstanding balance across the current reporting window."
          actions={
            <Badge variant="outline" className="border-emerald-200 text-emerald-700">
              {revenueSummary.paidInvoices} fully paid invoice(s)
            </Badge>
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Billed</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(revenueSummary.billed)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Collected</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(revenueSummary.collected)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Outstanding</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(revenueSummary.outstanding)}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-6">
              <EmptyChartState message="Loading revenue trend..." />
            </div>
          ) : revenueTrend.every((entry) => entry.amount === 0) ? (
            <div className="mt-6">
              <EmptyChartState message="No payments have been receipted in the last 14 days yet." />
            </div>
          ) : (
            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0f766e" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) =>
                      new Intl.NumberFormat("en-NG", {
                        notation: "compact",
                        maximumFractionDigits: 1
                      }).format(value)
                    }
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(getNumericValue(value)), "Collected"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    name="Collected"
                    stroke="#0f766e"
                    fill="url(#revenueFill)"
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartShell>

        <ChartShell
          title="Payment mix"
          description="How cash collection is distributed across payment methods."
        >
          {loading ? (
            <EmptyChartState message="Loading payment method mix..." />
          ) : paymentMethodBreakdown.length === 0 ? (
            <EmptyChartState message="Payment method breakdown will appear once receipts are posted." />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentMethodBreakdown}
                      dataKey="amount"
                      nameKey="method"
                      innerRadius={72}
                      outerRadius={108}
                      paddingAngle={3}
                    >
                      {paymentMethodBreakdown.map((entry, index) => (
                        <Cell
                          key={`${entry.method}-${entry.amount}`}
                          fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [formatCurrency(getNumericValue(value)), "Collected"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                {paymentMethodBreakdown.map((entry, index) => (
                  <div
                    key={entry.method}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }}
                      />
                      <span className="text-sm font-medium text-slate-900">{entry.method}</span>
                    </div>
                    <span className="text-sm text-slate-600">{formatCurrency(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartShell>
      </section>
    </>
  );
}
