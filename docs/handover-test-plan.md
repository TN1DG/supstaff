# Handover feature — full test plan

Everything the handover feature does, with seeded data to exercise each path.

**Model:** there is **one handover per shift** (`site + date + shift`). Everyone
on shift writes into the same record; each resident card and the house-notes
block saves on its own. Editing a card you loaded before someone else saved it
is **rejected, not overwritten**.

## Setup

```bash
npm run seed            # site + first manager (only needed once)
npm run seed:residents  # 15 residents
npm run seed:handovers  # test staff + 15 handover scenarios (safe to re-run — it wipes & rebuilds handovers)
npm run dev
```

`seed:handovers` **replaces** all handovers / entries / addenda / acknowledgements
(and their Salesforce outbox rows) for the site every run, so you always get a
known state. Residents and staff are preserved.

### Test accounts — password `Handover!Test1`

| Email | Name | Role | Signing PIN |
|---|---|---|---|
| `manager@test.local` | Morgan Reid | manager | `1234` |
| `amy@test.local` | Amy Turner | support_officer | `1111` |
| `ben@test.local` | Ben Carter | support_officer | `2222` |
| `cara@test.local` | Cara Diaz | bank_staff | `3333` |
| `dan@test.local` | Dan Ellis | support_officer | *(none — for the "set a PIN first" path)* |

Amy key-works residents 1–3 (Adeyemi, Bello, Bryant); Ben key-works 4–6
(Clarke, Doherty, Fletcher). The last roster resident (Whitfield) is
**discharged** and only appears via scenario 9.

To switch users: `http://localhost:3000/api/auth/signout` → Sign out → sign in
again. For the concurrency tests, sign in as a second person in an **incognito
window**.

---

## Seeded scenarios

Dates are relative to today. "Started by" is whoever opened the shift's handover.

| # | Date · shift · started by | State | What it exercises |
|---|---|---|---|
| 1 | today · Early · Amy | Draft, empty | Fresh draft, per-card save, "nothing to report", submit-with-PIN |
| 2 | today · Late · Amy | Draft · **multi-contributor** (Amy + Ben + Cara own cards, Morgan wrote house notes) · **1 incident** | "Contributors:" line, per-card "Edited by X", house-notes stamp, incident badge |
| 3 | today · Night · Ben | Draft (Ben started) | **Any** staff (Amy, a manager) can open it, edit, and submit |
| 4 | −1 · Late · Amy | Submitted · **most recent** · started by Amy, **submitted by Ben** · outstanding tasks · 1 addendum · 2 acks · queued | "Outstanding from the last handover" list card; "Submitted … · Ben Carter"; contributors Amy/Cara/Ben |
| 5 | −2 · Night · Ben | Submitted · **2 incidents** · 1 ack · queued | List incident badge = `2`; incidents-only filter; CSV `incidents=1` |
| 6 | −3 · Early · Morgan | Submitted · **0 acks** | "Read by: No one yet"; a non-contributor sees **"I've read this"** |
| 7 | −4 · Late · Amy | Submitted · **3 addenda** · 3 acks · queued | Addenda ordering; full "Read by" list |
| 8 | −5 · Night · Ben | Submitted · **all entries empty** | Every card shows "Nothing to report this shift." |
| 9 | −6 · Early · Amy | Submitted · includes the **discharged** resident | Edit roster keeps a non-active resident already on the handover |
| 10a | −8 · Late · Morgan | Submitted | Date-range filter / CSV window |
| 10b | −10 · Early · Ben | Submitted · 1 incident · queued | Older incident for filter + CSV |
| 10c | −14 · Night · Amy | Submitted | 2-week-old row |
| 10d | −21 · Late · Morgan | Submitted | Edge of a 3-week range |
| 12 | −7 · Early · Cara | Submitted · 1 ack | **Bank staff** can open + run a handover |
| 13 | −1 · Early · Dan | Draft · Dan is a contributor and **has no PIN** | Submitting as Dan → "set a signing PIN first" |

---

## Feature checklist

### List page `/handovers`

