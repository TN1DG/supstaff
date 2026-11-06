import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  ORG_GUARDRAILS,
  describeStep,
  formatMinutes,
  minutesAfterDue,
  parsePolicyConfig,
  sortedSteps,
  validatePolicy,
  type PolicyStep,
  type PolicyTier,
  type WelfarePolicyConfig,
} from "@/lib/welfare-policy";

const step = (id: string, afterMinutes: number, action: PolicyStep["action"]): PolicyStep => ({
  id,
  afterMinutes,
  action,
  instruction: `Do ${action}`,
});

function tier(over: Partial<PolicyTier> = {}): PolicyTier {
  return {
    key: "t1",
    name: "Standard",
    intervalMinutes: 240,
    clockStart: "due",
    steps: [step("a", 0, "retry_contact"), step("b", 120, "inform_on_call"), step("c", 480, "report_missing")],
    ...over,
  };
}

const rules = (...tiers: PolicyTier[]): WelfarePolicyConfig => ({ tiers });
const messages = (c: WelfarePolicyConfig, inUse?: Record<string, number>) =>
  validatePolicy(c, inUse).map((i) => i.message);

describe("organisation default", () => {
  it("passes the guardrails, so a new service can publish it as it stands", () => {
    assert.deepEqual(validatePolicy(DEFAULT_POLICY), []);
  });
});

describe("guardrails (decision table)", () => {
  it("a valid tier has no issues", () => {
    assert.deepEqual(messages(rules(tier())), []);
  });

  it("interval: 30 minutes to 24 hours", () => {
    assert.deepEqual(messages(rules(tier({ intervalMinutes: 30 }))), []);
    assert.deepEqual(messages(rules(tier({ intervalMinutes: 1440 }))), []);
    assert.match(messages(rules(tier({ intervalMinutes: 29 })))[0], /more often than every 30 minutes/);
    assert.match(messages(rules(tier({ intervalMinutes: 1441 })))[0], /at least every 24 hours/);
  });

  it("on-call: needed, and within 4 hours of overdue", () => {
    const at = (m: number) =>
      messages(rules(tier({ steps: [step("b", m, "inform_on_call"), step("c", 480, "report_missing")] })));
    assert.deepEqual(at(ORG_GUARDRAILS.onCallWithinMinutesOfOverdue), []);
    assert.match(at(ORG_GUARDRAILS.onCallWithinMinutesOfOverdue + 1)[0], /within 4 hours/);
    assert.match(
      messages(rules(tier({ steps: [step("c", 480, "report_missing")] })))[0],
      /needs an "Inform on-call" step/,
    );
  });

  it("report missing: needed, and within 12 hours of overdue", () => {
    const at = (m: number) =>
      messages(rules(tier({ steps: [step("b", 60, "inform_on_call"), step("c", m, "report_missing")] })));
    assert.deepEqual(at(720), []);
    assert.match(at(721)[0], /within 12 hours/);
  });

  it("the on-call limit counts from overdue for a last-seen tier too", () => {
    const lastSeen = (m: number) =>
      tier({
        clockStart: "last_seen",
        intervalMinutes: 240,
        steps: [step("b", m, "inform_on_call"), step("c", 600, "report_missing")],
      });
    // 4h interval + 4h limit = 8h since last seen is the latest allowed.
    assert.deepEqual(messages(rules(lastSeen(480))), []);
    assert.match(messages(rules(lastSeen(481)))[0], /within 4 hours/);
  });

  it("a last-seen step can't come before the check is due", () => {
    const m = messages(
      rules(
        tier({
          clockStart: "last_seen",
          intervalMinutes: 240,
          steps: [step("a", 180, "retry_contact"), step("b", 300, "inform_on_call"), step("c", 480, "report_missing")],
        }),
      ),
    );
    assert.equal(m.length, 1);
    assert.match(m[0], /comes before the check is due/);
  });

  it("at most 6 steps and 5 tiers; at least 1 tier", () => {
    const seven = tier({
      steps: [
        ...Array.from({ length: 5 }, (_, i) => step(`r${i}`, i * 10, "retry_contact")),
        step("b", 60, "inform_on_call"),
        step("c", 120, "report_missing"),
      ],
    });
    assert.match(messages(rules(seven))[0], /at most 6 steps/);
    const six = Array.from({ length: 6 }, (_, i) => tier({ key: `k${i}`, name: `Tier ${i}` }));
    assert.ok(messages(rules(...six)).some((m) => /at most 5 risk tiers/.test(m)));
    assert.deepEqual(messages(rules()), ["Add at least one risk tier."]);
  });

  it("tier names must be filled in and different", () => {
    assert.ok(messages(rules(tier(), tier({ key: "t2", name: "standard" }))).some((m) => /already has this name/.test(m)));
    assert.ok(messages(rules(tier({ name: "  " }))).some((m) => /give the tier a name/.test(m)));
  });

  it("every step needs an instruction", () => {
    const t = tier();
    t.steps[0] = { ...t.steps[0], instruction: " " };
    assert.match(messages(rules(t))[0], /add the instruction staff will see/);
  });

  it("can't remove a tier residents are still on; can remove an unused one", () => {
    assert.match(messages(rules(tier()), { gone: 2 })[0], /2 residents are on a tier you've removed/);
    assert.deepEqual(messages(rules(tier()), { gone: 0, t1: 3 }), []);
  });
});

describe("step timing", () => {
  it("converts last-seen times to minutes after due", () => {
    const t = tier({ clockStart: "last_seen", intervalMinutes: 180 });
    assert.equal(minutesAfterDue(t, { afterMinutes: 300 }), 120);
    assert.equal(minutesAfterDue(tier(), { afterMinutes: 300 }), 300);
  });

  it("sorts steps by when they come due, keeping ties in written order", () => {
    const t = tier({
      steps: [step("late", 120, "report_missing"), step("tie-1", 60, "inform_on_call"), step("tie-2", 60, "inform_manager"), step("first", 0, "retry_contact")],
    });
    assert.deepEqual(sortedSteps(t).map((s) => s.id), ["first", "tie-1", "tie-2", "late"]);
  });
});

describe("plain language", () => {
  it("reads a last-seen step the way a Missing Persons Procedure would", () => {
    const t = tier({ name: "Higher risk", clockStart: "last_seen", intervalMinutes: 180 });
    assert.equal(
      describeStep(t, step("b", 180, "inform_on_call")),
      "If someone on Higher risk hasn't been seen or contacted for 3 hours, staff are prompted to inform on-call.",
    );
  });

  it("reads a due-mode step with both times", () => {
    assert.equal(
      describeStep(tier(), step("b", 90, "inform_manager")),
      "If a check on Standard is 1 hour 30 minutes overdue (5 hours 30 minutes since last seen), staff are prompted to inform the manager.",
    );
  });

  it("formats durations", () => {
    assert.equal(formatMinutes(45), "45 minutes");
    assert.equal(formatMinutes(60), "1 hour");
    assert.equal(formatMinutes(1440), "24 hours");
    assert.equal(formatMinutes(61), "1 hour 1 minute");
  });
});

describe("parsing stored rules", () => {
  it("accepts a real config and rejects anything else", () => {
    assert.ok(parsePolicyConfig(DEFAULT_POLICY));
    assert.equal(parsePolicyConfig({ tiers: [{ key: "BAD KEY" }] }), null);
    assert.equal(parsePolicyConfig("nope"), null);
  });
});
