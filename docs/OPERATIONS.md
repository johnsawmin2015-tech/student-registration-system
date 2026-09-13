# Operations runbook

## Scope and evidence boundary

This runbook covers the Northstar University Management System as implemented in this
repository. It is deployment-neutral: no cloud account, production database, public domain,
secret store, backup service, monitoring service, on-call rota, or production release is
configured or evidenced here.

Use this document with the [security architecture and threat model](./SECURITY-ARCHITECTURE.md)
and the reviewed [PostgreSQL runtime-role grant template](../ops/least-privilege.sql). Do not
load real student or faculty data until every applicable production launch gate in the threat
model has an accountable owner and recorded evidence.

The deterministic demo adapter is synthetic, process-local, non-durable, and unsafe for
multi-instance operation. PostgreSQL 17 is the production-oriented data adapter.

## Organization-supplied operating record

The deploying organization must replace these placeholders in its controlled runbook or
release record. They are not configuration supplied by this repository.

| Required input                                | Organization-supplied value            |
| --------------------------------------------- | -------------------------------------- |
| Service owner                                 | `<service-owner>`                      |
| Release approver                              | `<release-approver>`                   |
| Database owner/on-call                        | `<database-owner>`                     |
| Security on-call                              | `<security-on-call>`                   |
| Privacy/records owner                         | `<privacy-owner>`                      |
| Accessibility owner                           | `<accessibility-owner>`                |
| Incident commander/on-call route              | `<incident-commander-or-rota>`         |
| Incident channel and evidence location        | `<incident-channel-and-record-system>` |
| User/status communication owner               | `<communications-owner>`               |
| Production URL and region/residency           | `<production-url-and-approved-region>` |
| Runtime artifact identifier/digest            | `<artifact-id-and-digest>`             |
| Database migration identity                   | `<migration-role>`                     |
| Application runtime identity                  | `<runtime-role>`                       |
| Backup/restore identity and key owner         | `<backup-role-and-key-owner>`          |
| RPO, RTO, retention, and restore-test cadence | `<approved-recovery-objectives>`       |
| Monitoring destination and alert thresholds   | `<monitoring-system-and-thresholds>`   |
| Escalation contacts and response SLAs         | `<severity-matrix-and-contacts>`       |

Use separate identities for runtime access, migrations/seeding, and backup/restore. The
application runtime must not own the database, schema, tables, functions, or migration journal.

## Local evaluation

### Prerequisites

- Node.js `>=22.13 <23` or `>=24 <25`.
- Corepack with pnpm `11.19.0`.
- PostgreSQL 17 for persistent or integration mode. Docker Compose is optional and only
  provisions the repository's local development database.
- `pnpm-lock.yaml` is the only authoritative dependency lockfile.

### Server-only demo mode

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Leave `DATA_MODE=demo` and open `http://localhost:3000`. The synthetic accounts are:

- `admin@northstar.demo`
- `staff@northstar.demo`
- `viewer@northstar.demo`

Their default local password is `DemoOnly!2026`, or the locally configured `DEMO_PASSWORD`.
Restarting the process resets demo state. Never treat the demo adapter as persistence, a
concurrency test target, or production evidence. Production rejects it unless the explicit
`ALLOW_DEMO_IN_PRODUCTION=true` escape hatch is set; production policy should prohibit that
escape hatch.

Check the bounded health response:

```bash
curl --fail-with-body http://127.0.0.1:3000/api/health
```

Demo mode should return HTTP 200 with `status: "ready"`, `mode: "demo"`, and
`database`/`migrations` set to `"not-applicable"`.

### Local PostgreSQL mode

1. Copy the example environment file and set local-only values:

   ```bash
   cp .env.example .env.local
   ```

   Set `DATA_MODE=postgres`; make `DATABASE_URL` agree with `POSTGRES_DB`, `POSTGRES_USER`,
   `POSTGRES_PASSWORD`, and `POSTGRES_PORT`; replace `SESSION_SECRET` with at least 32 random
   characters; and replace all three `SEED_*_PASSWORD` values with distinct local fixture
   passwords of at least 14 characters.

