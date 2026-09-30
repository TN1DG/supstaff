import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
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

/**
 * `housing_officer` sits outside the care ladder (bank → support → manager):
 * building reports only, no resident or medication data. See `src/lib/roles.ts`.
 */
export const staffRole = pgEnum("staff_role", [
  "bank_staff",
  "support_officer",
  "manager",
  "housing_officer",
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

export const nightCheckItemStatus = pgEnum("night_check_item_status", [
  "ok",
  "attention",
  "na",
]);

/**
 * A round row only ever exists once someone checks in (`in_progress`/`complete`)
 * or the daily sweep cron gives up on it (`missed`) — there is no stored
 * "pending" state; an unstarted-but-not-yet-due round is computed, not
 * persisted. See `src/lib/night-checks.ts`.
 */
export const nightCheckRoundStatus = pgEnum("night_check_round_status", [
  "in_progress",
  "complete",
  "missed",
]);

/**
 * `simple` items render as the generic OK/Attention/N/A pill; `resident_welfare`
 * items render as the floor/room drill-down instead, and their status is
 * derived (never staff-set directly) — see src/app/(app)/night-checks/actions.ts.
 */
export const nightCheckItemKind = pgEnum("night_check_item_kind", [
  "simple",
  "resident_welfare",
]);

export const medicationOutcome = pgEnum("medication_outcome", [
  "given",
  "refused",
  "omitted",
  "not_available",
  "self_admin",
]);

/** Building-report lifecycle — the housing officer moves a report along it. */
export const maintenanceStatus = pgEnum("maintenance_status", [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
]);

export const maintenancePriority = pgEnum("maintenance_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const maintenanceCategory = pgEnum("maintenance_category", [
  "plumbing",
  "electrical",
  "heating",
  "fire_safety",
  "security",
  "structural",
  "appliance",
  "grounds",
  "other",
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
}, (t) => [
  index("staff_site_active_idx").on(t.siteId, t.active),
]);

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
}, (t) => [
  index("residents_site_status_idx").on(t.siteId, t.status),
]);

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
}, (t) => [
  index("audit_log_site_at_idx").on(t.siteId, t.at.desc()),
]);

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
}, (t) => [
  index("outbox_status_created_idx").on(t.status, t.createdAt),
  index("outbox_entity_idx").on(t.entityType, t.entityId, t.target),
]);

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
    index("handovers_site_status_submitted_idx").on(
      t.siteId,
      t.status,
      t.submittedAt.desc(),
    ),
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
/* Night building checks (Phase 2)                                     */
/* ------------------------------------------------------------------ */

/** Manager-editable checklist — walked once per round. Order via `sortOrder`. */
export const nightCheckTemplateItems = pgTable("night_check_template_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  area: text("area").notNull(),
  description: text("description").notNull(),
  kind: nightCheckItemKind("kind").notNull().default("simple"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("night_check_template_site_active_idx").on(t.siteId, t.active),
]);

export const nightCheckRounds = pgTable(
  "night_check_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    /** The night this round belongs to — the 01:00–07:00 rounds are the next calendar day. */
    checkDate: date("check_date").notNull(),
    /** One of ROUND_TIMES, e.g. "23:00" — see `src/lib/night-checks.ts`. */
    roundTime: text("round_time").notNull(),
    /** Null only for a `missed` row the cron created — no one checked in. */
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByStaffId: uuid("completed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    status: nightCheckRoundStatus("status").notNull().default("in_progress"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("night_check_round_unique").on(t.siteId, t.checkDate, t.roundTime),
  ],
);

export const nightCheckItemResults = pgTable(
  "night_check_item_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => nightCheckRounds.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id")
      .notNull()
      .references(() => nightCheckTemplateItems.id, { onDelete: "restrict" }),
    status: nightCheckItemStatus("status"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("night_check_item_unique").on(t.roundId, t.templateItemId)],
);

/** Manager-configurable list of things staff can flag during a resident-welfare room check. */
export const nightCheckSituationTypes = pgTable("night_check_situation_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("night_check_situation_site_active_idx").on(t.siteId, t.active),
]);

/**
 * One row per room per round, snapshotted at check-in (same pattern as
 * `nightCheckItemResults`, but keyed by room number instead of template
 * item). `templateItemId` always points at the round's resident-welfare item.
 */