- [ ] Table lists handovers newest first, 60-row cap — **one row per shift**.
- [ ] Column header is **"Started by"**.
- [ ] **Status badge**: "Draft" (outline) vs "Submitted" (solid).
- [ ] **Incidents** column: red count badge when > 0 (`#5` = 2, `#2` = 1), "—" otherwise.
- [ ] **Read** column: acknowledgement count for submitted, "—" for drafts.
- [ ] **"Outstanding from the last handover"** card: `tasksOutstanding` from the single most-recent *submitted* handover (`#4`); "Open that handover" link. Hidden when that handover has no outstanding tasks.
- [ ] **"Open handover"** form: date (defaults today) + shift (defaults Late); helper line "One handover per shift…".
- [ ] Row date links to the detail page.

**Manager-only (sign in as Morgan):**
- [ ] Filter form (date from/to, shift, "Incidents only", Filter) + **"Export CSV"** button.
- [ ] As Amy / Ben / Cara: no filter form, no Export button.

### Open a handover (`Open handover` button / dashboard "Write a handover")

- [ ] Pick a shift **no one has opened** → creates the handover with an entry row for **every active resident** → lands on `/handovers/{id}/edit`, "Started by" = you.
- [ ] Pick a shift **someone already opened** (e.g. today / Late → `#2`) → opens *their* handover's edit page. No duplicate, no error.
- [ ] Two people opening the same new shift at the same moment → both land on the **same** handover (one wins the insert, the other is redirected to it).
- [ ] Invalid date / shift (tamper with the form) → silently no-ops.
- [ ] Audit row `handover.start` (check `/audit` as Morgan).

### Edit page `/handovers/[id]/edit`

- [ ] **Any** signed-in staff can open a draft's edit page (try `#3` as Amy — no redirect).
- [ ] A submitted handover's `/edit` redirects to the detail page.
- [ ] Info banner: "Everyone on shift edits this handover together…".
- [ ] Date + shift shown **read-only** in the sub-heading (no inputs).
- [ ] **House notes** card: own textarea + "Save house notes" button + "Edited by X · HH:MM" when set (`#2` → Morgan Reid).
- [ ] Each **resident card**: own incident checkbox + 4 textareas + "Save this resident" button + "Edited by X · HH:MM" stamp (`#2` → Amy / Ben / Cara on different cards).
- [ ] "your key resident" badge on residents you key-work.
- [ ] Existing values pre-fill; roster = active residents **plus** any resident already attached (open `#9` as Amy — discharged Whitfield still shows).
- [ ] Save one card → "Saved HH:MM" appears, that card only re-renders, others untouched.
- [ ] Card save errors:
  - Handover already submitted (someone submitted while you were editing) → "This handover has been submitted — add a note instead."
  - A field past its limit (narrative > 8000, others > 4000) → "That's longer than a handover note should be…".

### Concurrent editing (two windows — Amy in main, Ben in incognito)

