# Northstar University Management System

Northstar is a production-oriented university records and course-registration application built with Next.js 16, React 19, TypeScript, PostgreSQL, Drizzle ORM, Zod, and Argon2id. It replaces the original browser-only placeholder with authenticated server-rendered routes, normalized persistence, server-side authorization, transactional registration rules, accessible workflows, audit evidence, and repeatable quality gates.

All included people, institutions, IDs, addresses, courses, and metrics are clearly fictional development fixtures. This repository does not claim a production deployment or readiness for real student data without the operational work listed below.

## What is implemented

- Protected routes for dashboard, students, faculty, departments, course offerings, registrations, semesters, reports, notifications, audit, and settings.
- Opaque `HttpOnly`, `SameSite=Strict` sessions; Argon2id password verification; session rotation and logout revocation; generic authentication errors; bounded login throttling.
- Server-side administrator, staff, and viewer permissions. UI visibility is only a convenience; repositories and every mutation re-check authorization.
- PostgreSQL schema, migrations, foreign keys, uniqueness, checks, optimistic versions, soft archive fields, one-current-semester enforcement, registration transition guards, hard-delete guards, and append-only audit triggers.
- Transactional registration with an offering row lock and re-checks for student status, enrollment/standing eligibility, current semester, global/window switches, duplicate state, holds, prerequisite grades, schedule overlap, credit limit, and seat capacity.
- Deterministic waitlist ordering, next-eligible promotion on a registered-seat drop, queue renumbering, notifications, and audit entries in the same transaction.
- Allowlisted, formula-safe RFC 4180 CSV exports scoped to the signed-in user's permissions and current filters.
- Responsive keyboard-operable application shell, semantic tables and forms, light/dark preference, skip link, explicit empty/error/loading states, and 320 px layout support.
- Strict TypeScript, zero-warning ESLint, Prettier, Vitest, Playwright plus axe checks, dependency audit, and a pinned CI workflow with PostgreSQL.

## Architecture

```text
Browser
  -> Next.js App Router / Server Actions / Route Handlers
      -> authentication + same-origin mutation checks + RBAC + Zod commands
          -> UniversityRepository contract
              -> PostgreSQL adapter (production default)
              -> server-only deterministic demo adapter (local evaluation)
                  -> domain registration/metrics/CSV policies
```

Sensitive institutional state is not stored in browser storage. The only browser-persisted value is the non-sensitive light/dark theme preference. Demo state is also server-only, process-local, resets on restart, and is visibly labelled.

## Prerequisites

- Node.js `>=22.13 <23` or `>=24 <25`
- Corepack and pnpm `11.19.0`
- PostgreSQL 17 for persistent/integration mode; Docker Compose is optional for local setup

Only `pnpm-lock.yaml` is authoritative.

## Quick local demo

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Keep `DATA_MODE=demo`. Open `http://localhost:3000`. The synthetic accounts are:

- `admin@northstar.demo`
- `staff@northstar.demo`
- `viewer@northstar.demo`

The default local password is `DemoOnly!2026`, or the value of `DEMO_PASSWORD`. The demo adapter is intentionally ephemeral and is refused in production unless `ALLOW_DEMO_IN_PRODUCTION=true` is set explicitly.

## PostgreSQL setup

1. Start the local database:

   ```bash
   docker compose --env-file .env.local up -d postgres
   ```

2. Set `DATA_MODE=postgres`, `DATABASE_URL`, a random `SESSION_SECRET`, and the three `SEED_*_PASSWORD` values in `.env.local`.
3. Apply the committed migration:

   ```bash
   pnpm db:migrate
   ```

4. Optionally add the bounded synthetic fixtures:

   ```bash
   pnpm db:seed
   ```

   Seed accounts use `admin@northstar-demo.invalid`, `staff@northstar-demo.invalid`, and `viewer@northstar-demo.invalid`. The seed refuses production, refuses ambiguously named databases, and refuses remote targets without an explicit demo-only override. It is idempotent by fixed fixture IDs. A reset deletes only known fixture IDs and requires `SEED_RESET_CONFIRM=RESET_NORTHSTAR_DEMO_FIXTURES`; audit evidence is retained and fixture principals are preserved.

5. Start the application:

   ```bash
   pnpm dev
   ```

`GET /api/health` returns only bounded readiness, database, migration, mode, and check-time fields. Do not expose deeper database diagnostics publicly.

## Quality gates

```bash
pnpm check-format
pnpm lint
pnpm typecheck
pnpm test
pnpm audit
pnpm build
```

With migrated, seeded PostgreSQL:

```bash
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

The integration suite proves persisted RBAC, session revocation, database constraints, registration-window enforcement, re-registration, same-student schedule serialization, audit immutability, final-seat serialization, and waitlist promotion. Playwright exercises authentication, route reachability, role-specific controls, privacy-safe search and empty states, authorized/denied CSV export, administrator settings, waitlisting, authorization redirects, logout revocation, keyboard/mobile navigation, axe checks, and 320 px overflow. The current demo run is 24 passed with 2 intentional mobile-project skips for globally shared mutation scenarios.

## Environment contract

The complete variable contract is in [`.env.example`](/Users/admin/Downloads/student-registration-system-main/.env.example) and the operational preflight table is in [`docs/OPERATIONS.md`](/Users/admin/Downloads/student-registration-system-main/docs/OPERATIONS.md). The important boundary is:

- `DATA_MODE=demo` is synthetic, process-local evaluation data; `DATA_MODE=postgres` is required for persistence.
- PostgreSQL mode requires `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), and bounded `DATABASE_POOL_SIZE` (1–50).
- `DEMO_PASSWORD` and `SEED_*_PASSWORD` are setup-only synthetic credentials; never reuse production secrets.
- `ENABLE_HSTS` and `TRUST_PROXY` are opt-in deployment controls and require HTTPS/proxy review.

