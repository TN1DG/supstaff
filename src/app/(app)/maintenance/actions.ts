"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { assertStaff } from "@/lib/rbac";
import { requestContext } from "@/lib/audit";
import { fieldErrors } from "@/lib/forms";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES } from "@/lib/maintenance";
import { createReportInTx } from "@/lib/maintenance-sync";
import { isValidRoomNumber } from "@/lib/night-checks";

const reportSchema = z.object({
  title: z.string().trim().min(3, "Say briefly what's wrong").max(160),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  location: z.string().trim().min(1, "Where is it?").max(120),
  roomNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || isValidRoomNumber(Number(v)), "Pick a room from the list"),
  category: z.enum(MAINTENANCE_CATEGORIES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
});

export type ReportFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/** Any signed-in staff member — care staff and the housing officer — can log an issue. */
export async function createReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const staff = await assertStaff();
  const parsed = reportSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    location: formData.get("location") ?? "",
    // The room picker's "Not in a room" option posts "none".
    roomNumber: formData.get("roomNumber") === "none" ? "" : (formData.get("roomNumber") ?? ""),
    category: formData.get("category") ?? "other",
    priority: formData.get("priority") ?? "normal",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const ctx = await requestContext();

  try {
    await getDb().transaction((tx) =>
      createReportInTx(
        tx,
        {
          title: d.title,
          description: d.description || null,
          location: d.location,
          roomNumber: d.roomNumber ? Number(d.roomNumber) : null,
          category: d.category,
          priority: d.priority,
        },
        staff,
        ctx,
      ),
    );
  } catch {
    return { error: "Could not save the report. Please try again." };
  }

  revalidatePath("/maintenance");
  revalidatePath("/building");
  return { ok: true };
}
