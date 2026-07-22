import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const HospitalBillingWorkspace = dynamic(
  () => import("@/features/hospital-billing/hospital-billing-workspace").then((module) => module.HospitalBillingWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function HospitalBillingPage() {
  return <HospitalBillingWorkspace />;
}
