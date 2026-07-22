import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Activity, Cloud, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Connected hospital management for Nigerian healthcare
          </div>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
              One complete hospital record for every patient.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              St Gianna Specialist Hospital connects registration, clinical encounters, wards,
              vital signs, diagnosis, pharmacy, laboratory, billing, accounts,
              and stores under each patient&apos;s permanent Hospital ID.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">Open secure workspace</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/hospital">View hospital workspace</Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Hostinger MySQL", "Hospital records and secure staff sessions"],
              ["Next.js", "One application for every department"],
              ["Hostinger", "Standalone Node.js deployment"]
            ].map(([title, description]) => (
              <Card key={title} className="bg-white/80 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Card className="overflow-hidden border-blue-100 bg-white/90 shadow-xl shadow-blue-100/70 backdrop-blur">
          <CardHeader className="bg-gradient-to-br from-blue-600 to-sky-500 text-white">
            <Badge className="w-fit bg-white/15 text-white hover:bg-white/20">
              St Gianna Specialist Hospital
            </Badge>
            <CardTitle className="text-2xl text-white">
              Ready for hospital and clinic workflows.
            </CardTitle>
            <CardDescription className="text-blue-50">
              The workspace is organized for longitudinal patient care from
              first presentation through discharge and follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4">
              <Cloud className="mt-0.5 h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-slate-900">Online reliability</p>
                <p className="text-sm text-slate-600">
                  Server-side MySQL updates keep departmental worklists consistent.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Activity className="mt-0.5 h-5 w-5 text-sky-600" />
              <div>
                <p className="font-medium text-slate-900">Operational visibility</p>
                <p className="text-sm text-slate-600">
                  Placeholders are set up for patients, test catalog, and results.
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-slate-500">Authentication</p>
                <p className="mt-1 font-semibold text-slate-900">Admin-created accounts</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-slate-500">Hosting</p>
                <p className="mt-1 font-semibold text-slate-900">Hostinger-ready</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
