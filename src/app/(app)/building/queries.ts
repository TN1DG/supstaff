import { and, asc, count, desc, eq, gte, ilike, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  maintenanceReports,
  nightCheckItemResults,
  nightCheckRounds,
  nightCheckTemplateItems,
  staff,
  type MaintenanceCategoryValue,
  type MaintenancePriorityValue,
  type MaintenanceStatusValue,
} from "@/db/schema";
import { isoDate } from "@/lib/night-checks";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
} from "@/lib/maintenance";

export type ReportFilters = {
  from: string;
  to: string;
  status?: MaintenanceStatusValue | "unresolved";
  priority?: MaintenancePriorityValue;
  category?: MaintenanceCategoryValue;
  q?: string;
};

/** `[from 00:00, day after to 00:00)` in server-local time, matching how dates are shown. */
function instantRange(from: string, to: string): [Date, Date] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function reportsInRange(siteId: string, f: ReportFilters) {
  const [start, end] = instantRange(f.from, f.to);
  const q = f.q?.trim();

  return getDb().query.maintenanceReports.findMany({
    where: and(
      eq(maintenanceReports.siteId, siteId),
      gte(maintenanceReports.createdAt, start),
      lt(maintenanceReports.createdAt, end),
      f.status === "unresolved"
        ? ne(maintenanceReports.status, "resolved")
        : f.status
          ? eq(maintenanceReports.status, f.status)
          : undefined,
      f.priority ? eq(maintenanceReports.priority, f.priority) : undefined,
      f.category ? eq(maintenanceReports.category, f.category) : undefined,
      q
        ? or(
            ilike(maintenanceReports.title, `%${escapeLike(q)}%`),
            ilike(maintenanceReports.location, `%${escapeLike(q)}%`),
            ilike(maintenanceReports.assignedTo, `%${escapeLike(q)}%`),
          )
        : undefined,
    ),
    with: { reportedBy: { columns: { name: true } } },
    orderBy: [desc(maintenanceReports.createdAt)],
    limit: 500,
  });
}

export type BuildingKpis = {
  open: number;
  highOrUrgentOpen: number;
  oldestOpenDays: number | null;
  createdInRange: number;
  resolvedInRange: number;
  avgDaysToResolve: number | null;
};

/**
 * "Open" figures are the live backlog (not range-limited) — the housing
 * officer's first question is always "what's outstanding right now". The
 * created/resolved figures follow the filter range.
 */
export async function reportKpis(siteId: string, from: string, to: string): Promise<BuildingKpis> {
  const [start, end] = instantRange(from, to);
  const db = getDb();
  const unresolved = and(
    eq(maintenanceReports.siteId, siteId),
    ne(maintenanceReports.status, "resolved"),
  );

  const [[backlog], [created], [resolved]] = await Promise.all([
    db
      .select({
        open: count(),
        highOrUrgent: count(
          sql`case when ${maintenanceReports.priority} in ('high', 'urgent') then 1 end`,
        ),
        oldest: sql<Date | null>`min(${maintenanceReports.createdAt})`,
      })
      .from(maintenanceReports)
      .where(unresolved),
    db
      .select({ n: count() })
      .from(maintenanceReports)
      .where(
        and(
          eq(maintenanceReports.siteId, siteId),
          gte(maintenanceReports.createdAt, start),
          lt(maintenanceReports.createdAt, end),
        ),
      ),
    db
      .select({
        n: count(),
        avgDays: sql<string | null>`avg(extract(epoch from (${maintenanceReports.resolvedAt} - ${maintenanceReports.createdAt})) / 86400)`,
      })
      .from(maintenanceReports)
      .where(
        and(
          eq(maintenanceReports.siteId, siteId),
          gte(maintenanceReports.resolvedAt, start),
          lt(maintenanceReports.resolvedAt, end),
        ),
      ),
  ]);

  const oldest = backlog.oldest ? new Date(backlog.oldest) : null;
  return {
    open: backlog.open,
    highOrUrgentOpen: backlog.highOrUrgent,
    oldestOpenDays: oldest ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000) : null,
    createdInRange: created.n,
    resolvedInRange: resolved.n,
    avgDaysToResolve: resolved.avgDays == null ? null : Number(resolved.avgDays),
  };
}

