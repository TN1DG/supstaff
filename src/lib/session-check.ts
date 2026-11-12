// Pure rules for whether a signed-in session may continue — no DB or Auth.js
// imports, so they're unit-testable. `auth.ts` loads the staff row and asks.

export type StaffAccessRow = {
  active: boolean;
  engagedUntil: string | null;
  sessionVersion: number;
};

/** A bank-staff engagement end date has passed — the account stops working the day after. */
export function engagementEnded(
  engagedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!engagedUntil && new Date(engagedUntil) < new Date(now.toDateString());
}

/**
 * Should a session token for this staff row be rejected? `tokenVersion` is the
 * `sessionVersion` copied into the token at sign-in (absent on tokens issued
 * before the column existed, which count as version 0).
 */
export function sessionRevoked(
  row: StaffAccessRow | null | undefined,
  tokenVersion: number | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || !row.active) return true;
  if (engagementEnded(row.engagedUntil, now)) return true;
  return row.sessionVersion !== (tokenVersion ?? 0);
}
