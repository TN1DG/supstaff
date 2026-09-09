@AGENTS.md

# Supstaff

See `README.md` for setup and `~/.claude/plans/supstaff-is-an-app-velvet-harbor.md`
for the full build plan.

## Conventions

- **Auth / roles**: server code uses `requireStaff` / `requireRole` / `assertRole`
  from `@/lib/rbac`. Client components import role constants from `@/lib/roles`
  only (never `@/lib/rbac` — it pulls in argon2 and the DB).
- **Mutations**: server actions in a `actions.ts` next to the route. Every
  create/update/delete wraps the write **and** `writeAudit(tx, …)` in one
  `db.transaction(…)`. Validate input with zod. Return a typed `…State` for
  `useActionState`.
- **External systems** (Salesforce, Saw-it, email): never call inline. Enqueue
  with `enqueueOutbox(tx, …)` in the same transaction; a cron drains it.
- **DB**: `getDb()` from `@/db` (lazy singleton — never wrap in a Proxy).
  `casing: "snake_case"` so schema uses camelCase, DB uses snake_case.
- **UI**: shadcn/ui (radix base) in `src/components/ui`. Theme tokens in
  `globals.css` — sage-green primary, amber/coral for alerts, never a harsh red.
  Desktop-first. Forms: server action + `useActionState`, no react-hook-form.
- Run `npm run typecheck && npm run lint && npm run build` before calling a
  change done.
