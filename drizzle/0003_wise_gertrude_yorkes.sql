CREATE TYPE "public"."night_check_item_status" AS ENUM('ok', 'attention', 'na');--> statement-breakpoint
CREATE TYPE "public"."night_check_round_status" AS ENUM('in_progress', 'complete', 'missed');--> statement-breakpoint
CREATE TABLE "night_check_item_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"status" "night_check_item_status",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_check_item_unique" UNIQUE("round_id","template_item_id")
);
--> statement-breakpoint
CREATE TABLE "night_check_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"check_date" date NOT NULL,
	"round_time" text NOT NULL,
	"staff_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_staff_id" uuid,
	"status" "night_check_round_status" DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_check_round_unique" UNIQUE("site_id","check_date","round_time")
);
--> statement-breakpoint
CREATE TABLE "night_check_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"area" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "night_check_item_results" ADD CONSTRAINT "night_check_item_results_round_id_night_check_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."night_check_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_item_results" ADD CONSTRAINT "night_check_item_results_template_item_id_night_check_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."night_check_template_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD CONSTRAINT "night_check_rounds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD CONSTRAINT "night_check_rounds_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_rounds" ADD CONSTRAINT "night_check_rounds_completed_by_staff_id_staff_id_fk" FOREIGN KEY ("completed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_template_items" ADD CONSTRAINT "night_check_template_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;