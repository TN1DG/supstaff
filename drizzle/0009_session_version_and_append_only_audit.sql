ALTER TABLE "staff" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Audit log is append-only in the database itself, not just by convention in
-- app code. UPDATE, DELETE and TRUNCATE are refused, with one exception: the
-- ON DELETE SET NULL foreign keys (site_id, actor_staff_id) may null their own
-- column once the referenced site/staff row is actually gone. Nothing else on
-- the row may change. Rows keep actor_name, so attribution survives.
CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW."id", NEW."actor_name", NEW."action", NEW."entity_type", NEW."entity_id",
         NEW."before", NEW."after", NEW."ip", NEW."user_agent", NEW."at")
        IS NOT DISTINCT FROM
        (OLD."id", OLD."actor_name", OLD."action", OLD."entity_type", OLD."entity_id",
         OLD."before", OLD."after", OLD."ip", OLD."user_agent", OLD."at")
    AND (NEW."site_id" IS NOT DISTINCT FROM OLD."site_id"
         OR (NEW."site_id" IS NULL
             AND NOT EXISTS (SELECT 1 FROM "sites" WHERE "id" = OLD."site_id")))
    AND (NEW."actor_staff_id" IS NOT DISTINCT FROM OLD."actor_staff_id"
         OR (NEW."actor_staff_id" IS NULL
             AND NOT EXISTS (SELECT 1 FROM "staff" WHERE "id" = OLD."actor_staff_id")))
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
