import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const HospitalOverview = dynamic(
  () => import("@/features/hospital/hospital-overview").then((module) => module.HospitalOverview),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function HospitalPage() {
  return <HospitalOverview />;
}
