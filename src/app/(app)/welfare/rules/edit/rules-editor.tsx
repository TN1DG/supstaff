"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/form-error";
import { PinField } from "@/components/pin-field";
import {
  ACTION_LABEL,
  CLOCK_START_LABEL,
  ESCALATION_ACTIONS,
  ORG_GUARDRAILS,
  describeStep,
  describeTier,
  newPolicyId,
  sortedSteps,
  validatePolicy,
  type ClockStart,
  type EscalationAction,
  type PolicyStep,
  type PolicyTier,
  type WelfarePolicyConfig,
} from "@/lib/welfare-policy";
import {
  previewWelfareRules,
  publishWelfareRules,
  type PublishRulesState,
  type RulesPreview,
} from "../actions";

export function RulesEditor({
  initial,
  basisVersion,
  residentsOnTier,
  timeZone,
  defaultReviewDue,
  minReviewDate,
  maxReviewDate,
}: {
  initial: WelfarePolicyConfig;
  basisVersion: number;
  residentsOnTier: Record<string, number>;
  timeZone: string;
  defaultReviewDue: string;
  minReviewDate: string;
  maxReviewDate: string;
}) {
  const [config, setConfig] = useState<WelfarePolicyConfig>(() => structuredClone(initial));
  const issues = useMemo(() => validatePolicy(config, residentsOnTier), [config, residentsOnTier]);
  const [state, formAction, publishing] = useActionState<PublishRulesState, FormData>(
    publishWelfareRules,
    {},
  );
  const [preview, setPreview] = useState<RulesPreview | null>(null);
  const [previewing, startPreview] = useTransition();
  const changed = JSON.stringify(config) !== JSON.stringify(initial);

  const setTier = (ti: number, patch: Partial<PolicyTier>) => {
    setPreview(null);
    setConfig((c) => ({ tiers: c.tiers.map((t, i) => (i === ti ? { ...t, ...patch } : t)) }));
  };
  const setStep = (ti: number, si: number, patch: Partial<PolicyStep>) =>
    setTier(ti, {
      steps: config.tiers[ti].steps.map((s, i) => (i === si ? { ...s, ...patch } : s)),
    });

  const addTier = () => {
    setPreview(null);
    setConfig((c) => ({
      tiers: [
        ...c.tiers,
        {
          key: newPolicyId("tier"),
          name: "",
          intervalMinutes: 8 * 60,
          clockStart: "due",
          steps: [
            { id: newPolicyId("step"), afterMinutes: 0, action: "retry_contact", instruction: "" },
            { id: newPolicyId("step"), afterMinutes: 60, action: "inform_on_call", instruction: "" },
            { id: newPolicyId("step"), afterMinutes: 6 * 60, action: "report_missing", instruction: "" },
          ],
        },
      ],
    }));
  };

  const peak = (r: { peak: number; peakAt: string | null } | null | undefined) =>
    !r
      ? "—"
      : r.peak === 0
        ? "none"
        : `${r.peak} at ${new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(r.peakAt!))}`;
  const needing = (n?: { overdue: number; escalating: number }) => (n ? n.overdue + n.escalating : 0);

  return (
    <div className="space-y-6">
      {config.tiers.map((tier, ti) => (
        <TierEditor
          key={tier.key}
          tier={tier}
          index={ti}
          inUse={residentsOnTier[tier.key] ?? 0}
          issues={issues.filter((i) => i.path === `tiers.${ti}` || i.path.startsWith(`tiers.${ti}.`))}
          onChange={(patch) => setTier(ti, patch)}
          onStepChange={(si, patch) => setStep(ti, si, patch)}
          onRemove={() => {
            setPreview(null);
            setConfig((c) => ({ tiers: c.tiers.filter((_, i) => i !== ti) }));
          }}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addTier}
        disabled={config.tiers.length >= ORG_GUARDRAILS.maxTiers}
      >
        <Plus aria-hidden />
        Add a risk tier
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check before publishing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-4" aria-hidden />
              Inside the organisation limits.
            </p>
          ) : (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>
                Fix {issues.length === 1 ? "this" : `these ${issues.length}`} before publishing
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-0.5 pl-4">
                  {issues
                    .filter((i) => i.path === "rules")
                    .concat(issues.filter((i) => i.path !== "rules"))
                    .map((i, n) => (
                      <li key={n}>{i.message}</li>
                    ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">How would these rules play out?</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={previewing}
                onClick={() =>
                  startPreview(async () => setPreview(await previewWelfareRules(JSON.stringify(config))))
                }
              >
                <RefreshCw aria-hidden className={previewing ? "animate-spin" : ""} />
                {preview ? "Check again" : "Check against the last 24 hours"}
              </Button>
            </div>
            {preview?.error ? <p className="text-destructive">{preview.error}</p> : null}
            {preview?.draft ? (
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_auto_auto]">
                <dt className="text-muted-foreground" />
                <dd className="text-xs font-medium text-muted-foreground">These rules</dd>
                <dd className="text-xs font-medium text-muted-foreground">Current rules</dd>
                <dt className="text-muted-foreground">Needing action right now</dt>
                <dd className="font-medium">{needing(preview.draft.now)}</dd>
                <dd>{preview.current ? needing(preview.current.now) : "—"}</dd>
                <dt className="text-muted-foreground">Most at once, last 24 hours</dt>
                <dd className="font-medium">{peak(preview.draft)}</dd>
                <dd>{peak(preview.current)}</dd>
              </dl>
            ) : (
              <p className="text-muted-foreground">
                Replays the last day&rsquo;s real checks under these rules, so you can see whether a
                night&rsquo;s staffing could keep up before anyone is held to them.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Publish</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="config" value={JSON.stringify(config)} />
            <input type="hidden" name="basisVersion" value={basisVersion} />

            <div className="space-y-1.5">
              <Label htmlFor="changeNote">What changed and why</Label>
              <Textarea
                id="changeNote"
                name="changeNote"
                rows={2}
                maxLength={500}
                required
                placeholder={
                  basisVersion === 0
                    ? "e.g. First version, agreed with residents at the house meeting on 14 Oct"
                    : "e.g. Higher risk now informs on-call after 1 hour, not 2"
                }
              />
              <p className="text-xs text-muted-foreground">Staff see this on the welfare board.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reviewDueOn">Review by</Label>
                <Input
                  id="reviewDueOn"
                  name="reviewDueOn"
                  type="date"
                  defaultValue={defaultReviewDue}
                  min={minReviewDate}
                  max={maxReviewDate}
                  required
                  className="w-auto"
                />
              </div>
              <div className="space-y-1.5">
                <PinField />
              </div>
            </div>

            {state.issues && state.issues.length > 0 ? (
              <FormError message={state.issues.map((i) => i.message).join(" ")} />
            ) : null}
            <FormError message={state.error} />
            {state.conflict ? (
              <Alert variant="warning">
                <RefreshCw />
                <AlertTitle>The rules changed while you were editing</AlertTitle>
                <AlertDescription>
                  {state.conflict}{" "}
                  <Link href="/welfare/rules/edit" className="underline" prefetch={false}>
                    Reload
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={publishing || issues.length > 0}>
                {publishing ? "Publishing…" : basisVersion === 0 ? "Publish version 1" : `Publish version ${basisVersion + 1}`}
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/welfare/rules">Cancel</Link>
              </Button>
              {basisVersion > 0 && !changed ? (
                <span className="text-xs text-muted-foreground">
                  No changes — publishing again just records a review.
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TierEditor({
  tier,
  index,
  inUse,
  issues,
  onChange,
  onStepChange,
  onRemove,
}: {
  tier: PolicyTier;
  index: number;
  inUse: number;
  issues: { path: string; message: string }[];
  onChange: (patch: Partial<PolicyTier>) => void;
  onStepChange: (si: number, patch: Partial<PolicyStep>) => void;
  onRemove: () => void;
}) {
  const id = (s: string) => `t${index}-${s}`;
  const timeLabel = tier.clockStart === "last_seen" ? "Since last seen" : "After overdue";

  return (
    <Card className={issues.length > 0 ? "border-warning/60" : undefined}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{tier.name.trim() || `Tier ${index + 1}`}</CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {inUse} resident{inUse === 1 ? "" : "s"} on this tier
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={inUse > 0}
            title={inUse > 0 ? "Move residents to another tier in their welfare plan first" : undefined}
          >
            <Trash2 aria-hidden />
            Remove tier
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={id("name")}>Tier name</Label>
            <Input
              id={id("name")}
              value={tier.name}
              maxLength={60}
              placeholder="e.g. Higher risk"
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Seen or contacted at least every</Label>
            <DurationInput
              idPrefix={id("interval")}
              minutes={tier.intervalMinutes}
              onChange={(m) => onChange({ intervalMinutes: m })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("clock")}>Step times are written as</Label>
            <Select
              value={tier.clockStart}
              onValueChange={(v) => {
                const clockStart = v as ClockStart;
                if (clockStart === tier.clockStart) return;
                // Keep every step at the same real moment when switching.
                const shift = clockStart === "last_seen" ? tier.intervalMinutes : -tier.intervalMinutes;
                onChange({
                  clockStart,
                  steps: tier.steps.map((s) => ({ ...s, afterMinutes: Math.max(0, s.afterMinutes + shift) })),
                });
              }}
            >
              <SelectTrigger id={id("clock")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_seen">{CLOCK_START_LABEL.last_seen}</SelectItem>
                <SelectItem value="due">{CLOCK_START_LABEL.due}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Escalation steps</p>
          {tier.steps.map((step, si) => (
            <div
              key={step.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[auto_12rem_1fr_auto] sm:items-start"
            >
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{timeLabel}</Label>
                <DurationInput
                  idPrefix={id(`step${si}`)}
                  minutes={step.afterMinutes}
                  onChange={(m) => onStepChange(si, { afterMinutes: m })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id(`action${si}`)} className="text-xs text-muted-foreground">
                  Step
                </Label>
                <Select
                  value={step.action}
                  onValueChange={(v) => onStepChange(si, { action: v as EscalationAction })}
                >
                  <SelectTrigger id={id(`action${si}`)} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCALATION_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {ACTION_LABEL[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id(`instruction${si}`)} className="text-xs text-muted-foreground">
                  What staff see
                </Label>
                <Textarea
                  id={id(`instruction${si}`)}
                  rows={2}
                  maxLength={500}
                  value={step.instruction}
                  placeholder="e.g. Phone on-call. Say who it is, when they were last seen and what you've tried."
                  onChange={(e) => onStepChange(si, { instruction: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="sm:mt-6"
                aria-label={`Remove step ${si + 1}`}
                onClick={() => onChange({ steps: tier.steps.filter((_, i) => i !== si) })}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={tier.steps.length >= ORG_GUARDRAILS.maxStepsPerTier}
            onClick={() =>
              onChange({
                steps: [
                  ...tier.steps,
                  {
                    id: newPolicyId("step"),
                    afterMinutes:
                      (tier.steps.length ? Math.max(...tier.steps.map((s) => s.afterMinutes)) : 0) + 60,
                    action: "other",
                    instruction: "",
                  },
                ],
              })
            }
          >
            <Plus aria-hidden />
            Add step
          </Button>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="mb-1 font-medium">In plain words</p>
          <p className="text-muted-foreground">{describeTier(tier)}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {sortedSteps(tier).map((s) => (
              <li key={s.id}>{describeStep(tier, s)}</li>
            ))}
          </ul>
        </div>

        {issues.length > 0 ? (
          <ul className="space-y-0.5 text-sm text-warning-foreground">
            {issues.map((i, n) => (
              <li key={n} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {i.message}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DurationInput({
  idPrefix,
  minutes,
  onChange,
}: {
  idPrefix: string;
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const num = (v: string, max: number) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Input
        id={`${idPrefix}-h`}
        type="number"
        inputMode="numeric"
        min={0}
        max={336}
        value={h}
        aria-label="Hours"
        className="w-16"
        onChange={(e) => onChange(num(e.target.value, 336) * 60 + m)}
      />
      <span className="text-muted-foreground">h</span>
      <Input
        id={`${idPrefix}-m`}
        type="number"
        inputMode="numeric"
        min={0}
        max={55}
        step={5}
        value={m}
        aria-label="Minutes"
        className="w-16"
        onChange={(e) => onChange(h * 60 + num(e.target.value, 59))}
      />
      <span className="text-muted-foreground">m</span>
    </div>
  );
}
