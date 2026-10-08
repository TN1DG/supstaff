-- Waking night checklist, phase A: per-service settings, shift header,
-- checklist results, and timeliness/floors/observations on welfare rounds.
-- ADD VALUE is safe in a transaction on PG 12+ as long as nothing in the same
-- transaction uses 'scheduled'.
CREATE TYPE "public"."checklist_result_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."checklist_result_status" AS ENUM('done', 'not_done', 'na');--> statement-breakpoint
CREATE TYPE "public"."round_timeliness" AS ENUM('on_time', 'late', 'missed');--> statement-breakpoint
CREATE TYPE "public"."waking_night_shift_status" AS ENUM('open', 'signed_off');--> statement-breakpoint
ALTER TYPE "public"."night_check_round_status" ADD VALUE 'scheduled' BEFORE 'in_progress';--> statement-breakpoint
CREATE TABLE "shift_checklist_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"status" "checklist_result_status" NOT NULL,
	"source" "checklist_result_source" DEFAULT 'manual' NOT NULL,
	"source_entity_type" text,
	"source_entity_id" uuid,
	"reason" text,
	"resolved_by_staff_id" uuid,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_checklist_result_unique" UNIQUE("shift_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"round_times" text[],
	"round_tolerance_minutes" integer,
	"evening_med_rounds" text[],
	"ooh_repairs_phone" text,
	"on_call_manager_phone" text,
	"emergency_phone" text,
	"nhs_phone" text,
	"police_non_emergency_phone" text,
	"has_lone_worker_device" boolean,
	"team_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "waking_night_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"shift_date" date NOT NULL,
	"started_by_staff_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "waking_night_shift_status" DEFAULT 'open' NOT NULL,
	"signed_off_at" timestamp with time zone,
	"signed_off_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waking_night_shift_unique" UNIQUE("site_id","shift_date")
);
--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD COLUMN "floors_covered" integer[];--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD COLUMN "observations" text;--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD COLUMN "timeliness" "round_timeliness";--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD COLUMN "timeliness_reason" text;--> statement-breakpoint
ALTER TABLE "shift_checklist_results" ADD CONSTRAINT "shift_checklist_results_shift_id_waking_night_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."waking_night_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_checklist_results" ADD CONSTRAINT "shift_checklist_results_resolved_by_staff_id_staff_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waking_night_shifts" ADD CONSTRAINT "waking_night_shifts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waking_night_shifts" ADD CONSTRAINT "waking_night_shifts_started_by_staff_id_staff_id_fk" FOREIGN KEY ("started_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waking_night_shifts" ADD CONSTRAINT "waking_night_shifts_signed_off_by_staff_id_staff_id_fk" FOREIGN KEY ("signed_off_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;