- [ ] Both open the **same** today/Late handover from `/handovers` → identical URL.
- [ ] Amy saves **Aisha's** card, Ben saves **Tom's** card → both succeed, neither overwrites the other.
- [ ] Both open **Aisha's** card. Amy saves. Ben then saves → Ben gets the amber
      **"Someone else saved this first — Amy Turner saved a newer version at HH:MM…"** banner with a **"Reload this handover"** button. Aisha's card still holds *Amy's* text (Ben's was **not** written).
- [ ] Ben clicks "Reload this handover" → page refreshes, Aisha's card now shows Amy's version, Ben re-types and saves OK.
- [ ] Same test on the **house notes** block.
- [ ] Saving the same card twice in a row in one window (no other editor) → second save just works (no false conflict).

### Detail page `/handovers/[id]`

- [ ] **Draft banner** "This handover is still a draft".
- [ ] On a **draft**, everyone sees **PDF · Continue editing · Submit handover** (try `#3` as Amy — she is not the starter and not a manager).
- [ ] Header: **"Started by {name}"**; when submitted, **"· Submitted {time} · {submitter}"** (`#4` → "· Ben Carter").
- [ ] **"Contributors: A, B, C"** line under the header when more than one person contributed (`#2`, `#4`).
- [ ] **House notes** card only when notes exist (`#2` yes, `#1` no).
- [ ] Resident cards: "Incident logged" badge (`#2`, `#5`); "Nothing to report this shift." when all four fields blank (`#8`).
- [ ] Entries ordered by resident surname.

**Submitted-only sections:**
- [ ] **"Notes added afterwards"** + "Add a note"; addenda listed oldest-first (`#7` has 3).
- [ ] **Salesforce panel**: "Queued for Salesforce…" when queued (`#4`, `#5`, `#7`, `#10b`), else "ready to go into Salesforce" (`#6`, `#9`, `#12`). "Download PDF" + "Copy text for Salesforce" (flips to "Copied" 2s).
- [ ] **"Read by"** card:
  - "I've read this" shows only when the viewer **has not contributed** (started / edited a card / submitted) and hasn't acknowledged — open `#6` as Amy.
  - A contributor never sees the button — open `#4` as Amy or Ben.
  - After acknowledging: button gone, name + time in the list. "No one yet." when empty (`#6`).

### Submit (`Submit handover` → PIN dialog)

- [ ] Correct PIN → toast "Handover submitted", status → Submitted, `submittedAt` + **submitter** recorded, Salesforce outbox row, audit `handover.submit`. Edit buttons disappear; addendum / Salesforce / Read-by sections appear.
- [ ] **Any** staff on shift can submit — `#3` as Amy (PIN `1111`); detail then shows "Started by Ben Carter · Submitted … · Amy Turner".
- [ ] **Wrong PIN** → "That PIN is not right."
- [ ] **No PIN** — sign in as **Dan**, open `#13`, Submit → "Set a signing PIN first (in your account) to sign this off."
- [ ] **5 wrong PINs / 15 min** → 30-min lockout → "Too many wrong PINs — try again in about N minutes." (clears on a correct PIN or after the window).
- [ ] Already-submitted → "Already submitted."

### Add a note / addendum (submitted handovers only)

- [ ] Body + PIN. `< 2` chars → "Write the note first."; `> 4000` → "That note is too long."
- [ ] Correct PIN → toast "Note added", note with name + timestamp, audit `handover.add_addendum`.
- [ ] Any signed-in staff can add a note — try as Ben on `#4`.
- [ ] Draft handover has no "Add a note" button.

### Acknowledge ("I've read this")

- [ ] Click → toast "Marked as read", name joins "Read by", list Read count increments.
- [ ] Clicking twice → still one row (idempotent). No effect on a draft. No audit row.

### PDF `/handovers/[id]/pdf`

- [ ] Opens inline; filename `handover-{date}-{shift}.pdf`; `Cache-Control: private, no-store`.
- [ ] Header reads **"Started by X · Submitted … by Y"** and a **"Contributors: …"** line when > 1.
- [ ] Signed out → 401. Bad id → 404. **> 20 req / min** → 429 + `Retry-After`.

### CSV export `/handovers/export` (manager only)

- [ ] As Amy/Ben/Cara → 403. As Morgan → downloads `handovers-{today}.csv`.
- [ ] Columns: Date, Shift, **Started by**, **Submitted by**, Status, Submitted at, Resident, Incident, How the shift went, Mood / observations, Tasks outstanding, Appointments.
- [ ] One row per resident entry; a handover with no entries still gets one row.
- [ ] `?incidents=1` → only handovers with ≥ 1 incident entry (`#5`, `#10b`). `?from=&to=`, `?shift=night` filters. Quote/comma/newline escaping.
- [ ] **> 10 req / min** → 429 + `Retry-After`.

### Cross-cutting

- [ ] **Tenant isolation**: a random UUID in the URL → 404.
- [ ] **Auth gates**: signed out → `/login`; `mustChangePassword` → `/welcome` (test accounts have it off).
- [ ] **Audit trail** (`/audit` as Morgan): `handover.start`, `handover.edit_entry` (one per card save, actor varies), `handover.edit_notes`, `handover.submit`, `handover.add_addendum` — each with actor, IP, user-agent.