2. Start the bound-to-loopback PostgreSQL 17 container and wait for its health check:

   ```bash
   docker compose --env-file .env.local up -d postgres
   docker compose --env-file .env.local ps postgres
   ```

3. Apply the committed migrations with the local database-owner credential:

   ```bash
   pnpm db:migrate
   ```

4. Optionally load deterministic, fictional fixtures:

   ```bash
   pnpm db:seed
   ```

   The PostgreSQL fixture accounts are `admin@northstar-demo.invalid`,
   `staff@northstar-demo.invalid`, and `viewer@northstar-demo.invalid`. Seeding is idempotent by
   fixed fixture IDs. The command refuses `NODE_ENV=production`, a database name that does not
   contain `demo`, `development`, `dev`, or `test`, and a remote target unless the exact
   demo-only override is present.

5. Start and verify the application:

   ```bash
   pnpm dev
   curl --fail-with-body http://127.0.0.1:3000/api/health
   ```

   PostgreSQL mode should return HTTP 200 with `status: "ready"`, `mode: "postgres"`,
   `database: "connected"`, and `migrations: "current"`.

6. Stop the local database without deleting its named volume:

   ```bash
   docker compose --env-file .env.local stop postgres
   ```

### Reset only known synthetic fixtures

Use reset only on a verified demo/development/test target. The reset transaction removes known
fixture IDs, preserves append-only audit events and the principals they reference, records the
reset, and seeds the fixtures again.

```bash
SEED_RESET_CONFIRM=RESET_NORTHSTAR_DEMO_FIXTURES pnpm db:seed
```

The script deliberately does not provide a general database wipe. Do not use the hard-delete
maintenance setting or ad hoc SQL as a substitute.

## Environment contract and preflight

Next.js loads its normal environment files. The standalone migration and seed scripts load the
first existing file from `.env.local` and `.env`, without replacing variables already exported
by CI or the invoking shell. Production should inject values through the organization's managed
secret/configuration system rather than ship a populated environment file.

| Variable                          | Validation or behavior                                                               | Operational requirement                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `DATA_MODE`                       | Only `demo` or `postgres`; defaults to `postgres` in production and `demo` otherwise | Set explicitly to `postgres` for every real deployment                                                       |
| `ALLOW_DEMO_IN_PRODUCTION`        | Exact `true` permits an otherwise rejected production demo process                   | Leave absent/`false`; deny it in deployment policy                                                           |
| `DATABASE_URL`                    | Required in PostgreSQL mode                                                          | Use the non-owner runtime credential, private networking, and database TLS in production                     |
| `DATABASE_POOL_SIZE`              | Integer from 1 through 50; defaults to 10                                            | Size against instance count and PostgreSQL connection limits                                                 |
| `SESSION_SECRET`                  | Minimum 32 characters outside local non-production demo mode                         | Generate high entropy, store as a secret, restrict access, and rotate through the session incident procedure |
| `SESSION_COOKIE_SECURE`           | Optional for local testing; production forces secure cookies regardless              | Production requires HTTPS; do not interpret this setting as TLS configuration                                |
| `ENABLE_HSTS`                     | Exact `true` adds HSTS and upgrades CSP requests                                     | Enable only after HTTPS, domain, and subdomain review                                                        |
| `TRUST_PROXY`                     | Exact `true` permits trusted forwarded metadata behavior                             | Enable only when the immediate proxy overwrites forwarding headers and direct app access is blocked          |
| `DEMO_PASSWORD`                   | Local server-only demo credential                                                    | Never reuse or expose a real password                                                                        |
| `POSTGRES_*`                      | Used by local Docker Compose                                                         | Keep consistent with the local `DATABASE_URL`; these do not configure an external database                   |
| `SEED_*_PASSWORD`                 | Required by the synthetic PostgreSQL seed; at least 14 characters                    | Setup-only secrets; do not inject them into the production runtime                                           |
| `SEED_RESET_CONFIRM`              | Must exactly equal `RESET_NORTHSTAR_DEMO_FIXTURES` to request reset                  | Supply only for an intentional bounded fixture reset                                                         |
| `SEED_ALLOW_REMOTE_DEMO_DATABASE` | Exact `NORTHSTAR_DEMO_ONLY` bypasses the local-host seed check                       | Use only for a verified remote synthetic test database, never a real-data target                             |

