-- Phase 4: housing officer role + building reports.
-- The IF NOT EXISTS indexes date from commit 52154b9 (applied via db:push, never generated).
CREATE TYPE "public"."maintenance_category" AS ENUM('plumbing', 'electrical', 'heating', 'fire_safety', 'security', 'structural', 'appliance', 'grounds', 'other');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('open', 'acknowledged', 'in_progress', 'resolved');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'housing_officer';--> statement-breakpoint
CREATE TABLE "maintenance_report_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"staff_id" uuid,
	"from_status" "maintenance_status",
	"to_status" "maintenance_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text NOT NULL,
	"room_number" integer,
	"category" "maintenance_category" DEFAULT 'other' NOT NULL,
	"priority" "maintenance_priority" DEFAULT 'normal' NOT NULL,
	"status" "maintenance_status" DEFAULT 'open' NOT NULL,
	"reported_by_staff_id" uuid,
	"source_item_result_id" uuid,
	"assigned_to" text,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_report_source_unique" UNIQUE("source_item_result_id")
);
--> statement-breakpoint
ALTER TABLE "maintenance_report_updates" ADD CONSTRAINT "maintenance_report_updates_report_id_maintenance_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."maintenance_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_report_updates" ADD CONSTRAINT "maintenance_report_updates_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "maintenance_reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "maintenance_reports_reported_by_staff_id_staff_id_fk" FOREIGN KEY ("reported_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "maintenance_reports_source_item_result_id_night_check_item_results_id_fk" FOREIGN KEY ("source_item_result_id") REFERENCES "public"."night_check_item_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_reports" ADD CONSTRAINT "maintenance_reports_resolved_by_staff_id_staff_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_report_updates_report_idx" ON "maintenance_report_updates" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "maintenance_reports_site_status_created_idx" ON "maintenance_reports" USING btree ("site_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "maintenance_reports_site_created_idx" ON "maintenance_reports" USING btree ("site_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_site_at_idx" ON "audit_log" USING btree ("site_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "handovers_site_status_submitted_idx" ON "handovers" USING btree ("site_id","status","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_admin_site_date_idx" ON "medication_administrations" USING btree ("site_id","scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_admin_resident_idx" ON "medication_administrations" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_reason_code_site_active_idx" ON "medication_reason_codes" USING btree ("site_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medications_site_active_prn_idx" ON "medications" USING btree ("site_id","active","is_prn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medications_resident_idx" ON "medications" USING btree ("resident_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "night_check_situation_site_active_idx" ON "night_check_situation_types" USING btree ("site_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "night_check_template_site_active_idx" ON "night_check_template_items" USING btree ("site_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_status_created_idx" ON "outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_entity_idx" ON "outbox" USING btree ("entity_type","entity_id","target");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "residents_site_status_idx" ON "residents" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_site_active_idx" ON "staff" USING btree ("site_id","active");