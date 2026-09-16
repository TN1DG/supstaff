CREATE TYPE "public"."night_check_item_kind" AS ENUM('simple', 'resident_welfare');--> statement-breakpoint
CREATE TABLE "night_check_room_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"room_number" integer NOT NULL,
	"note" text,
	"last_edited_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_check_room_check_unique" UNIQUE("round_id","room_number")
);
--> statement-breakpoint
CREATE TABLE "night_check_room_situations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_check_id" uuid NOT NULL,
	"situation_type_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_check_room_situation_unique" UNIQUE("room_check_id","situation_type_id")
);
--> statement-breakpoint
CREATE TABLE "night_check_situation_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "night_check_template_items" ADD COLUMN "kind" "night_check_item_kind" DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "night_check_room_checks" ADD CONSTRAINT "night_check_room_checks_round_id_night_check_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."night_check_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_room_checks" ADD CONSTRAINT "night_check_room_checks_template_item_id_night_check_template_items_id_fk" FOREIGN KEY ("template_item_id") REFERENCES "public"."night_check_template_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_room_checks" ADD CONSTRAINT "night_check_room_checks_last_edited_by_staff_id_staff_id_fk" FOREIGN KEY ("last_edited_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_room_situations" ADD CONSTRAINT "night_check_room_situations_room_check_id_night_check_room_checks_id_fk" FOREIGN KEY ("room_check_id") REFERENCES "public"."night_check_room_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_room_situations" ADD CONSTRAINT "night_check_room_situations_situation_type_id_night_check_situation_types_id_fk" FOREIGN KEY ("situation_type_id") REFERENCES "public"."night_check_situation_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_check_situation_types" ADD CONSTRAINT "night_check_situation_types_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;