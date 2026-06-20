import { FacilityDetailsPanel } from "@/features/admin/facility-details-panel";

export default async function AdminFacilityDetailsPage({
  params
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;

  return <FacilityDetailsPanel facilityRecordId={facilityId} />;
}
