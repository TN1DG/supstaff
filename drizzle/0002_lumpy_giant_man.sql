-- Moving to one handover per shift: collapse any pre-existing duplicate
-- handovers for the same (site, date, shift), keeping the oldest. Child rows
-- (entries / addenda / acknowledgements) cascade; outbox rows are cleared first.
DELETE FROM "outbox" WHERE "entity_type" = 'handover' AND "entity_id" IN (
  SELECT h.id::text FROM "handovers" h
  WHERE h.id <> (
    SELECT h2.id FROM "handovers" h2
    WHERE h2.site_id = h.site_id
      AND h2.handover_date = h.handover_date
      AND h2.shift = h.shift
    ORDER BY h2.created_at ASC, h2.id ASC
    LIMIT 1
  )
);--> statement-breakpoint
DELETE FROM "handovers" h
WHERE h.id <> (
  SELECT h2.id FROM "handovers" h2
  WHERE h2.site_id = h.site_id
    AND h2.handover_date = h.handover_date
    AND h2.shift = h.shift
  ORDER BY h2.created_at ASC, h2.id ASC
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "handovers" DROP CONSTRAINT "handovers_date_shift_author";--> statement-breakpoint
ALTER TABLE "handover_resident_entries" ADD COLUMN "last_edited_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "handovers" ADD COLUMN "general_notes_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "handovers" ADD COLUMN "general_notes_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "handovers" ADD COLUMN "submitted_by_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "handover_resident_entries" ADD CONSTRAINT "handover_resident_entries_last_edited_by_staff_id_staff_id_fk" FOREIGN KEY ("last_edited_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_general_notes_by_staff_id_staff_id_fk" FOREIGN KEY ("general_notes_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_submitted_by_staff_id_staff_id_fk" FOREIGN KEY ("submitted_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_site_date_shift" UNIQUE("site_id","handover_date","shift");