export const nightCheckRoomChecks = pgTable(
  "night_check_room_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => nightCheckRounds.id, { onDelete: "cascade" }),
    templateItemId: uuid("template_item_id")
      .notNull()
      .references(() => nightCheckTemplateItems.id, { onDelete: "restrict" }),
    roomNumber: integer("room_number").notNull(),
    note: text("note"),
    lastEditedByStaffId: uuid("last_edited_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("night_check_room_check_unique").on(t.roundId, t.roomNumber)],
);

/** Junction: which situation types were ticked for a given room check. */
export const nightCheckRoomSituations = pgTable(
  "night_check_room_situations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomCheckId: uuid("room_check_id")
      .notNull()
      .references(() => nightCheckRoomChecks.id, { onDelete: "cascade" }),
    situationTypeId: uuid("situation_type_id")
      .notNull()
      .references(() => nightCheckSituationTypes.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("night_check_room_situation_unique").on(t.roomCheckId, t.situationTypeId),
  ],
);

/* ------------------------------------------------------------------ */
/* Medication (Phase 3)                                                */
/* ------------------------------------------------------------------ */

/** A resident's prescribed medication, transcribed manually from the paper MAR. */
export const medications = pgTable("medications", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  residentId: uuid("resident_id")
    .notNull()
    .references(() => residents.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  form: text("form"),
  strength: text("strength"),
  route: text("route"),
  directions: text("directions"),
  isControlledDrug: boolean("is_controlled_drug").notNull().default(false),
  isPrn: boolean("is_prn").notNull().default(false),
  /** PRN only — soft safety-check thresholds, see src/lib/medication.ts. */
  prnMaxDosePerDay: integer("prn_max_dose_per_day"),
  prnMinIntervalMinutes: integer("prn_min_interval_minutes"),
  prnReason: text("prn_reason"),
  prescriber: text("prescriber"),
  active: boolean("active").notNull().default(true),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("medications_site_active_prn_idx").on(t.siteId, t.active, t.isPrn),
  index("medications_resident_idx").on(t.residentId),
]);

/**
 * Non-PRN dosing schedule — one row per round a medication is due in.
 * `roundSlot` is plain text against MEDICATION_ROUNDS (src/lib/medication.ts),
 * not a pg enum — same posture as night_check_rounds.round_time, so a round
 * can be added later without a migration. PRN medications have no rows here.
 */
export const medicationSchedules = pgTable(
  "medication_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    roundSlot: text("round_slot").notNull(),
    /** Day codes, e.g. ["mon","tue",...]; default every day. */
    daysOfWeek: text("days_of_week")
      .array()
      .notNull()
      .default(sql`ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("medication_schedule_round_unique").on(t.medicationId, t.roundSlot)],
);

/** Manager-configurable reasons for a non-"given" outcome — structural copy of nightCheckSituationTypes. */
export const medicationReasonCodes = pgTable("medication_reason_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("medication_reason_code_site_active_idx").on(t.siteId, t.active),
]);

/**
 * One row per dose recording — the legally-attributable act itself,
 * PIN-signed at the moment of insert (see src/app/(app)/medication/actions.ts).
 * Never updated except for the PRN effect-note follow-up fields.
 * `scheduledRound` is null for PRN doses; `scheduledDate` is the
 * operational day this dose belongs to (same role as night_check_rounds.check_date).
 */
export const medicationAdministrations = pgTable(
  "medication_administrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "restrict" }),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "restrict" }),
    scheduledDate: date("scheduled_date").notNull(),
    scheduledRound: text("scheduled_round"), // null = PRN
    administeredAt: timestamp("administered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    outcome: medicationOutcome("outcome").notNull(),
    reasonCodeId: uuid("reason_code_id").references(() => medicationReasonCodes.id, {
      onDelete: "set null",
    }),
    /** Controlled-drug second signature — required only when outcome = "given". */
    witnessStaffId: uuid("witness_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    /** PRN only — "why *this* time", distinct from medications.prnReason (the standing indication). */
    prnReasonNow: text("prn_reason_now"),
    /** PRN only — true if a max-dose/min-interval warning was shown and staff proceeded anyway. */
    prnSafetyWarningAcknowledged: boolean("prn_safety_warning_acknowledged")
      .notNull()
      .default(false),
    /** Follow-up edit, fillable any time after a PRN "given" dose — see editPrnEffectNote. */
    prnEffectNote: text("prn_effect_note"),
    prnEffectNoteAt: timestamp("prn_effect_note_at", { withTimezone: true }),
    prnEffectNoteByStaffId: uuid("prn_effect_note_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Plain composite unique — Postgres treats multiple NULLs (PRN rows,
    // scheduledRound = null) as distinct, so this already permits unlimited
    // PRN doses/day while blocking a duplicate scheduled dose.
    unique("medication_administration_slot_unique").on(
      t.medicationId,
      t.scheduledDate,
      t.scheduledRound,
    ),
    // The hottest predicate in the app — every round page and report filters
    // by site + date. The unique above is medicationId-first, so it can't help.
    index("medication_admin_site_date_idx").on(t.siteId, t.scheduledDate),
    index("medication_admin_resident_idx").on(t.residentId),
  ],
);

/* ------------------------------------------------------------------ */
/* Building reports (Phase 4)                                          */
/* ------------------------------------------------------------------ */

/**
 * A building issue logged by any staff member, or raised by the housing
 * officer from a night-check "Needs attention" finding (`sourceItemResultId`).
 * Forwarded to Saw-it through the outbox on create and on every triage change.
 */
export const maintenanceReports = pgTable(
  "maintenance_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Free text — "Kitchen", "Stairwell B", "Room 7". */
    location: text("location").notNull(),
    /** Set when the issue is inside a resident room; one of ALL_ROOM_NUMBERS. */
    roomNumber: integer("room_number"),
    category: maintenanceCategory("category").notNull().default("other"),
    priority: maintenancePriority("priority").notNull().default("normal"),
    status: maintenanceStatus("status").notNull().default("open"),
    reportedByStaffId: uuid("reported_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    sourceItemResultId: uuid("source_item_result_id")
      .unique("maintenance_report_source_unique")
      .references(() => nightCheckItemResults.id, { onDelete: "set null" }),
    /** Contractor or person the job is with — free text until Saw-it syncs it back. */
    assignedTo: text("assigned_to"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByStaffId: uuid("resolved_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("maintenance_reports_site_status_created_idx").on(
      t.siteId,
      t.status,
      t.createdAt.desc(),
    ),
    index("maintenance_reports_site_created_idx").on(t.siteId, t.createdAt.desc()),
  ],
);

/** Append-only timeline — one row per create / triage change. */
export const maintenanceReportUpdates = pgTable(
  "maintenance_report_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => maintenanceReports.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    fromStatus: maintenanceStatus("from_status"),
    toStatus: maintenanceStatus("to_status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("maintenance_report_updates_report_idx").on(t.reportId, t.createdAt)],
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
  medications: many(medications),
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

export const nightCheckTemplateItemsRelations = relations(
  nightCheckTemplateItems,
  ({ one, many }) => ({
    site: one(sites, {
      fields: [nightCheckTemplateItems.siteId],
      references: [sites.id],
    }),
    results: many(nightCheckItemResults),
    roomChecks: many(nightCheckRoomChecks),
  }),
);

export const nightCheckRoundsRelations = relations(
  nightCheckRounds,
  ({ one, many }) => ({
    site: one(sites, {
      fields: [nightCheckRounds.siteId],
      references: [sites.id],
    }),
    staff: one(staff, {
      fields: [nightCheckRounds.staffId],
      references: [staff.id],
      relationName: "nightCheckRoundStaff",
    }),
    completedBy: one(staff, {
      fields: [nightCheckRounds.completedByStaffId],
      references: [staff.id],
      relationName: "nightCheckRoundCompletedBy",
    }),
    items: many(nightCheckItemResults),
    roomChecks: many(nightCheckRoomChecks),
  }),
);

export const nightCheckItemResultsRelations = relations(
  nightCheckItemResults,
  ({ one }) => ({
    round: one(nightCheckRounds, {
      fields: [nightCheckItemResults.roundId],
      references: [nightCheckRounds.id],
    }),
    templateItem: one(nightCheckTemplateItems, {
      fields: [nightCheckItemResults.templateItemId],
      references: [nightCheckTemplateItems.id],
    }),
  }),
);

export const nightCheckSituationTypesRelations = relations(
  nightCheckSituationTypes,
  ({ one, many }) => ({
    site: one(sites, {
      fields: [nightCheckSituationTypes.siteId],
      references: [sites.id],
    }),
    roomSituations: many(nightCheckRoomSituations),
  }),
);

export const nightCheckRoomChecksRelations = relations(
  nightCheckRoomChecks,
  ({ one, many }) => ({
    round: one(nightCheckRounds, {
      fields: [nightCheckRoomChecks.roundId],
      references: [nightCheckRounds.id],
    }),
    templateItem: one(nightCheckTemplateItems, {
      fields: [nightCheckRoomChecks.templateItemId],
      references: [nightCheckTemplateItems.id],
    }),
    lastEditedBy: one(staff, {
      fields: [nightCheckRoomChecks.lastEditedByStaffId],
      references: [staff.id],
    }),
    situations: many(nightCheckRoomSituations),
  }),
);

export const nightCheckRoomSituationsRelations = relations(
  nightCheckRoomSituations,
  ({ one }) => ({
    roomCheck: one(nightCheckRoomChecks, {
      fields: [nightCheckRoomSituations.roomCheckId],
      references: [nightCheckRoomChecks.id],
    }),
    situationType: one(nightCheckSituationTypes, {
      fields: [nightCheckRoomSituations.situationTypeId],
      references: [nightCheckSituationTypes.id],
    }),
  }),
);

export const medicationsRelations = relations(medications, ({ one, many }) => ({
  site: one(sites, { fields: [medications.siteId], references: [sites.id] }),
  resident: one(residents, {
    fields: [medications.residentId],
    references: [residents.id],
  }),
  schedules: many(medicationSchedules),
  administrations: many(medicationAdministrations),
}));

export const medicationSchedulesRelations = relations(medicationSchedules, ({ one }) => ({
  medication: one(medications, {
    fields: [medicationSchedules.medicationId],
    references: [medications.id],
  }),
}));

export const medicationReasonCodesRelations = relations(
  medicationReasonCodes,
  ({ one, many }) => ({
    site: one(sites, { fields: [medicationReasonCodes.siteId], references: [sites.id] }),
    administrations: many(medicationAdministrations),
  }),
);

export const medicationAdministrationsRelations = relations(
  medicationAdministrations,
  ({ one }) => ({
    site: one(sites, {
      fields: [medicationAdministrations.siteId],
      references: [sites.id],
    }),
    medication: one(medications, {
      fields: [medicationAdministrations.medicationId],
      references: [medications.id],
    }),
    resident: one(residents, {
      fields: [medicationAdministrations.residentId],
      references: [residents.id],
    }),
    staff: one(staff, {
      fields: [medicationAdministrations.staffId],
      references: [staff.id],
      relationName: "medicationAdministrationStaff",
    }),
    witness: one(staff, {
      fields: [medicationAdministrations.witnessStaffId],
      references: [staff.id],
      relationName: "medicationAdministrationWitness",
    }),
    prnEffectNoteBy: one(staff, {
      fields: [medicationAdministrations.prnEffectNoteByStaffId],
      references: [staff.id],
      relationName: "medicationAdministrationPrnEffectNoteBy",
    }),
    reasonCode: one(medicationReasonCodes, {
      fields: [medicationAdministrations.reasonCodeId],
      references: [medicationReasonCodes.id],
    }),
  }),
);

export const maintenanceReportsRelations = relations(
  maintenanceReports,
  ({ one, many }) => ({
    site: one(sites, {
      fields: [maintenanceReports.siteId],
      references: [sites.id],
    }),
    reportedBy: one(staff, {
      fields: [maintenanceReports.reportedByStaffId],
      references: [staff.id],
      relationName: "maintenanceReportReportedBy",
    }),
    resolvedBy: one(staff, {
      fields: [maintenanceReports.resolvedByStaffId],
      references: [staff.id],
      relationName: "maintenanceReportResolvedBy",
    }),
    sourceItemResult: one(nightCheckItemResults, {
      fields: [maintenanceReports.sourceItemResultId],
      references: [nightCheckItemResults.id],
    }),
    updates: many(maintenanceReportUpdates),
  }),
);

export const maintenanceReportUpdatesRelations = relations(
  maintenanceReportUpdates,
  ({ one }) => ({
    report: one(maintenanceReports, {
      fields: [maintenanceReportUpdates.reportId],
      references: [maintenanceReports.id],
    }),
    staff: one(staff, {
      fields: [maintenanceReportUpdates.staffId],
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
export type NightCheckTemplateItem = typeof nightCheckTemplateItems.$inferSelect;
export type NightCheckRound = typeof nightCheckRounds.$inferSelect;
export type NightCheckItemResult = typeof nightCheckItemResults.$inferSelect;
export type NightCheckSituationType = typeof nightCheckSituationTypes.$inferSelect;
export type NightCheckRoomCheck = typeof nightCheckRoomChecks.$inferSelect;
export type NightCheckRoomSituation = typeof nightCheckRoomSituations.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type NewMedication = typeof medications.$inferInsert;
export type MedicationSchedule = typeof medicationSchedules.$inferSelect;
export type MedicationReasonCode = typeof medicationReasonCodes.$inferSelect;
export type MedicationAdministration = typeof medicationAdministrations.$inferSelect;
export type MaintenanceReport = typeof maintenanceReports.$inferSelect;
export type MaintenanceReportUpdate = typeof maintenanceReportUpdates.$inferSelect;

export type StaffRole = (typeof staffRole.enumValues)[number];
export type ShiftType = (typeof shiftType.enumValues)[number];
export type HandoverStatusValue = (typeof handoverStatus.enumValues)[number];
export type NightCheckItemStatusValue = (typeof nightCheckItemStatus.enumValues)[number];
export type NightCheckRoundStatusValue = (typeof nightCheckRoundStatus.enumValues)[number];
export type NightCheckItemKindValue = (typeof nightCheckItemKind.enumValues)[number];
export type MedicationOutcomeValue = (typeof medicationOutcome.enumValues)[number];
export type ResidentStatusValue = (typeof residentStatus.enumValues)[number];
export type MaintenanceStatusValue = (typeof maintenanceStatus.enumValues)[number];
export type MaintenancePriorityValue = (typeof maintenancePriority.enumValues)[number];
export type MaintenanceCategoryValue = (typeof maintenanceCategory.enumValues)[number];
