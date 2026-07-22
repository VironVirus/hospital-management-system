import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const PharmacyWorkspace = dynamic(
  () => import("@/features/pharmacy/pharmacy-workspace").then((module) => module.PharmacyWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function PharmacyPage() {
  return <PharmacyWorkspace />;
}