There is no single standalone production-config validator. Validate configuration by review,
running the build with release-like non-secret settings, starting the release artifact with its
actual injected configuration, and exercising readiness and smoke checks. Never print
`DATABASE_URL`, `SESSION_SECRET`, passwords, cookies, or backup keys into CI logs or tickets.

## Migrations and fixture seeding

### Migration procedure

1. Identify the exact application artifact/source revision, migration files, database target,
   operator, approver, change window, and rollback decision point.
2. Confirm a successful, restorable pre-change backup and record its identifier without placing
   credentials in the change record.
3. Restore the backup into an isolated non-production database and apply `pnpm db:migrate` there.
4. Run PostgreSQL integration tests and applicable smoke tests against the migrated copy.
5. Apply `pnpm db:migrate` in production using the separate migration owner, never the runtime
   role. The command exits nonzero and logs a bounded error message on failure.
6. Inspect `drizzle.__drizzle_migrations`, the expected schema constraints/triggers, and the
   committed migration journal. Do not manually edit the migration journal.
7. Reapply/review the least-privilege grants when a migration changes database objects or
   repository access, then start or promote the compatible application artifact.
8. Execute the post-release checks and attach results to the release record.

`pnpm db:generate` is a development command. Generated SQL must be reviewed and committed before
release; do not generate an unreviewed migration in the production change window. Migrations are
forward-only by default. Use a reviewed compensating migration rather than an improvised
destructive reversal.

### Seed procedure and restrictions

`pnpm db:seed` is optional synthetic test data, not production bootstrap data. It hashes the three
seed passwords with Argon2id, writes the fixture set in one transaction, and records a success or
failure audit event when the migrated database permits it. Its safety-name and host checks reduce
risk but do not replace operator verification of the exact database hostname and name.

Before seeding, record that the target contains no real data, inspect the resolved hostname and
database name without exposing credentials, and confirm `NODE_ENV` is not production. Remove seed
passwords from long-lived runtime configuration after the setup job.

## Least-privilege database role

The database administrator must create the runtime login separately with a managed secret. It
must have `LOGIN` but no `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, or `BYPASSRLS`, no
role memberships, and no ownership of the database or objects.

After every applicable migration, run the grant template as the database/schema owner:

```bash
psql "$ADMIN_DATABASE_URL" \
  --set=runtime_role=northstar_runtime \
  --file=ops/least-privilege.sql
```

Replace `northstar_runtime` with the pre-created role name. The template fails closed for unsafe
role attributes, memberships, ownership, DDL rights, destructive table rights, audit mutation,
or unexpected sequence rights. It prints effective table privileges for review.

Before cutover, independently prove under `SET ROLE` or a runtime connection that:

- connection and schema lookup work;
- application reads and the repository's declared inserts/updates work;
- schema/table creation is denied;
- all table `DELETE` and `TRUNCATE` operations are denied;
- `audit_events` `UPDATE`, `DELETE`, and `TRUNCATE` are denied; and
- the runtime cannot read or change the Drizzle migration journal.

Update the template and its negative tests whenever a migration adds an object or the repository
needs a new operation. PostgreSQL ownership and superuser rights bypass ordinary grants; database
triggers are defense-in-depth, not a control against the migration owner.

## CI and release checklist

The committed GitHub Actions workflow runs with PostgreSQL 17.11 for migrations and integration
tests, then deliberately switches the browser suite to labelled demo mode. That browser suite is
useful UI regression evidence but is not proof of a production PostgreSQL browser-to-database
path. The organization must add and retain staging PostgreSQL end-to-end evidence if its release
policy requires that path.

Run these repository gates from a clean, frozen install:

```bash
pnpm install --frozen-lockfile
pnpm check-format
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm test:integration
pnpm audit
pnpm audit:prod
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Release approval requires a recorded answer for every item:

- [ ] Artifact/source revision, dependency lock digest, build environment, approver, and change
      ticket are recorded.
- [ ] The full CI pipeline passed without skipped PostgreSQL tests; high-severity dependency
      audit findings are resolved or formally accepted.
