# Supstaff — progress log

What changed, why, and how each phase got there. Setup lives in
[`README.md`](../README.md); this file is the history.

## How to write here

- **One section per phase.** Inside it, always the same four headings:
  *What changed* · *Why* · *How it progressed* · *Follow-ups*.
- **One bullet per change.** Link files; don't paste code.
- **Dates are absolute** (`2026-09-30`, not "yesterday").
- **Keep it short.** When a phase is finished and a new one starts, fold the
  old one into a `<details>` block so only the current phase is expanded.
- Cross-cutting fixes that don't belong to a phase go under
  [Maintenance & hardening](#maintenance--hardening).

## Index

| Phase | Scope | State | Section |
| --- | --- | --- | --- |
| 0 | Foundation: auth, roles, staff, residents, audit, outbox | built | [↓](#phase-0--foundation) |
| 1 | Handovers | built | [↓](#phase-1--handovers) |
| 2 | Night building checks | built | [↓](#phase-2--night-building-checks) |
| 3 | Full eMAR | built | [↓](#phase-3--emar) |
| 4 | Building reports + housing officer | built | [↓](#phase-4--building-reports--housing-officer) |
| — | Waking night checklist | **built — current** | [↓](#waking-night-checklist) |
| 5 | Salesforce / Saw-it delivery + manager insights | next | — |
| — | Maintenance & hardening | ongoing | [↓](#maintenance--hardening) |

---

## Waking night checklist

**Started 2026-10-08 · current** · branch `feat/waking-night-checklist` ·
plan `~/.claude/plans/elegant-wiggling-comet.md` · manual walk-through
[`waking-night-test-plan.md`](waking-night-test-plan.md)

Replaces the paper checklist night staff initialled. Built in four
shippable steps: rounds + manual checklist (A), auto-completion (B),
escalation follow-ups (C), quick reference (D).

### What changed

**Time and configuration**
- Site-timezone helpers — [`src/lib/site-time.ts`](../src/lib/site-time.ts).
  `sites.timezone` was stored but never read; every date was server-local
  (UTC on Vercel). Night checks now use it.
- `site_settings` (one row per service, all optional) + `getSiteConfig()` —
  [`src/lib/site-settings.ts`](../src/lib/site-settings.ts). Manager page
  [`/settings/service`](../src/app/(app)/settings/service/page.tsx): round
  times, ± tolerance, evening med rounds, team email, quick-dial numbers,
  lone-worker device.

**Welfare rounds (= patrols; still `night_check_rounds`)**
- New status `scheduled`; rounds are created when the shift starts.
  New columns `scheduled_at`, `floors_covered`, `observations`, `timeliness`
  (`on_time`/`late`/`missed`), `timeliness_reason`.
- Timing rules — [`src/lib/waking-night/rounds.ts`](../src/lib/waking-night/rounds.ts):
  on time = within ±tolerance; late = outside it but before the next round
  (+2h for the last); missed = not done by then. Late/missed need a reason.
- `checkInRound` claims the scheduled row; `completeRound` takes floors,
  observations and a reason; new `setRoundReason` —
  [`night-checks/actions.ts`](../src/app/(app)/night-checks/actions.ts).
- Sweep cron marks rounds past their cutoff missed; moved to 10:00 UTC so it
  runs after the 07:00 round's window in both GMT and BST —
  [`api/cron/night-checks`](../src/app/api/cron/night-checks/route.ts), `vercel.json`.
- In-app reminder (banner, toast, chime, browser notification) polls
  [`/api/waking-night/rounds`](../src/app/api/waking-night/rounds/route.ts) —
  [`round-reminder.tsx`](../src/components/round-reminder.tsx).

**Shift, checklist and sign-off — `/waking-night`**
- Tables `waking_night_shifts`, `shift_checklist_results`.
- 12 items in code — [`checklist.ts`](../src/lib/waking-night/checklist.ts).
  7 tick themselves from other modules —
  [`auto-items.ts`](../src/lib/waking-night/auto-items.ts) (rules),
  [`snapshot.ts`](../src/lib/waking-night/snapshot.ts) (queries). Missing
  data → "Complete manually" with a reason.
- Sign-off (PIN) blocked by [`signOffBlockers`](../src/lib/waking-night/sign-off.ts);
  snapshots auto items with their evidence and writes a summary to the night
  handover — [`waking-night/actions.ts`](../src/app/(app)/waking-night/actions.ts).
- Night handovers show a checklist + follow-ups panel —
  [`night-shift-panel.tsx`](../src/app/(app)/waking-night/night-shift-panel.tsx).

**Events and escalation**
- Tables `night_events`, `shift_follow_ups`; rules in
  [`escalation.ts`](../src/lib/waking-night/escalation.ts). Logged from the
  shift page or a round — [`event-actions.ts`](../src/app/(app)/waking-night/event-actions.ts).
- Emergency repair raises an urgent building report (Saw-it outbox);
  every event is written to the night handover; "email the team" queues an
  `email` outbox row.

**Medication issues**
- Refused / omitted / not available doses go onto the current shift's
  handover and queue a team email —
  [`src/lib/medication-issues.ts`](../src/lib/medication-issues.ts), called
  from `recordAdministration`.
- `appendHandoverNote` generalises the night-check → handover writer —
  [`src/lib/handover-sync.ts`](../src/lib/handover-sync.ts).

**Other**
- Handover start form defaults date + shift from site time; night handovers
  are dated the evening the shift started —
  [`src/lib/handover-defaults.ts`](../src/lib/handover-defaults.ts).
- First test runner: vitest (`npm test`), 68 tests on the pure rules.
- Migrations `0007` (A/B) and `0008` (C).

### Why

- **One round entity.** Patrols and welfare rounds are the same walk, and
  night checks already modelled it; extending it kept the welfare drill-down
  and handover flags.
- **App-only for Salesforce** (user's call, 2026-10-08). The outbox already
  carries `night_event` / `medication_administration` email rows; the
  Salesforce shape is decided in Phase 5 (record type on `In_Form_Action__c`
  + Tasks recommended).
- **Email: queue + confirm.** No email provider yet, so the row is queued and
  staff tick that they emailed; the checklist can't claim a send it can't see.
- **"Uploaded to In-Form" can't auto-tick** until Salesforce delivery exists —
  it only ticks on a `sent` outbox row.
- **Pure rules, tested.** Round status, auto items, escalation and sign-off
  are pure functions so page, action and cron can't disagree.

### How it progressed

| Date | Step |
| --- | --- |
| 2026-10-08 | Planned with the user: app-only Salesforce, night event log (not a full incidents module), queue + manual tick for email, in-app reminders. |
| 2026-10-08 | Found `.env.local` points at an expired neon.new claimable project, not the Vercel-linked Neon project. Created Neon branch `waking-night-dev` from the Vercel project's `main`; `drizzle-kit migrate` applied pending `0006` + `0007` + `0008` cleanly. |
| 2026-10-08 | End-to-end over HTTP against the branch, driving the real server actions: start shift, sweep, events → follow-ups/report/outbox/handover, validation errors, late round completion, auto items ticking, blocked then successful sign-off, post-sign-off edits refused. |

### Follow-ups

- [ ] Browser walk-through (Chrome extension wasn't connected) — see the test plan.
- [ ] Apply `0006`–`0008` to production `main` when deploying.
- [ ] Repoint `.env.local` — the claimable project it uses has expired.
- [ ] eMAR still records `scheduled_date` in server time; bedtime doses
      recorded after 00:00 UTC land on the next date.
- [ ] Phase 5: email + Salesforce delivery, then "uploaded to In-Form" can auto-tick.
- [ ] Optional seed script for a demo night.

---

<details>
<summary><strong>Phase 4 — Building reports + housing officer</strong> · built 2026-09-30</summary>

**Started 2026-09-29**

### What changed

**New role — housing officer**
- `housing_officer` added to the `staff_role` enum —
  [`src/db/schema.ts`](../src/db/schema.ts).
- Sits *off* the care ladder at rank 0 —
  [`src/lib/roles.ts`](../src/lib/roles.ts). New helpers `canAccessCare()` and
  `canManageBuilding()`.
- New guards `requireCareStaff` / `assertCareStaff` and
  `requireBuildingManager` / `assertBuildingManager` —
  [`src/lib/rbac.ts`](../src/lib/rbac.ts).
- Every handovers, medication, night-checks, residents and Today route/action
  switched from `requireStaff`/`assertStaff` to the care guards. The two PDF
  route handlers now use `guardRoute("bank_staff")`.
- Sidebar items tagged with an `audience` (`care` / `building`) —
  [`src/lib/nav.ts`](../src/lib/nav.ts). New "Building" section.
- Staff admin can create/edit housing officers —
  [`staff/actions.ts`](../src/app/(app)/staff/actions.ts) (zod enum now reads
  `staffRole.enumValues`), [`staff-form.tsx`](../src/app/(app)/staff/staff-form.tsx),
  [`staff/page.tsx`](../src/app/(app)/staff/page.tsx).

**Building reports — data**
- Tables `maintenance_reports` and `maintenance_report_updates` (timeline),
  enums for status / priority / category —
  [`src/db/schema.ts`](../src/db/schema.ts),
  migration [`drizzle/0006_zippy_kat_farrell.sql`](../drizzle/0006_zippy_kat_farrell.sql).
- Display metadata (labels + status tones) —
  [`src/lib/maintenance.ts`](../src/lib/maintenance.ts).
- Shared create-in-transaction + Saw-it payload —
  [`src/lib/maintenance-sync.ts`](../src/lib/maintenance-sync.ts).

**Capture — `/maintenance` (everyone)**
- "Report an issue" form + "Your recent reports" —
  [`maintenance/page.tsx`](../src/app/(app)/maintenance/page.tsx),
  [`report-form.tsx`](../src/app/(app)/maintenance/report-form.tsx),
  [`actions.ts`](../src/app/(app)/maintenance/actions.ts).

**Review — `/building` (housing officer + manager)**
- Dashboard: 6 KPI tiles, filter bar, reports table, category breakdown,
  night-check findings table, CSV export —
  [`building/page.tsx`](../src/app/(app)/building/page.tsx),
  [`queries.ts`](../src/app/(app)/building/queries.ts),
  [`export/route.ts`](../src/app/(app)/building/export/route.ts).
- Report detail with timeline and triage form —
  [`building/[id]/page.tsx`](../src/app/(app)/building/[id]/page.tsx),
  [`triage-form.tsx`](../src/app/(app)/building/[id]/triage-form.tsx).
- Triage + "Raise report from finding" actions —
  [`building/actions.ts`](../src/app/(app)/building/actions.ts).

**Tooling**
- `npm run seed:maintenance` — a housing officer account + 20 demo reports —
  [`scripts/seed-maintenance.ts`](../scripts/seed-maintenance.ts).

### Why

- **Housing officer is building-only.** They're responsible for the building,
  not residents. Keeping them off the care ladder (rank 0) means every
  existing `requireRole(...)` check already excludes them — no risk of a
  forgotten page leaking medication or resident data. Care pages that used the
  plain `requireStaff()` were the gap, so those moved to `requireCareStaff()`.
- **A housing officer who hits a care page lands on `/building`**, not
  `/denied` — `/` is where login sends everyone, so that redirect *is* their
  home page.
- **Triage, not just view.** The officer owns the fix, so they move reports
  open → acknowledged → in progress → resolved, set priority and record who
  it's with. Every save writes a timeline row + audit row + Saw-it outbox row
  in one transaction (project convention).
- **Night-check findings feed the same dashboard.** Staff already flag building
  problems as "Needs attention" on night rounds; without this they'd sit
  inside round records nobody on the building side reads. Only *simple*
  (building) items are shown — the resident-welfare drill-down is never
  exposed to the housing officer.
- **"Raise report" instead of auto-creating reports.** A finding is often
  transient ("gate left open, closed it"). Letting the officer promote the
  ones that need work keeps the backlog honest. `source_item_result_id` is
  unique, so a double-click can't create duplicates.
- **"Open now" KPIs ignore the date filter.** The first question is always
  "what's outstanding right now"; created/resolved counts follow the range.
- **No chart library.** Category breakdown is CSS bars — one less dependency
  for a desktop-first app, and it's server-rendered.
- **CSV export escapes formulas** (`=`, `+`, `-`, `@`) because titles and notes
  are free text that gets opened in Excel.
- **Seeded demo reports skip the outbox** so demo data can never reach Saw-it.

### How it progressed

| Date | Step |
| --- | --- |
| 2026-09-29 | Scoped with the user: building-only access, full triage, dashboard pulls reports **and** night-check findings. |
| 2026-09-30 | Role added to the enum/ladder; care routes moved to `requireCareStaff`; nav audiences. |
| 2026-09-30 | Schema + migration for reports and timeline. Migration also picked up indexes from `52154b9` that were only ever `db:push`ed — made those `IF NOT EXISTS`. |
| 2026-09-30 | `/maintenance` capture form, `/building` dashboard, detail + triage, CSV export, seed script. |
| 2026-09-30 | `typecheck`, `lint`, `build` green. |
| 2026-09-30 | Migration applied to the dev DB by running `0006` directly — `db:push` also wanted to drop/re-add six FKs whose names exceed Postgres's 63-char limit (drizzle-kit quirk, no real change). Seeded. |
| 2026-09-30 | HTTP-level tests per role: housing officer redirected off every care page with no resident data in the response; support officer denied `/building` + CSV (403); KPIs, filters, search escaping and CSV all match the seed; welfare findings correctly excluded. |

### Follow-ups

- [ ] Browser walk-through of the three forms: log a report, triage to
      resolved, "Raise report" from a night-check finding (Chrome automation
      couldn't reach localhost during testing).
- [ ] Photo attachments on reports (no Blob client in the project yet).
- [ ] Real Saw-it delivery — the outbox rows are queued; the drainer lands in
      Phase 5.
- [ ] Manager-configurable categories (currently a fixed enum, same posture as
      `ROUND_TIMES`).
- [ ] Optional: notify the housing officer (email via outbox) on `urgent` reports.

</details>
---

<details>
<summary><strong>Phase 3 — eMAR</strong> · built 2026-09-16</summary>

### What changed
- Medication, schedules, reason codes and administrations tables; round pages,
  PRN doses, controlled-drug witness, manager reports + CSV/PDF export.

### Why
- Replace the paper MAR with a timestamped, attributable record (signing PIN
  on every dose).

### How it progressed
- `35e1f05` (2026-09-16) Phase 3 eMAR.
- `df481de` (2026-09-16) App-wide status tone system (`src/lib/status-tone.ts`).
- `4a2f8ff` (2026-09-16) Rich medication demo seed.

### Follow-ups
- None open.

</details>

<details>
<summary><strong>Phase 2 — Night building checks</strong> · built 2026-09-16</summary>

### What changed
- Five fixed rounds a night, manager-editable checklist, resident-welfare
  floor/room drill-down, daily cron that records missed rounds.

### Why
- Evidence that the building was walked every two hours overnight.

### How it progressed
- `0379c2e` (2026-09-16) Phase 2 night checks.

### Follow-ups
- Round times and room layout are fixed constants (`src/lib/night-checks.ts`).
- "Needs attention" items now surface on the Phase 4 building dashboard.

</details>

<details>
<summary><strong>Phase 1 — Handovers</strong> · built 2026-09-09</summary>

### What changed
- One shared handover per shift, per-resident entries, addenda,
  acknowledgements, PDF export.

### Why
- The whole team writes into the same shift record instead of separate notes.

### How it progressed
- `9146daa` (2026-09-09) Initial commit with Phase 0 + 1.

### Follow-ups
- None open.

</details>

<details>
<summary><strong>Phase 0 — Foundation</strong> · built 2026-09-09</summary>

### What changed
- Auth.js login, roles (bank staff / support officer / manager), staff and
  residents admin, append-only audit log, transactional outbox, design system.

### Why
- Every later feature needs attributable, auditable actions and a safe way to
  talk to external systems.

### How it progressed
- `9146daa` (2026-09-09) Initial commit.
- `9086e17` (2026-09-09) `.gitattributes` for LF endings.
- `0cc764a` (2026-09-17) First Vercel deployment.

### Follow-ups
- None open.

</details>

<details>
<summary><strong>Maintenance & hardening</strong></summary>

| Date | Commit | Change | Why |
| --- | --- | --- | --- |
| 2026-09-26 | `b8d7b94` | Project staff/resident queries before client forms | Stop password/PIN hashes reaching the browser |
| 2026-09-26 | `5f1b7e5` | Error + loading boundaries; audit three unrecorded writes | Resilience; audit completeness |
| 2026-09-26 | `52154b9` | Indexes, fewer duplicate queries, dead code removed | Performance |
| 2026-09-26 | `71e6f1e` | Shared `FormError` / `PinField` | De-duplicate UI |
| 2026-09-26 | `e5604bf` | Tidy `.gitignore` | Housekeeping |

</details>
