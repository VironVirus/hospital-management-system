"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSampleStatus, type SampleStatus } from "@/features/orders/constants";
import { commitOnlineMutation, generateId } from "@/lib/online-core";
import type { Tables } from "@/types/database";

type SampleLabel = {
  barcode_value: string;
  order_number: string;
  order_test_id: string;
  patient_name: string;
  qr_value: string;
  sample_code: string;
  sample_status: SampleStatus;
  test_name: string;
};

function BarcodePreview({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    let active = true;

    void import("jsbarcode").then(({ default: JsBarcode }) => {
      if (!ref.current || !active) {
        return;
      }

      JsBarcode(ref.current, value, {
        format: "CODE128",
        displayValue: false,
        height: 38,
        margin: 0,
        width: 1.5
      });
    });

    return () => {
      active = false;
    };
  }, [value]);

  return <svg ref={ref} className="h-12 w-full" aria-label={`Barcode ${value}`} />;
}

function QrPreview({ value }: { value: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;

    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 96
        })
      )
      .then((result: string) => {
        if (active) {
          setSrc(result);
        }
      })
      .catch(() => {
        if (active) {
          setSrc("");
        }
      });

    return () => {
      active = false;
    };
  }, [value]);

  if (!src) {
    return <div className="h-24 w-24 rounded-lg bg-slate-100" aria-hidden="true" />;
  }

  return (
    <Image
      src={src}
      alt={`QR for ${value}`}
      className="h-24 w-24 rounded-lg"
      height={96}
      unoptimized
      width={96}
    />
  );
}

export function SampleLabelSheet({
  orderNumber,
  patientName,
  samples
}: {
  orderNumber: string;
  patientName: string;
  samples: SampleLabel[];
}) {
  const [printing, setPrinting] = useState(false);
  const { user } = useAuth();

  const handlePrint = async () => {
    setPrinting(true);

    await Promise.all(
      samples.map((sample) => {
        const logId = generateId();

        return commitOnlineMutation({
          action: "insert",
          entity: "sample_custody_logs",
          payload: {
            action: "label_printed",
            actor_id: user?.id ?? null,
            created_at: new Date().toISOString(),
            from_status: sample.sample_status,
            id: logId,
            notes: "Printed from order workspace.",
            order_test_id: sample.order_test_id,
            to_status: sample.sample_status
          } satisfies Tables<"sample_custody_logs">,
          recordId: logId
        });
      })
    );

    window.print();
    window.setTimeout(() => setPrinting(false), 400);
  };

  return (
    <Card className="border-blue-100">
      <CardHeader className="print-hidden flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Sample labels</CardTitle>
          <p className="mt-1 text-sm text-slate-600">
            Print-ready barcode and QR labels for order {orderNumber}.
          </p>
        </div>
        <Button type="button" onClick={handlePrint} disabled={printing}>
          <Printer className="h-4 w-4" />
          {printing ? "Preparing print..." : "Print sample labels"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {samples.map((sample) => (
            <div
              key={sample.order_test_id}
              className="print-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                    {sample.sample_code}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">
                    {sample.test_name}
                  </h3>
                  <p className="text-sm text-slate-600">{patientName}</p>
                </div>
                <QrPreview value={sample.qr_value} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <BarcodePreview value={sample.barcode_value} />
                <p className="mt-2 text-center text-xs font-medium tracking-[0.18em] text-slate-600">
                  {sample.barcode_value}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <span>Order {sample.order_number}</span>
                <span>{formatSampleStatus(sample.sample_status)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
