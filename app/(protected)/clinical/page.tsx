import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const ClinicalWorkspace = dynamic(
  () => import("@/features/clinical/clinical-workspace").then((module) => module.ClinicalWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function ClinicalPage() {
  return <ClinicalWorkspace />;
}
