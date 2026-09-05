import { ClassroomRentalsPageClient } from "@/components/classroom-rentals/classroom-rentals-page-client";
import { requireModule } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ClassroomRentalsPage() {
  await requireModule("leads");
  return <ClassroomRentalsPageClient />;
}
