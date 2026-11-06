# Waking night checklist — test plan

Automated coverage is `npm test` (vitest): round timing across GMT/BST,
auto-completion rules, escalation rules, sign-off blockers. This file is the
manual walk-through on top of that, mapped to the acceptance criteria.

## Setup

- Migrations `0007` and `0008` applied (`npm run db:migrate`).
- As a manager, open **Service settings** (`/settings/service`): check the
  round times and tolerance, tick the evening medication rounds, add a team
  email and the quick-dial numbers, tick "lone worker device".
- Sign in as a support officer with a signing PIN.

## 1. Shift header and rounds created on schedule

1. **Waking night** → *Start waking night*.
2. Header shows the night's date and you as staff on duty.
3. Five rounds appear at the configured times; press start again (or in a
   second tab) — still five, no duplicates.
4. Change the schedule in settings → tonight's rounds keep their times; the
   next shift uses the new ones.

## 2. Late / missed with reasons

1. Check in to a round more than the tolerance after its time; complete it →
   the dialog asks why it's off schedule; it saves as **Late** with the reason,
   floors covered and observations.
2. Let a round pass its cutoff (the next round's time) → it shows **Missed**
   and "Reason needed"; enter one inline on the waking-night page.
3. Complete a round inside the window → **On time**, no reason asked.
4. A round left due shows the reminder banner (and a browser notification
   once *Enable alerts* is allowed).

## 3. Auto items tick from real data

| Item | Make it tick |
|---|---|
| Handover received from PM | Submit the **late** handover for the evening; open it as night staff and *Mark as read* |
| Evening medication | Record every dose in the configured evening rounds |
| H&S building checks | Every round on time, or late/missed with a reason |
| Incidents handed over | Submit the **night** handover (events are already on it) |
| Incidents emailed | Mark every "Email the team" follow-up done (or log no events) |
| Handover delivered to AM | Submit the **night** handover |
| Shift Planner → In-Form | Only on a confirmed Salesforce sync — complete manually with a reason until Phase 5 |

Each ticked item links to its evidence. Remove the data (e.g. leave a dose
unrecorded) → the item offers *Complete manually*, which requires a reason.

Record a refused dose → a `[Medication · HH:MM] Refused: …` line appears on
the current shift's handover, and an `email` outbox row is queued.

## 4. Manual items

- *Done* needs no reason; *Not done* requires one.
- *N/A* is offered only on "CCTV information added to handover and In-Form".

## 5. Each event type creates its follow-ups

Log each type from **Events & follow-ups** (the dialog previews the list):

| Event | Follow-ups |
|---|---|
| Emergency repair (needs *Where*) | Call OOH repairs · Update the repairs log (auto — urgent building report) · Email the team |
| Accident or incident | SAW-IT incident form · Email the team |
| Anti-social behaviour | Record on In-Form · Verbal handover · Written handover (auto) · Police/emergency services (N/A allowed) |
| Serious incident | Contact the on-call manager |
| Customer unwell | Call 999 or 111 (pick which) |
| Staff threatened | Call 999 or 101 (pick which) |
| Any event marked **Serious** | + Contact the on-call manager |
| Any event marked **Minor — already managed** | no on-call follow-up |

Check each event appears on the night handover (customer's card if one was
picked, house notes otherwise; addendum once submitted), and in the night
handover's **Waking night checklist** panel with its open follow-ups.
*Log an event from this round* on a round page links the event to the round.

## 6. Sign-off blocked until everything is resolved

1. With anything open, the page lists each blocker and *Sign off shift* is
   disabled; the action re-checks server-side.
2. Resolve everything → sign off with your PIN (a wrong PIN is refused).
3. The shift is read-only; the night handover gets a
   `[Waking night signed off …]` summary with rounds, follow-ups and
   checklist exceptions.

## 7. Access

- Housing officer: `/waking-night` redirects to `/building`; no reminder banner.
- Non-managers: `/settings/service` → `/denied`.
