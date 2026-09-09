import { guardRoute } from "@/lib/rbac";
import { rateLimitHit } from "@/lib/rate-limit";
import { buildHandoverPayload, shiftLabel } from "@/lib/handover-payload";
import { renderHandoverPdf } from "@/lib/handover-pdf";

export const dynamic = "force-dynamic";

// PDF rendering is CPU-heavy — cap how often one person can trigger it.
const PDF_LIMIT = { limit: 20, windowSec: 60 };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const { id } = await params;
  let payload;
  try {
    payload = await buildHandoverPayload(id, staff.siteId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await renderHandoverPdf(payload);
  const filename = `handover-${payload.date}-${shiftLabel(payload.shift).toLowerCase()}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