- [ ] The release configuration uses `DATA_MODE=postgres`, does not allow production demo mode,
      and contains no synthetic fixtures or seed credentials.
- [ ] The application artifact and migrations were tested together against a restored staging
      copy, including registration concurrency and waitlist promotion.
- [ ] Compatibility between the old application, new application, and schema is understood for
      the chosen deployment order.
- [ ] A current encrypted backup exists and a clean-database restore has passed within the
      approved restore-test interval.
- [ ] Runtime, migration, and backup identities are distinct; the runtime negative privilege
      checks passed.
- [ ] TLS, secure cookie behavior, HSTS decision, proxy trust, direct-origin blocking, and hostile
      Host/Origin/forwarded-header/request-ID tests are evidenced.
- [ ] Privacy scope, retention/deletion, row/department access scope, data residency, accessibility,
      penetration testing, load/capacity, incident response, and operator training gates are
      approved.
- [ ] Monitoring, alert thresholds, on-call delivery, dashboards, backup-age checks, and clock
      synchronization are active.
- [ ] A rollback/corrective-migration decision owner and the end of the rollback window are named.

### Post-release verification

1. Confirm process startup and HTTP 200 from `/api/health` in every serving region/instance.
2. Verify an authenticated read using a least-privileged test account and verify an anonymous or
   unauthorized request is denied.
3. In a synthetic staging tenant/database, exercise a registration and drop/waitlist promotion,
   then confirm the resulting records, notification, and audit evidence.
4. Verify logout revokes the session and the old cookie no longer authorizes a protected route.
5. Verify an authorized filtered CSV export and an unauthorized export denial. Treat the
   downloaded file as controlled institutional data.
6. Confirm expected security headers and an actually `Secure`, `HttpOnly`, `SameSite=Strict`
   session cookie over the deployed HTTPS path.
7. Watch the monitoring signals below through the recorded stabilization window.

## Deploy-neutral production prerequisites

The organization must provision and evidence all of the following; this repository does not pick
or configure a provider:

- A pinned, immutable application artifact built on a supported Node.js version.
- A dedicated, private PostgreSQL 17 database with TLS, network allowlists, connection/query
  limits, separate operator identities, and the reviewed least-privilege runtime grants.
- A managed secret store and documented rotation for session, runtime database, migration,
  backup, and any future integration credentials.
- HTTPS at a trusted proxy/load balancer, direct-origin blocking, forwarded-header overwrite,
  request/body/rate limits, and an HSTS decision made after domain review.
- Centralized identity controls appropriate to the institution. MFA/SSO, account recovery, and
  administrative lockout workflows are not implemented in this repository.
- An approved access-scope model. Current RBAC is institution-wide and has no department,
  advisor, student-self-service, tenant row scope, or PostgreSQL row-level security.
- Privacy/data-classification review, lawful-basis/consent decisions where applicable,
  retention/deletion rules, export handling, residency, and third-party processor review.
- Encrypted backups, off-host/immutable protection as required, documented RPO/RTO, and witnessed
  restore drills.
- Central logs, HTTP/database telemetry, alerting, clock synchronization, and an incident
  evidence store that do not collect raw credentials, tokens, IP addresses, request bodies, or
  student contact details.
- Independent penetration testing, load/capacity testing, manual accessibility testing with
  disabled users and assistive technology, and operator incident exercises.
- Reviewed plans for any SIS, LMS, payment, email/SMS, document, or identity-proofing integration;
  none is configured here.

## Health, readiness, and smoke checks

`GET /api/health` is dynamic, returns `Cache-Control: no-store`, and exposes only `status`, `mode`,
`database`, `migrations`, and `checkedAt`.

| Condition                                                        | HTTP/result                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Demo repository available                                        | 200; `ready`, `demo`, database/migrations `not-applicable`           |
| PostgreSQL reachable and `drizzle.__drizzle_migrations` resolves | 200; `ready`, `postgres`, database `connected`, migrations `current` |
| PostgreSQL unavailable or query fails                            | 503; `not_ready`, database `unavailable`, migrations `unknown`       |
| PostgreSQL reachable but migration table absent                  | 503; `not_ready`, database `connected`, migrations `unknown`         |

