import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { wakingNightShifts } from "@/db/schema";
import { bySite } from "@/lib/db-scope";

/** Every screen that shows tonight's shift, rounds or its handover lines. */
export function revalidateShift() {
  revalidatePath("/waking-night");
  revalidatePath("/night-checks");
  revalidatePath("/handovers", "layout");
  revalidatePath("/");
}

/** The site's shift, or the error a waking-night action should return. */
export async function loadOpenShift(
  shiftId: string,
  siteId: string,
): Promise<{ shift: { id: string; shiftDate: string } } | { error: string }> {
  const shift = await getDb().query.wakingNightShifts.findFirst({
    where: bySite(wakingNightShifts, shiftId, siteId),
    columns: { id: true, status: true, shiftDate: true },
  });
  if (!shift) return { error: "Shift not found." };
  if (shift.status !== "open") return { error: "This shift has been signed off." };
  return { shift };
}
