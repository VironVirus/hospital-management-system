import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const HospitalBillingWorkspace = dynamic(
  () => import("@/features/hospital-billing/hospital-billing-workspace").then((mod) => mod.HospitalBillingWorkspace),
  {
    loading: () => <WorkspaceSkeleton />
  }
);

export default function BillingPage() {
  return <HospitalBillingWorkspace />;
}
