-- Waking night checklist, phase C: night events and their escalation follow-ups.
CREATE TYPE "public"."follow_up_status" AS ENUM('open', 'done', 'not_done', 'na');--> statement-breakpoint
CREATE TYPE "public"."night_event_severity" AS ENUM('minor_managed', 'serious');--> statement-breakpoint
CREATE TYPE "public"."night_event_type" AS ENUM('emergency_repair', 'accident_incident', 'anti_social_behaviour', 'serious_incident', 'customer_unwell', 'staff_threatened');--> statement-breakpoint
CREATE TABLE "night_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"round_id" uuid,
	"type" "night_event_type" NOT NULL,
	"severity" "night_event_severity" DEFAULT 'minor_managed' NOT NULL,
	"resident_id" uuid,
	"location" text,
	"description" text NOT NULL,
	"police_attended" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"logged_by_staff_id" uuid,
	"maintenance_report_id" uuid,
	"handover_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"allow_na" boolean DEFAULT false NOT NULL,
	"choices" text[],
	"status" "follow_up_status" DEFAULT 'open' NOT NULL,
	"choice" text,
	"reason" text,
	"resolved_by_staff_id" uuid,
	"resolved_at" timestamp with time zone,
	"source_entity_type" text,
	"source_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_shift_id_waking_night_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."waking_night_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_round_id_night_check_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."night_check_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_logged_by_staff_id_staff_id_fk" FOREIGN KEY ("logged_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_maintenance_report_id_maintenance_reports_id_fk" FOREIGN KEY ("maintenance_report_id") REFERENCES "public"."maintenance_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_events" ADD CONSTRAINT "night_events_handover_id_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."handovers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_follow_ups" ADD CONSTRAINT "shift_follow_ups_shift_id_waking_night_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."waking_night_shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_follow_ups" ADD CONSTRAINT "shift_follow_ups_event_id_night_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."night_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_follow_ups" ADD CONSTRAINT "shift_follow_ups_resolved_by_staff_id_staff_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "night_events_shift_idx" ON "night_events" USING btree ("shift_id","occurred_at");--> statement-breakpoint
CREATE INDEX "shift_follow_ups_shift_idx" ON "shift_follow_ups" USING btree ("shift_id");