/** Reports created in range, per category, with how many are still unresolved. */
export async function categoryBreakdown(siteId: string, from: string, to: string) {
  const [start, end] = instantRange(from, to);
  return getDb()
    .select({
      category: maintenanceReports.category,
      total: count(),
      unresolved: count(sql`case when ${maintenanceReports.status} <> 'resolved' then 1 end`),
    })
    .from(maintenanceReports)
    .where(
      and(
        eq(maintenanceReports.siteId, siteId),
        gte(maintenanceReports.createdAt, start),
        lt(maintenanceReports.createdAt, end),
      ),
    )
    .groupBy(maintenanceReports.category)
    .orderBy(desc(count()));
}

/**
 * Every "Needs attention" on a simple (building) night-check item in range —
 * never the resident-welfare drill-down, which carries resident data the
 * housing officer doesn't see. Left-joined to any report already raised from it.
 */
export async function nightCheckFindings(
  siteId: string,
  from: string,
  to: string,
  opts: { unraisedOnly?: boolean } = {},
) {
  return getDb()
    .select({
      id: nightCheckItemResults.id,
      checkDate: nightCheckRounds.checkDate,
      roundTime: nightCheckRounds.roundTime,
      area: nightCheckTemplateItems.area,
      description: nightCheckTemplateItems.description,
      note: nightCheckItemResults.note,
      recordedAt: nightCheckItemResults.updatedAt,
      staffName: staff.name,
      reportId: maintenanceReports.id,
      reportStatus: maintenanceReports.status,
    })
    .from(nightCheckItemResults)
    .innerJoin(nightCheckRounds, eq(nightCheckItemResults.roundId, nightCheckRounds.id))
    .innerJoin(
      nightCheckTemplateItems,
      eq(nightCheckItemResults.templateItemId, nightCheckTemplateItems.id),
    )
    .leftJoin(staff, eq(nightCheckRounds.staffId, staff.id))
    .leftJoin(
      maintenanceReports,
      eq(maintenanceReports.sourceItemResultId, nightCheckItemResults.id),
    )
    .where(
      and(
        eq(nightCheckRounds.siteId, siteId),
        gte(nightCheckRounds.checkDate, from),
        lte(nightCheckRounds.checkDate, to),
        eq(nightCheckItemResults.status, "attention"),
        eq(nightCheckTemplateItems.kind, "simple"),
        opts.unraisedOnly ? isNull(maintenanceReports.id) : undefined,
      ),
    )
    .orderBy(desc(nightCheckRounds.checkDate), asc(nightCheckRounds.roundTime))
    .limit(200);
}

/** One finding, site-scoped, for the "Raise report" action. */
export async function findingForSite(siteId: string, itemResultId: string) {
  const [row] = await getDb()
    .select({
      id: nightCheckItemResults.id,
      status: nightCheckItemResults.status,
      kind: nightCheckTemplateItems.kind,
      area: nightCheckTemplateItems.area,
      description: nightCheckTemplateItems.description,
      note: nightCheckItemResults.note,
      checkDate: nightCheckRounds.checkDate,
      roundTime: nightCheckRounds.roundTime,
    })
    .from(nightCheckItemResults)
    .innerJoin(nightCheckRounds, eq(nightCheckItemResults.roundId, nightCheckRounds.id))
    .innerJoin(
      nightCheckTemplateItems,
      eq(nightCheckItemResults.templateItemId, nightCheckTemplateItems.id),
    )
    .where(
      and(eq(nightCheckItemResults.id, itemResultId), eq(nightCheckRounds.siteId, siteId)),
    );
  return row ?? null;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Parse the GET filter form. Anything unrecognised falls back to "no filter". */
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): ReportFilters {
  const from = typeof sp.from === "string" && DATE_RE.test(sp.from) ? sp.from : daysAgo(30);
  const to = typeof sp.to === "string" && DATE_RE.test(sp.to) ? sp.to : isoDate(new Date());
  return {
    from,
    to,
    status: pick(sp.status, [...MAINTENANCE_STATUSES, "unresolved"] as const),
    priority: pick(sp.priority, MAINTENANCE_PRIORITIES),
    category: pick(sp.category, MAINTENANCE_CATEGORIES),
    q: typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined,
  };
}