## Role matrix

| Role           | Reads                                 | Mutations                                                             | Exports                           | Administration                                             |
| -------------- | ------------------------------------- | --------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| Administrator  | Institutional records, reports, audit | Student/faculty/course lifecycle, registrations, settings, user roles | Allowed                           | Full controlled administration; cannot change its own role |
| Staff          | Institutional records and reports     | Permitted student/faculty/course lifecycle and registrations          | Allowed                           | No audit or user/role/security-setting administration      |
| Viewer/Auditor | Read-only records, reports, and audit | None                                                                  | Not granted by the default policy | None                                                       |

Every action, route handler, repository query, and export re-checks server-side capability. Search URLs accept only non-personal academic filters (program, department/rank, course, and term); names and institutional identifiers are not URL search inputs.

## Registration rules

Registration is one PostgreSQL transaction with settings, offering, and student serialization. It requires an active eligible student, open current-semester offering, enabled global switch, open term window, no duplicate/hold/prerequisite/schedule/credit violation, and available capacity. A full offering receives a deterministic waitlist position. Dropping a registered seat promotes the next still-eligible entry in the same transaction and writes the registration, notification, and audit evidence together. Database uniqueness, foreign keys, transition guards, capacity checks, and append-only audit triggers remain active even if a client is bypassed.

## Security and privacy boundary

- Treat the proxy and UI as defense-in-depth. The trusted enforcement point is the authenticated server action/route plus repository authorization and database constraints.
- Keep `SESSION_SECRET`, database credentials, and seed passwords in a managed secret store. Rotate them using an incident-aware runbook; changing `SESSION_SECRET` invalidates active cookies.
- Production always forces the session cookie's `Secure` flag and therefore requires HTTPS. Enable `ENABLE_HSTS` after HTTPS is verified. Set `TRUST_PROXY=true` only when the immediate proxy is trusted and overwrites forwarding headers.
- Grant the runtime database role only the required schema privileges. The migration makes audit updates/deletes/truncates fail and guards hard deletes; preserve those controls in role grants and future migrations.
- Export endpoints do not include hidden notes, email, phone, date of birth, hashes, or internal source metadata. Spreadsheet-significant strings are prefixed to prevent formula execution.
- Logs are structured and allowlisted. Do not add credentials, raw IP addresses, session tokens, student contact details, or request bodies to logs.
- Before real data: complete institutional privacy review, retention/deletion policy, data classification, legal basis/consent analysis, disaster-recovery test, accessibility review with disabled users, penetration test, incident response, and operator training.

## Migration, backup, and rollback operations

1. Back up the database before every migration. For PostgreSQL, use an encrypted `pg_dump` stored outside the application host and verify that a restore can be opened.
2. Apply migrations in a staging copy first; run integration/E2E checks against the migrated copy.
3. Migrations are forward-only by default. A rollback is a reviewed compensating migration plus application rollback—not an unreviewed destructive schema reversal.
4. Before promotion, record application artifact, migration journal state, backup identifier, and approver. After promotion, verify `/api/health`, login, an authorized read, an authorization denial, and audit persistence.
5. To restore, stop writes, restore into a clean database, validate constraints and the Drizzle journal, point a non-production instance at it, run smoke checks, then perform a controlled cutover.

Monitor authentication failure/rate-limit counts, 401/403/409/422/5xx rates, database pool saturation and query latency, registration transaction conflicts, waitlist promotions, export volume, audit-write failures, health readiness, and backup/restore age. Alerts should reference request IDs, never sensitive payloads.

For failed migration, registration-integrity, credential/session, backup, and audit incidents, follow the step-by-step procedures in [`docs/OPERATIONS.md`](/Users/admin/Downloads/student-registration-system-main/docs/OPERATIONS.md). Apply the reviewed runtime grants in [`ops/least-privilege.sql`](/Users/admin/Downloads/student-registration-system-main/ops/least-privilege.sql) after schema changes.

## Release checklist

Run the frozen install, formatting check, lint, strict typecheck, unit tests, migrated PostgreSQL integration tests, full dependency audit, production build, and desktop/mobile Playwright plus axe checks. Before real data, prove the runtime role cannot create schema objects, delete/truncate records, or update/delete audit rows; verify secure cookies and HTTPS; remove demo credentials/fixtures; complete privacy, accessibility, penetration, load, backup/restore, observability, incident-response, and approval gates. This repository has no automatic deployment or hosted resource configuration.

## Known boundaries

- No email/SMS provider, student self-service identity proofing, SIS/LMS/payment integration, multi-factor authentication, fine-grained row/department scoping, document uploads, or production deployment is configured.
- PostgreSQL integration requires an available server. The local deterministic adapter exists for UI evaluation only and is not durable or multi-process safe.
- Accessibility automation is a regression aid, not a substitute for manual screen-reader, zoom, keyboard, cognitive, and high-contrast testing.
- No software license is declared. Obtain owner approval before redistribution.
