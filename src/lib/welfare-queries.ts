import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { getDb, type DbOrTx } from "@/db";
import {
  residents,
  residentWelfarePlans,
  sites,
  staff,
  welfareAbsences,
  welfareContacts,
  welfareEscalationActions,
  welfareEscalations,
  welfarePolicyVersions,
} from "@/db/schema";
import { parsePolicyConfig } from "@/lib/welfare-policy";
import type { FactsAction, FactsContact, FactsVersion, WelfareFacts } from "@/lib/welfare-snapshot";

/** The site's IANA time zone — every welfare time is shown and typed in it. */
export const siteTimeZone = cache(async (siteId: string): Promise<string> => {
  const site = await getDb().query.sites.findFirst({
    where: eq(sites.id, siteId),
    columns: { timezone: true },
  });
  return site?.timezone || "Europe/London";
});

/** Manager, or the support officer the manager named as welfare rules deputy. */
export async function canEditWelfareRules(person: {
  id: string;
  role: string;
}): Promise<boolean> {
  if (person.role === "manager") return true;
  if (person.role !== "support_officer") return false;
  const row = await getDb().query.staff.findFirst({
    where: and(eq(staff.id, person.id), eq(staff.active, true)),
    columns: { welfareRulesDeputy: true },
  });
  return row?.welfareRulesDeputy ?? false;
}

function toVersion(row: {
  id: string;
  version: number;
  config: unknown;
  changeNote: string;
  reviewDueOn: string;
  publishedAt: Date;
  publishedByName: string | null;
}): FactsVersion | null {
  const config = parsePolicyConfig(row.config);
  if (!config) return null;
  return { ...row, config };
}

/** All published versions for a site, newest first. */
export async function listPolicyVersions(siteId: string, db: DbOrTx = getDb()): Promise<FactsVersion[]> {
  const rows = await db
    .select({
      id: welfarePolicyVersions.id,
      version: welfarePolicyVersions.version,
      config: welfarePolicyVersions.config,
      changeNote: welfarePolicyVersions.changeNote,
      reviewDueOn: welfarePolicyVersions.reviewDueOn,
      publishedAt: welfarePolicyVersions.publishedAt,
      publishedByName: staff.name,
    })
    .from(welfarePolicyVersions)
    .leftJoin(staff, eq(staff.id, welfarePolicyVersions.publishedByStaffId))
    .where(eq(welfarePolicyVersions.siteId, siteId))
    .orderBy(desc(welfarePolicyVersions.version));
  return rows.map(toVersion).filter((v): v is FactsVersion => v !== null);
}

const contactColumns = {
  id: welfareContacts.id,
  residentId: welfareContacts.residentId,
  outcome: welfareContacts.outcome,
  method: welfareContacts.method,
  happenedAt: welfareContacts.happenedAt,
  createdAt: welfareContacts.createdAt,
  note: welfareContacts.note,
  overdueMinutes: welfareContacts.overdueMinutes,
  staffName: staff.name,
};

/**
 * Everything needed to rebuild welfare state for a site (or one resident)
 * at any moment from `since` onwards — see `snapshotAt`. Pass a
 * transaction to read inside a server action's row lock.
 */