Important: `migrations: "current"` means the migration table exists. It does not compare the
deployed artifact with pending migrations, detect schema drift, validate trigger definitions, or
prove registration correctness. Preserve the migration command, journal inspection, integration
test, and smoke-test evidence separately.

Use `/api/health` for readiness. Configure a separate process-level liveness check if the hosting
platform needs one; repeatedly restarting a healthy process during a database outage can amplify
the incident. The check interval, failure threshold, timeout, region coverage, and paging policy
are organization-supplied inputs.

## Backup and restore expectations

No backup automation or successful restore artifact is present in this repository. The database
owner must define and test the production procedure.

### Backup requirements

- Record approved RPO/RTO, schedule, retention, deletion, residency, legal hold, owner, and alert
  thresholds.
- Use the separate backup identity. Encrypt in transit and at rest with independently controlled
  keys; store copies outside the application host and use immutable/offline protection when
  required.
- Capture a consistent PostgreSQL backup, its cryptographic checksum, PostgreSQL version,
  timestamp, database identifier, application artifact, and migration journal state.
- Back up role/grant/bootstrap definitions separately: `pg_dump` of one database does not preserve
  all cluster-global roles. Keep secrets outside the database backup.
- Monitor last successful backup age, size anomalies, job failures, storage integrity, and key
  availability. A completed upload is not restore evidence.

A deployment-specific logical-backup template may use a secret-injected connection variable:

```bash
pg_dump --format=custom --no-owner --no-acl \
  --file="$BACKUP_FILE" "$BACKUP_DATABASE_URL"
```

The organization must protect the process environment and output path, encrypt the artifact, and
record a checksum. Do not paste connection URLs into command history or tickets.

### Restore drill and recovery

1. Declare the incident/change, exact backup identifier, recovery point, operator, approver, and
   clean target database. Preserve the original database and stop or isolate writes when needed.
2. Verify checksum, encryption/key access, PostgreSQL compatibility, and artifact/migration pairing.
3. Restore into a new empty isolated database, not over the only production copy:

   ```bash
   pg_restore --exit-on-error --no-owner --no-acl \
     --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
   ```

4. Recreate reviewed roles/grants separately and apply `ops/least-privilege.sql` to the restored
   target.
5. Inspect the migration journal, required constraints and triggers, exactly one current semester,
   registration/waitlist invariants, session handling, and append-only audit behavior.
6. Point a non-production application instance at the restored target and run health,
   authentication, authorization-denial, registration, waitlist, export, and audit smoke checks.
7. Measure recovery time and recovered-data age against RTO/RPO. Record gaps and corrective work.
8. For a real recovery, use a reviewed controlled cutover, verify clients and background access,
   then retain the prior database according to the incident and privacy policy.

## Rollback and forward recovery

Prefer an application rollback only when the migrated schema is explicitly backward compatible.
Database changes are forward-only by default: correct defects with a reviewed compensating
migration. Do not manually delete migration-journal rows, disable constraints/triggers, truncate
tables, or use the hard-delete maintenance setting as a rollback shortcut.

If a release is unhealthy:

1. Stop further promotion; identify whether the failure is application, configuration,
   infrastructure, database availability, schema compatibility, or data integrity.
2. Disable registration through the authorized Settings workflow when registration integrity is
   at risk, while preserving read access if safe.
3. Roll back the application artifact only if the schema contract supports it.
4. Otherwise hold writes and deploy the tested corrective migration/application pair.
5. Restore to a clean database and cut over only when forward repair cannot meet the approved
   integrity and recovery objectives. Account explicitly for writes after the restored recovery
   point.
6. Re-run post-release verification and preserve the full incident/change timeline.

## Incident procedures

For every incident, assign `<incident-commander>`, severity, start time, affected environment,
decision log, evidence location, communications owner, and next update time. Preserve request IDs,
artifact/config versions, database identifiers, audit records, and bounded logs. Do not collect
raw cookies, passwords, connection URLs, request bodies, IP addresses, or unnecessary personal
data.

### Failed migration

