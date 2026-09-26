import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for a route segment while its server components resolve. Shaped
 * like the real pages (header, then a stack of cards or rows) so the layout
 * doesn't jump when the content arrives.
 */
export function PageSkeleton({
  rows = 4,
  withHeaderAction = false,
}: {
  rows?: number;
  withHeaderAction?: boolean;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        {withHeaderAction ? <Skeleton className="h-9 w-32" /> : null}
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
