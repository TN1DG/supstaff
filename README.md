# Supstaff

A calm, welcoming desktop web app for support staff in a supported-living
service — handovers, medication (eMAR), night building checks and maintenance
reports in one place, with every action timestamped and auditable for the
manager.

Built with Next.js 16 (App Router) · Drizzle ORM · Neon Postgres · Auth.js ·
Tailwind + shadcn/ui, deployed on Vercel.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Foundation: auth, roles, staff + residents, audit log, outbox, design system | **built** |
| 1 | Handovers | **built** |
| 2 | Night building checks | **built** |
| 3 | Full eMAR | next |
| 4 | Maintenance capture + forward to Saw-it | planned |
| 5 | Salesforce / Saw-it API integration + manager insights | planned |

Full plan: `~/.claude/plans/supstaff-is-an-app-velvet-harbor.md`

## Local setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Database** — provision Neon via the Vercel Marketplace (one-time browser
   step to accept terms), then pull env vars:

   ```bash
   vercel integration add neon
   vercel env pull .env.local
   ```

   Or point `DATABASE_URL` in `.env.local` at any Postgres 15+ instance.

3. **Env** — copy `.env.example` to `.env.local` and fill in `AUTH_SECRET`
   (`openssl rand -base64 32`). `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN` come
   from Vercel.

4. **Schema + seed**

   ```bash
   npm run db:push          # create tables
   npm run seed             # create the first site + manager account
   npm run seed -- --demo   # ...also add a few demo residents
   ```

   The seed prints a temporary manager password. Sign in, set your own
   password, then add staff and residents from the app.

5. **Run**

   ```bash
   npm run dev
   ```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Push schema to the database |
| `npm run db:generate` | Generate a SQL migration from schema changes |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed` | Seed site + manager (`-- --demo` for demo data) |

## Roles

- **Bank staff** — temporary/agency. Operational tasks only; cannot edit
  residents, templates, medication setup or other staff. Optional engagement
  end-date auto-deactivates the account.
- **Support officer** — permanent staff. All operational tasks; can edit
  resident day-to-day info and be a key worker.
- **Manager** — full access, including staff management, the audit log and
  (later) insights. Holds the technical `admin` flag.

Actions that must be legally attributable (handover submit, night-check
complete, medication sign-off) additionally require a short **signing PIN**
so staff can confirm identity quickly on a shared office desktop.

## Key directories

```
src/
  db/            Drizzle schema + lazy client
  lib/           auth, rbac, audit, outbox, roles, nav
  app/
    login/ welcome/ denied/     Auth flows
    (app)/                       Authenticated shell + features
      residents/  staff/  audit/  account/  design/
      handovers/ medication/ night-checks/ maintenance/ insights/
    api/auth/  api/cron/outbox/
  proxy.ts       Lightweight auth gate (real checks live in layouts/actions)
```