**Trigger:** `pnpm db:migrate` exits nonzero, readiness becomes 503, expected objects are absent,
or the application and schema disagree.

1. Stop the rollout and prevent other migration jobs from running. Do not blindly retry.
2. Preserve the migration output, artifact and migration digests, operator, time, target, current
   `drizzle.__drizzle_migrations` contents, PostgreSQL errors, and pre-change backup identifier.
3. Determine the actual committed schema state. The journal and health endpoint alone are not
   proof that every object is correct.
4. Reproduce against a restored isolated copy. Review transaction boundaries, locks, long-running
   queries, constraints, disk/connection capacity, and role ownership.
5. If no incompatible change committed, correct the cause and rerun the exact reviewed migration.
   If a partial/incompatible change exists, prepare and test a compensating forward migration.
6. If safe forward recovery cannot meet RTO/RPO, follow the clean-database restore and controlled
   cutover procedure. Reconcile or explicitly account for post-backup writes.
7. Reapply least-privilege grants, run integration and smoke tests, verify audit triggers, and
   obtain the named approver before resuming promotion.

Escalate immediately to `<database-owner>` and `<service-owner>`; include `<security-on-call>` if
controls or audit integrity changed, and `<privacy-owner>` if data exposure or loss is possible.

### Registration-integrity incident

**Trigger:** oversubscription; duplicate active registration; incorrect waitlist order/promotion;
an eligibility, hold, prerequisite, schedule, credit, semester, or window rule appears bypassed;
or registration and audit/notification state disagree.

1. Contain new writes by having an authorized administrator clear **Registration enabled** in
   Settings. If that path is unavailable, use only a pre-approved two-person break-glass database
   procedure and record it outside the affected system.
2. Preserve the request/correlation IDs, actor, offering, semester, student identifiers, settings
   version, relevant audit events, timestamps, and a transactionally consistent database backup.
   Limit personal data in incident systems.
3. Do not delete registrations, renumber a waitlist, change grades/prerequisites, or mutate audit
   rows with ad hoc SQL. Do not disable transition, hard-delete, or append-only triggers.
4. Scope all affected offerings and students. Recalculate capacity, deterministic waitlist order,
   active-status uniqueness, eligibility, credit, and meeting conflicts from authoritative rows.
5. Reproduce with the PostgreSQL integration/concurrency suite. Determine whether the cause is
   configuration, an unsupported manual database change, application version skew, or a code/schema
   defect.
6. Repair through a reviewed, idempotent application workflow or corrective transaction that
   preserves history and creates incident/change evidence. Notify affected users through the
   organization-approved channel; do not rely on the in-app notification table alone.
7. Run final-seat serialization and next-eligible-promotion tests, verify records and audit events,
   and obtain `<academic-operations-owner>` plus `<database-owner>` approval before re-enabling
   registration.

Escalate to `<privacy-owner>` for misdirected disclosure and `<security-on-call>` when unauthorized
activity or audit tampering is suspected.

### Credential or session incident

**Trigger:** suspected disclosure of `SESSION_SECRET`, a session cookie/token, database credential,
seed password, backup key, or privileged user credential; anomalous login/rate-limit activity; or
unauthorized session use.

1. Restrict affected access and preserve audit/log evidence. Do not paste the suspected secret into
   the incident record.
2. For suspected `SESSION_SECRET` or broad session compromise, rotate the secret in the managed
   store and perform a coordinated restart/release of all instances. Because stored token digests
   are keyed by that secret, old cookies will no longer resolve; communicate the forced sign-in.
3. For one known session, ordinary logout revokes that session. The repository does not provide an
   administrative session-revocation console or account-recovery workflow; use an approved
   owner-controlled containment procedure, or rotate the global session secret when scope is
   uncertain.
4. Rotate a compromised runtime database credential, update all runtime instances, confirm the new
   least-privilege identity works, revoke the old credential, and review database connection/audit
   telemetry. Migration and backup credentials require separate rotations.
5. Rotate exposed seed passwords and remove them from runtime configuration. Confirm no real
   account reused them.
6. Rotate backup encryption keys according to the recovery policy without making required backups
   unreadable; document re-encryption or key-retention decisions.
