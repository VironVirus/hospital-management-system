import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/workspace-skeleton";

const WardsWorkspace = dynamic(
  () => import("@/features/wards/wards-workspace").then((module) => module.WardsWorkspace),
  { loading: () => <WorkspaceSkeleton /> }
);

export default function WardsPage() {
  return <WardsWorkspace />;
}
