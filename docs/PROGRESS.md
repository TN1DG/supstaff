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
| 4b | Welfare checks | built | [↓](#phase-4b--welfare-checks) |
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
<summary><strong>Phase 4b — Welfare checks</strong> · built 2026-10-19</summary>

**Started 2026-10-17**

Responds to the October 2026 organisational email on welfare check
arrangements in Supported Housing. Spec: EVG-NSHA-SPEC-001, section
"Welfare checks".

### What changed

**Data** — migration [`drizzle/0007_welfare_checks.sql`](../drizzle/0007_welfare_checks.sql),
tables in [`src/db/schema.ts`](../src/db/schema.ts)
- `welfare_policy_versions` — each publish of a service's rules; never updated.
- `resident_welfare_plans` — one per resident: tier, ways to check, notes,
  resident involved, last reviewed.
- `welfare_contacts` — every check (seen / contacted / no response), with
  when it happened and when it was logged. Append-only.
- `welfare_absences` — planned absences; ended or cancelled, never deleted.
- `welfare_escalations` + `welfare_escalation_actions` — one per overdue
  episode staff acted on, pinned to the rules version in force when opened.
  Partial unique index: one open escalation per resident.
- `staff.welfare_rules_deputy` — a support officer who can edit the rules.

**Logic** (pure, unit-tested)
- Status engine — [`src/lib/welfare-engine.ts`](../src/lib/welfare-engine.ts).
- Rules shape, organisation guardrails, plain-language descriptions,
  organisation default — [`src/lib/welfare-policy.ts`](../src/lib/welfare-policy.ts).
- Rebuild state at any moment from the records —
  [`src/lib/welfare-snapshot.ts`](../src/lib/welfare-snapshot.ts).
- Site time zone helpers (typed "03:10", datetime-local, shift windows) —
  [`src/lib/zoned-time.ts`](../src/lib/zoned-time.ts), [`src/lib/welfare.ts`](../src/lib/welfare.ts).
- `npm test` — 73 tests (`node:test` via `tsx`, no new dependency).

**Writes** — [`src/lib/welfare-write.ts`](../src/lib/welfare-write.ts),
[`welfare/actions.ts`](../src/app/(app)/welfare/actions.ts)
- Every write locks the resident row (`SELECT … FOR UPDATE`) first and
  reads the clock *after* the lock, so it sees everything committed before.
- Logging seen/contacted closes a running escalation — unless, logged late,
  it still leaves them overdue; "seen" ends a planned absence; "no response"
  while overdue opens an escalation.
- Escalation actions carry the last check the page knew about and are
  refused if the resident has been logged since.
- Checks and escalation actions queue a Salesforce outbox row
  (`welfare_contact`, `welfare_escalation_action`) in the same transaction.

**Screens**
- `/welfare` — board, most urgent first, auto-refreshes every minute.
  Escalation checklist with step times and instructions, log check, record
  step, planned absences — [`welfare/page.tsx`](../src/app/(app)/welfare/page.tsx),
  [`welfare-row.tsx`](../src/app/(app)/welfare/welfare-row.tsx).
- `/welfare/rules` — current rules, any past version (`?v=`), history,
  organisation limits. `/welfare/rules/edit` — editor with live guardrail
  checks, a replay of the last 24 hours, and PIN-signed publish.
- Resident page — welfare card (status, plan, last 7 days);
  `/residents/[id]/welfare` — plan form.
- Handover page — "Welfare this shift" panel, worked out from the records.
- Today page — welfare card; sidebar entry; staff form deputy checkbox.

**Tooling**
- `npm run seed:welfare` — publishes the default rules, plans for every
  resident but one, and demo activity in every state —
  [`scripts/seed-welfare.ts`](../scripts/seed-welfare.ts).

### Why

- **Status is derived, never stored** (spec decision D1). Vercel Hobby crons
  run once a day, so a stored "current step" would be wrong most of the night.
  Rebuilding from timestamps on every read is always right; a scheduler is
  only needed once something must happen with nobody looking (automatic
  alerts to on-call).
- **Stale pages are refused, not merged** (D2). If Sam logs Aisha as seen
  while Lee has the "Inform on-call" form open, Lee's action is refused and
  Lee is told to stand on-call down. Logging a sighting never conflicts.
- **An absence never hides an overdue resident.** It only pauses the clock
  if they weren't already due when it started, and one can't be added for
  someone overdue — they have to be seen or contacted first.
- **Pinned escalations.** A publish at 3am mustn't change an escalation that
  is already running, and an incident review must be able to see the rules
  that applied.
- **Two step-time styles, one meaning.** Managers copy timings from a Missing
  Persons Procedure written as "since last seen" or "after overdue"; both are
  converted to minutes after due, and the guardrails apply to that.
- **Guardrails in code, rules in the database.** Service managers own their
  rules; anything inside the organisation limits goes live on publish, no
  approval queue. Limits change by deploy. Current values are placeholders.
- **Times in the site's zone.** The server runs in UTC; every welfare time is
  stored as an instant and shown or typed in `sites.timezone`. Intervals are
  real elapsed time, so the 25 Oct clock change can't stretch or shrink one.
- **Seeded demo rows skip the outbox** so they can never reach Salesforce.

### How it progressed

| Date | Step |
| --- | --- |
| 2026-10-13 | Brainstormed from the organisational email; welfare checks are per person, separate from night-check floor patrols. |
| 2026-10-17 | Configurable timings, owned by service managers, inside organisation guardrails. Spec section written. |
| 2026-10-19 | D1 (derive on read) and D2 (stale-page refusal + row lock + partial unique index) decided. Built schema, engine, writes, screens, seed. |
| 2026-10-19 | `typecheck`, `lint`, `test` green; Turbopack and webpack builds green. Migration applied on top of 0000–0006 on Postgres 16. |
| 2026-10-19 | Independent code review. Fixed: clock read before the lock (a "no response" could miss a sighting committed a moment earlier); an absence starting after the due time hid an overdue resident; a late-logged sighting closed an escalation while still overdue; typed times in the repeated hour on clocks-back night; a refused action could leave an escalation open; plan save vs rules publish race; ordering by step severity across tiers. Race and late-sighting fixes verified against Postgres with concurrent transactions. |
| 2026-10-19 | Browser walk-through as support officer, bank staff, deputy and manager: logging, late logging, absences, plan set-up, rules publish, guardrail block, stale publish refused, handover panel. Two staff recording the first step at the same moment → one escalation, two actions. Stale "Inform on-call" refused after the resident was found. |

### Follow-ups

- [ ] Replace placeholder guardrails (`ORG_GUARDRAILS`) and the default
      rules with the Missing Persons Procedure timescales, and name the
      central owner.
- [ ] Confirm the In-Form welfare record type and map the outbox payloads
      in Phase 5.
- [ ] Shift windows for the handover panel are fixed constants
      (`SHIFT_WINDOWS`, 07–15 / 15–23 / 23–07), same posture as `ROUND_TIMES`.
- [ ] A tablet layout for logging on the floor (spec risk: checks logged late
      at the desk).
- [ ] Optional: notify on-call automatically — needs a scheduler (see Why).

</details>

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
| 2026-11-12 | `fd65fc7` | Session revocation: `staff.session_version` + per-request staff check in the JWT callback ([`session-check.ts`](../src/lib/session-check.ts)); bumped on deactivate and manager password reset; role changes apply immediately. Removed the cookie-only `/login → /` bounce in `proxy.ts` | Deactivated staff kept access until their JWT expired (up to 12h); a stale cookie could redirect-loop |
| 2026-11-12 | `cebaff6` | Audit log append-only in Postgres: trigger blocks UPDATE/DELETE/TRUNCATE except the FK set-null cascade (migration `0009`); migrations now applied to PGlite in tests | "Append-only" was only a convention in app code |
| 2026-11-12 | `7f8b327` | Audit every CSV export and PDF view/download (`*.export_csv`, `*.pdf_download`), written before the file is returned so an unrecorded export fails | UK GDPR accountability: who took resident data out, and when |
| 2026-11-12 | `d79aba7` | Shared [`csv.ts`](../src/lib/csv.ts) neutralises leading `= + - @` tab/CR in every CSV export | Handover and medication exports were open to CSV/formula injection |
| 2026-11-12 | `4584696` | Security headers in `next.config.ts`; nonce-based CSP (`'strict-dynamic'`) per request in `proxy.ts`, nonce passed to next-themes | XSS and clickjacking defence; no security headers before |
| 2026-11-12 | `f23450d` | GitHub Actions CI (typegen → typecheck → lint → test → build) and Dependabot | Checks weren't enforced on PRs; dependency updates were manual |

</details>
