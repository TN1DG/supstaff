import { guardRoute } from "@/lib/rbac";
import { rateLimitHit } from "@/lib/rate-limit";
import { isoDate } from "@/lib/medication";
import { buildMarPayload } from "@/lib/medication-payload";
import { renderMarPdf } from "@/lib/medication-pdf";

export const dynamic = "force-dynamic";

const PDF_LIMIT = { limit: 20, windowSec: 60 };

/** Monday on-or-before the given date. */
function startOfWeek(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ residentId: string }> },
) {
  const staff = await guardRoute();
  if (staff instanceof Response) return staff;

  const throttled = await rateLimitHit(`pdf:${staff.id}`, PDF_LIMIT);
  if (!throttled.ok) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(throttled.retryAfterSec) },
    });
  }

  const { residentId } = await params;
  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week");
  const weekStart = startOfWeek(weekParam || isoDate(new Date()));

  let payload;
  try {
    payload = await buildMarPayload(residentId, staff.siteId, weekStart);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await renderMarPdf(payload);
  const filename = `mar-${payload.resident.name.replace(/\s+/g, "-").toLowerCase()}-${payload.weekStart}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
