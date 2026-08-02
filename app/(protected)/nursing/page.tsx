import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const NursingWorkspace = dynamic(
  () => import("@/features/nursing/nursing-workspace").then((module) => module.NursingWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function NursingPage() {
  return <NursingWorkspace />;
}