export async function loadWelfareFacts(
  siteId: string,
  since: Date,
  opts: { residentId?: string; db?: DbOrTx } = {},
): Promise<WelfareFacts> {
  const db = opts.db ?? getDb();
  const rid = opts.residentId;

  const residentWhere = rid
    ? and(eq(residents.siteId, siteId), eq(residents.id, rid))
    : and(eq(residents.siteId, siteId), ne(residents.status, "discharged"));
  const scoped = (t: { siteId: PgColumn; residentId: PgColumn }) =>
    rid ? and(eq(t.siteId, siteId), eq(t.residentId, rid)) : eq(t.siteId, siteId);
  const opener = alias(staff, "opener");
  const resolver = alias(staff, "resolver");

  const [residentRows, planRows, versions, before, contactRows, absenceRows, escalationRows] =
    await Promise.all([
      db
        .select({
          id: residents.id,
          firstName: residents.firstName,
          lastName: residents.lastName,
          preferredName: residents.preferredName,
          room: residents.room,
          status: residents.status,
        })
        .from(residents)
        .where(residentWhere),
      db
        .select({
          residentId: residentWelfarePlans.residentId,
          tierKey: residentWelfarePlans.tierKey,
          contactMethods: residentWelfarePlans.contactMethods,
          howToCheck: residentWelfarePlans.howToCheck,
          residentInvolved: residentWelfarePlans.residentInvolved,
          reviewedAt: residentWelfarePlans.reviewedAt,
          startedAt: residentWelfarePlans.startedAt,
          createdAt: residentWelfarePlans.createdAt,
          updatedAt: residentWelfarePlans.updatedAt,
        })
        .from(residentWelfarePlans)
        .where(scoped(residentWelfarePlans)),
      listPolicyVersions(siteId, db),
      // Latest reset and latest check of any kind before `since`, per resident.
      Promise.all([
        db
          .selectDistinctOn([welfareContacts.residentId], contactColumns)
          .from(welfareContacts)
          .leftJoin(staff, eq(staff.id, welfareContacts.staffId))
          .where(
            and(
              scoped(welfareContacts),
              lt(welfareContacts.happenedAt, since),
              inArray(welfareContacts.outcome, ["seen", "contacted"]),
            ),
          )
          .orderBy(welfareContacts.residentId, desc(welfareContacts.happenedAt), desc(welfareContacts.createdAt)),
        db
          .selectDistinctOn([welfareContacts.residentId], contactColumns)
          .from(welfareContacts)
          .leftJoin(staff, eq(staff.id, welfareContacts.staffId))
          .where(and(scoped(welfareContacts), lt(welfareContacts.happenedAt, since)))
          .orderBy(welfareContacts.residentId, desc(welfareContacts.happenedAt), desc(welfareContacts.createdAt)),
      ]),
      db
        .select(contactColumns)
        .from(welfareContacts)
        .leftJoin(staff, eq(staff.id, welfareContacts.staffId))
        .where(and(scoped(welfareContacts), gte(welfareContacts.happenedAt, since)))
        .orderBy(asc(welfareContacts.happenedAt)),
      db
        .select({
          id: welfareAbsences.id,
          residentId: welfareAbsences.residentId,
          startsAt: welfareAbsences.startsAt,
          expectedBackAt: welfareAbsences.expectedBackAt,
          reason: welfareAbsences.reason,
          endedAt: welfareAbsences.endedAt,
          cancelledAt: welfareAbsences.cancelledAt,
          createdAt: welfareAbsences.createdAt,
          createdByName: staff.name,
        })
        .from(welfareAbsences)
        .leftJoin(staff, eq(staff.id, welfareAbsences.createdByStaffId))
        .where(
          and(
            scoped(welfareAbsences),
            or(
              and(isNull(welfareAbsences.endedAt), isNull(welfareAbsences.cancelledAt)),
              gte(welfareAbsences.endedAt, since),
              gte(welfareAbsences.cancelledAt, since),
            ),
          ),
        ),
      db
        .select({
          id: welfareEscalations.id,
          residentId: welfareEscalations.residentId,
          policyVersionId: welfareEscalations.policyVersionId,
          tierKey: welfareEscalations.tierKey,
          dueAt: welfareEscalations.dueAt,
          lastSeenAt: welfareEscalations.lastSeenAt,
          openedAt: welfareEscalations.openedAt,
          openedByName: opener.name,
          resolvedAt: welfareEscalations.resolvedAt,
          resolvedByName: resolver.name,
        })
        .from(welfareEscalations)
        .leftJoin(opener, eq(opener.id, welfareEscalations.openedByStaffId))
        .leftJoin(resolver, eq(resolver.id, welfareEscalations.resolvedByStaffId))
        .where(
          and(
            scoped(welfareEscalations),
            or(isNull(welfareEscalations.resolvedAt), gte(welfareEscalations.resolvedAt, since)),
          ),
        ),
    ]);

  const escalationIds = escalationRows.map((e) => e.id);
  const actionRows: FactsAction[] = escalationIds.length
    ? await db
        .select({
          id: welfareEscalationActions.id,
          escalationId: welfareEscalationActions.escalationId,
          stepId: welfareEscalationActions.stepId,
          action: welfareEscalationActions.action,
          note: welfareEscalationActions.note,
          happenedAt: welfareEscalationActions.happenedAt,
          staffName: staff.name,
        })
        .from(welfareEscalationActions)
        .leftJoin(staff, eq(staff.id, welfareEscalationActions.staffId))
        .where(inArray(welfareEscalationActions.escalationId, escalationIds))
        .orderBy(asc(welfareEscalationActions.happenedAt))
    : [];

  const [resetsBefore, anyBefore] = before;
  const seen = new Set<string>();
  const contactsBefore: FactsContact[] = [];
  for (const c of [...resetsBefore, ...anyBefore]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    contactsBefore.push(c);
  }

  return {
    since,
    residents: residentRows,
    plans: planRows,
    versions,
    contactsBefore,
    contacts: contactRows,
    absences: absenceRows,
    escalations: escalationRows,
    actions: actionRows,
  };
}

/** Residents whose plan uses each tier key — stops a publish removing a tier in use. */
export async function residentsOnTier(siteId: string, db: DbOrTx = getDb()): Promise<Record<string, number>> {
  const rows = await db
    .select({ tierKey: residentWelfarePlans.tierKey, n: sql<number>`count(*)::int` })
    .from(residentWelfarePlans)
    .innerJoin(residents, eq(residents.id, residentWelfarePlans.residentId))
    .where(and(eq(residentWelfarePlans.siteId, siteId), ne(residents.status, "discharged")))
    .groupBy(residentWelfarePlans.tierKey);
  return Object.fromEntries(rows.map((r) => [r.tierKey, r.n]));
}