7. Review authentication audit outcomes, request IDs, role changes, exports, settings, registration
   changes, and database access for the exposure window. Expand the window when clocks or log
   coverage are uncertain.
8. Restore service only after secret propagation, old-credential revocation, least-privilege
   verification, and clean authentication/authorization smoke checks.

Escalate to `<security-on-call>` immediately, then `<service-owner>`, `<database-owner>`, and
`<privacy-owner>` according to affected credentials/data. Follow the organization's breach and
user-notification decision process.

## Audit retention, review, and export

PostgreSQL audit rows are append-only under database triggers. The runtime grant template permits
only `SELECT` and `INSERT` on `audit_events`; it denies update, delete, and truncate. Database
owners can still alter or bypass these controls, so privileged database activity requires
independent oversight.

The protected audit page and `/api/exports/audit` use the repository's latest 250 authorized audit
rows. Audit export requires both `audit:read` and `exports:create`, produces formula-safe CSV, and
records the export action. It is an operator convenience, not a complete archive, cryptographic
ledger, SIEM feed, retention job, or legal-hold mechanism. Once downloaded, the CSV is controlled
institutional data.

The organization must define:

- retention and deletion periods for audit rows, hashed source metadata, logs, exports, and backups;
- reviewer roles, least-privileged access, review frequency, clock synchronization, and escalation;
- full-history archival/replication to a separately administered append-only destination when
  required;
- integrity monitoring for missing events, disabled/changed triggers, unexpected privileged
  access, clock gaps, and export spikes; and
- a reviewed retention implementation that reconciles privacy deletion and legal-hold duties.

Do not implement retention by ad hoc audit deletes or by disabling triggers. Use an approved schema
and archival migration with privacy, security, records, and database-owner sign-off.

## Monitoring and escalation

The application emits bounded JSON log entries for selected authentication activity and exposes
the bounded health endpoint. It does not configure a log shipper, metrics exporter, tracing
backend, alert rules, dashboard, or paging service. HTTP, database, infrastructure, and backup
telemetry are organization-supplied prerequisites.

| Signal                                        | Source                                                   | Initial response and owner                                                                                                |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Readiness 503 or latency                      | `/api/health`, platform HTTP telemetry                   | Check process/database/network/migration-table state; `<service-on-call>` and `<database-on-call>`                        |
| 401/403/429 spike                             | HTTP telemetry plus authentication/denial audit events   | Check credential abuse, proxy/rate limits, and affected identities; `<security-on-call>`                                  |
| 409/422/5xx spike                             | HTTP telemetry and bounded server logs                   | Correlate request IDs and deployment/config changes; `<service-on-call>`                                                  |
| Pool saturation/query or lock latency         | PostgreSQL/platform telemetry                            | Check instance count, `DATABASE_POOL_SIZE`, connection limits, locks, and slow queries; `<database-on-call>`              |
| Registration conflicts or promotion anomalies | Registration records, audit events, synthetic probes     | Disable registration when integrity is uncertain and follow the integrity incident runbook; `<academic-operations-owner>` |
| Audit-write failure or event gap              | Application errors, database telemetry, integrity checks | Treat affected mutation evidence as unreliable; `<security-on-call>` and `<database-owner>`                               |
| Export-volume anomaly                         | `export.create` audit events and HTTP telemetry          | Validate actor, scope, purpose, and downstream handling; `<privacy-owner>` and `<security-on-call>`                       |
| Backup failure/age or restore-test breach     | Backup platform and recovery register                    | Protect RPO/RTO and invoke recovery owner; `<backup-owner>` and `<database-owner>`                                        |
| Security-header/cookie regression             | External synthetic HTTPS check                           | Stop promotion or remediate immediately; `<security-on-call>`                                                             |

Define warning/critical thresholds, evaluation windows, deduplication, maintenance windows, and
escalation SLAs in `<monitoring-system-and-thresholds>`. Every page must identify environment,
region/instance, first-seen time, current artifact, and a safe correlation/request ID without
sensitive payloads. Close an incident only after recovery verification, stakeholder communication,
evidence retention, root-cause ownership, and dated corrective actions are recorded.
