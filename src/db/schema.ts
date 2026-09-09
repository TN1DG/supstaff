import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const staffRole = pgEnum("staff_role", [
  "bank_staff",
  "support_officer",
  "manager",
]);

export const residentStatus = pgEnum("resident_status", [
  "active",
  "on_leave",
  "discharged",
]);

export const shiftType = pgEnum("shift_type", ["early", "late", "night"]);

export const handoverStatus = pgEnum("handover_status", [
  "draft",
  "submitted",
  "locked",
]);

export const outboxTarget = pgEnum("outbox_target", [
  "salesforce",
  "sawit",
  "email",
]);

export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
]);

/* ------------------------------------------------------------------ */
/* Core                                                                */
/* ------------------------------------------------------------------ */

export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Europe/London"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: staffRole("role").notNull().default("support_officer"),
  isAdmin: boolean("is_admin").notNull().default(false),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  pinHash: text("pin_hash"),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  /** For bank staff — account auto-deactivates after this date. */
  engagedUntil: date("engaged_until"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const residents = pgTable("residents", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  preferredName: text("preferred_name"),
  room: text("room"),
  dateOfBirth: date("date_of_birth"),
  keyWorkerId: uuid("key_worker_id").references(() => staff.id, {
    onDelete: "set null",
  }),
  photoUrl: text("photo_url"),
  status: residentStatus("status").notNull().default("active"),
  riskFlags: text("risk_flags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  supportNotes: text("support_notes"),
  admissionDate: date("admission_date"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Audit — append only                                                 */
/* ------------------------------------------------------------------ */

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  actorStaffId: uuid("actor_staff_id").references(() => staff.id, {
    onDelete: "set null",
  }),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Outbox — transactional outbox for Salesforce / Saw-it / email       */
/* ------------------------------------------------------------------ */

export const outbox = pgTable("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
  target: outboxTarget("target").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  externalRef: text("external_ref"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* Handovers (Phase 1)                                                 */
/* ------------------------------------------------------------------ */

export const handovers = pgTable(
  "handovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    handoverDate: date("handover_date").notNull(),
    shift: shiftType("shift").notNull(),
    /**
     * Who opened the handover for this shift. Everyone on shift writes into it.
     * (DB column kept as `author_staff_id` from the single-author era.)
     */
    startedByStaffId: uuid("author_staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    status: handoverStatus("status").notNull().default("draft"),
    generalNotes: text("general_notes"),
    /** Optimistic-lock token + attribution for the shared house-notes field. */
    generalNotesUpdatedAt: timestamp("general_notes_updated_at", {
      withTimezone: true,
    }),
    generalNotesByStaffId: uuid("general_notes_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" },
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByStaffId: uuid("submitted_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" },
    ),
    pdfUrl: text("pdf_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One handover per shift — the whole team contributes to the same record.
  (t) => [
    unique("handovers_site_date_shift").on(t.siteId, t.handoverDate, t.shift),
  ],
);

export const handoverResidentEntries = pgTable(
  "handover_resident_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handoverId: uuid("handover_id")
      .notNull()
      .references(() => handovers.id, { onDelete: "cascade" }),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "restrict" }),
    narrative: text("narrative"),
    moodObservations: text("mood_observations"),
    tasksOutstanding: text("tasks_outstanding"),
    appointments: text("appointments"),
    incidentFlag: boolean("incident_flag").notNull().default(false),
    /** Last person to save this card — shown on the entry, drives the conflict check. */
    lastEditedByStaffId: uuid("last_edited_by_staff_id").references(
      () => staff.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("handover_entry_unique").on(t.handoverId, t.residentId)],
);

/** Append-only notes added after a handover is locked. */
export const handoverAddenda = pgTable("handover_addenda", {
  id: uuid("id").primaryKey().defaultRandom(),
  handoverId: uuid("handover_id")
    .notNull()
    .references(() => handovers.id, { onDelete: "cascade" }),
  authorStaffId: uuid("author_staff_id")
    .notNull()
    .references(() => staff.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handoverAcknowledgements = pgTable(
  "handover_acknowledgements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handoverId: uuid("handover_id")
      .notNull()
      .references(() => handovers.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("handover_ack_unique").on(t.handoverId, t.staffId)],
);

/* ------------------------------------------------------------------ */
/* Rate limiting — brute-force lockout for auth-sensitive actions      */
/* ------------------------------------------------------------------ */

/**
 * One row per throttle key (e.g. `login:<email>`, `pin:<staffId>`,
 * `export:<staffId>`). A fixed window with an optional lockout; a cron
 * prunes stale rows. See `src/lib/rate-limit.ts`.
 */
export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const staffRelations = relations(staff, ({ one, many }) => ({
  site: one(sites, { fields: [staff.siteId], references: [sites.id] }),
  keyworkerOf: many(residents),
}));

export const residentsRelations = relations(residents, ({ one, many }) => ({
  site: one(sites, { fields: [residents.siteId], references: [sites.id] }),
  keyWorker: one(staff, {
    fields: [residents.keyWorkerId],
    references: [staff.id],
  }),
  handoverEntries: many(handoverResidentEntries),
}));

export const handoversRelations = relations(handovers, ({ one, many }) => ({
  site: one(sites, { fields: [handovers.siteId], references: [sites.id] }),
  startedBy: one(staff, {
    fields: [handovers.startedByStaffId],
    references: [staff.id],
    relationName: "handoverStartedBy",
  }),
  submittedBy: one(staff, {
    fields: [handovers.submittedByStaffId],
    references: [staff.id],
    relationName: "handoverSubmittedBy",
  }),
  generalNotesBy: one(staff, {
    fields: [handovers.generalNotesByStaffId],
    references: [staff.id],
    relationName: "handoverGeneralNotesBy",
  }),
  entries: many(handoverResidentEntries),
  addenda: many(handoverAddenda),
  acknowledgements: many(handoverAcknowledgements),
}));

export const handoverResidentEntriesRelations = relations(
  handoverResidentEntries,
  ({ one }) => ({
    handover: one(handovers, {
      fields: [handoverResidentEntries.handoverId],
      references: [handovers.id],
    }),
    resident: one(residents, {
      fields: [handoverResidentEntries.residentId],
      references: [residents.id],
    }),
    lastEditedBy: one(staff, {
      fields: [handoverResidentEntries.lastEditedByStaffId],
      references: [staff.id],
    }),
  }),
);

export const handoverAddendaRelations = relations(handoverAddenda, ({ one }) => ({
  handover: one(handovers, {
    fields: [handoverAddenda.handoverId],
    references: [handovers.id],
  }),
  author: one(staff, {
    fields: [handoverAddenda.authorStaffId],
    references: [staff.id],
  }),
}));

export const handoverAcknowledgementsRelations = relations(
  handoverAcknowledgements,
  ({ one }) => ({
    handover: one(handovers, {
      fields: [handoverAcknowledgements.handoverId],
      references: [handovers.id],
    }),
    staff: one(staff, {
      fields: [handoverAcknowledgements.staffId],
      references: [staff.id],
    }),
  }),
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type Site = typeof sites.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type Resident = typeof residents.$inferSelect;
export type NewResident = typeof residents.$inferInsert;
export type Handover = typeof handovers.$inferSelect;
export type HandoverResidentEntry = typeof handoverResidentEntries.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;

export type StaffRole = (typeof staffRole.enumValues)[number];
export type ShiftType = (typeof shiftType.enumValues)[number];
export type HandoverStatusValue = (typeof handoverStatus.enumValues)[number];
