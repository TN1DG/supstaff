CREATE TYPE "public"."welfare_escalation_action" AS ENUM('retry_contact', 'inform_on_call', 'inform_manager', 'report_missing', 'other');--> statement-breakpoint
CREATE TYPE "public"."welfare_method" AS ENUM('in_person', 'door_knock', 'phone', 'message', 'other');--> statement-breakpoint
CREATE TYPE "public"."welfare_outcome" AS ENUM('seen', 'contacted', 'no_response');--> statement-breakpoint
CREATE TABLE "resident_welfare_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"tier_key" text NOT NULL,
	"contact_methods" "welfare_method"[] DEFAULT ARRAY[]::welfare_method[] NOT NULL,
	"how_to_check" text,
	"resident_involved" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_welfare_plan_resident_unique" UNIQUE("resident_id")
);
--> statement-breakpoint
CREATE TABLE "welfare_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expected_back_at" timestamp with time zone NOT NULL,
	"reason" text,
	"ended_at" timestamp with time zone,
	"ended_by_staff_id" uuid,
	"cancelled_at" timestamp with time zone,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"outcome" "welfare_outcome" NOT NULL,
	"method" "welfare_method" NOT NULL,
	"happened_at" timestamp with time zone NOT NULL,
	"staff_id" uuid NOT NULL,
	"note" text,
	"overdue_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_escalation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escalation_id" uuid NOT NULL,
	"step_id" text,
	"action" "welfare_escalation_action" NOT NULL,
	"note" text,
	"happened_at" timestamp with time zone NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"tier_key" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by_staff_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" uuid,
	"resolved_by_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"change_note" text NOT NULL,
	"review_due_on" date NOT NULL,
	"published_by_staff_id" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "welfare_policy_site_version_unique" UNIQUE("site_id","version")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "welfare_rules_deputy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_welfare_plans" ADD CONSTRAINT "resident_welfare_plans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_welfare_plans" ADD CONSTRAINT "resident_welfare_plans_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_welfare_plans" ADD CONSTRAINT "resident_welfare_plans_updated_by_staff_id_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_absences" ADD CONSTRAINT "welfare_absences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_absences" ADD CONSTRAINT "welfare_absences_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_absences" ADD CONSTRAINT "welfare_absences_ended_by_staff_id_staff_id_fk" FOREIGN KEY ("ended_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_absences" ADD CONSTRAINT "welfare_absences_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_contacts" ADD CONSTRAINT "welfare_contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_contacts" ADD CONSTRAINT "welfare_contacts_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_contacts" ADD CONSTRAINT "welfare_contacts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalation_actions" ADD CONSTRAINT "welfare_escalation_actions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalation_actions" ADD CONSTRAINT "welfare_escalation_actions_escalation_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."welfare_escalations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_opened_by_staff_id_staff_id_fk" FOREIGN KEY ("opened_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_resolved_by_staff_id_staff_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_policy_version_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."welfare_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_escalations" ADD CONSTRAINT "welfare_escalations_resolved_by_contact_fk" FOREIGN KEY ("resolved_by_contact_id") REFERENCES "public"."welfare_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_policy_versions" ADD CONSTRAINT "welfare_policy_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welfare_policy_versions" ADD CONSTRAINT "welfare_policy_versions_published_by_staff_id_staff_id_fk" FOREIGN KEY ("published_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resident_welfare_plans_site_idx" ON "resident_welfare_plans" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "welfare_absences_resident_starts_idx" ON "welfare_absences" USING btree ("resident_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "welfare_contacts_resident_happened_idx" ON "welfare_contacts" USING btree ("resident_id","happened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "welfare_contacts_site_created_idx" ON "welfare_contacts" USING btree ("site_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "welfare_escalation_actions_escalation_idx" ON "welfare_escalation_actions" USING btree ("escalation_id","happened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "welfare_escalation_one_open_idx" ON "welfare_escalations" USING btree ("resident_id") WHERE "welfare_escalations"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "welfare_escalations_site_opened_idx" ON "welfare_escalations" USING btree ("site_id","opened_at" DESC NULLS LAST);