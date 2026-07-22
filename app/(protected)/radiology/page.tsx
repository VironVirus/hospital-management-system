import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const RadiologyWorkspace = dynamic(
  () => import("@/features/radiology/radiology-workspace").then((module) => module.RadiologyWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function RadiologyPage() {
  return <RadiologyWorkspace />;
}
