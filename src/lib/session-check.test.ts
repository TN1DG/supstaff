import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { engagementEnded, sessionRevoked, type StaffAccessRow } from "@/lib/session-check";

const NOW = new Date("2026-11-12T03:00:00Z"); // mid night-shift
const row = (over: Partial<StaffAccessRow> = {}): StaffAccessRow => ({
  active: true,
  engagedUntil: null,
  sessionVersion: 0,
  ...over,
});

describe("engagementEnded", () => {
  it("is false with no end date", () => {
    assert.equal(engagementEnded(null, NOW), false);
  });
  it("is false on the last engaged day itself", () => {
    assert.equal(engagementEnded("2026-11-12", NOW), false);
  });
  it("is true the day after", () => {
    assert.equal(engagementEnded("2026-11-11", NOW), true);
  });
});

describe("sessionRevoked", () => {
  it("keeps a valid session", () => {
    assert.equal(sessionRevoked(row({ sessionVersion: 2 }), 2, NOW), false);
  });
  it("ends the session when the staff row is gone", () => {
    assert.equal(sessionRevoked(undefined, 0, NOW), true);
  });
  it("ends the session when the account is deactivated", () => {
    assert.equal(sessionRevoked(row({ active: false }), 0, NOW), true);
  });
  it("ends the session once a bank engagement has ended", () => {
    assert.equal(sessionRevoked(row({ engagedUntil: "2026-11-11" }), 0, NOW), true);
  });
  it("keeps the session on the last engaged day", () => {
    assert.equal(sessionRevoked(row({ engagedUntil: "2026-11-12" }), 0, NOW), false);
  });
  it("ends the session when sessions were revoked (version bumped)", () => {
    assert.equal(sessionRevoked(row({ sessionVersion: 1 }), 0, NOW), true);
  });
  it("ends a reactivated account's old session", () => {
    // deactivate bumps 0 → 1, reactivate leaves it at 1: the old token is still dead
    assert.equal(sessionRevoked(row({ active: true, sessionVersion: 1 }), 0, NOW), true);
  });
  it("treats tokens from before the column existed as version 0", () => {
    assert.equal(sessionRevoked(row({ sessionVersion: 0 }), undefined, NOW), false);
    assert.equal(sessionRevoked(row({ sessionVersion: 1 }), undefined, NOW), true);
  });
});
