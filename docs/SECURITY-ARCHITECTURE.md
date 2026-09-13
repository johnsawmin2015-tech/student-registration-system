# Security architecture and threat model

## Scope and assurance boundary

This document describes the controls that exist in this repository. It is not a certification, a penetration-test report, or evidence that a production deployment is secure. The application currently has two data adapters:

- PostgreSQL is the production-oriented adapter. It stores identities, sessions, institutional records, settings, notifications, and audit events.
- The deterministic demo adapter is server-only, process-local, synthetic, and non-durable. It is for local evaluation, not real student data or multi-instance operation.

The trusted authorization boundary is the Next.js server action or route handler, the repository capability check, and the database transaction/constraints. Proxy redirects and hidden UI controls are defense-in-depth only.

## System and trust boundaries

```text
Untrusted browser
  | HTTPS, opaque session cookie, forms and filtered export requests
  v
Trusted TLS terminator / reverse proxy
  | only when explicitly configured to overwrite forwarded headers
  v
Next.js proxy and App Router process
  | authentication, same-origin checks, Zod command allowlists, RBAC
  v
UniversityRepository
  | PostgreSQL adapter: parameterized queries and transactions
  | Demo adapter: synthetic in-memory state only
  v
Dedicated PostgreSQL database
  | constraints, row locks, transition guards, hard-delete guards,
  | append-only audit triggers, backups managed outside this repository
```

The principal trust boundaries are:

1. Browser to application: all request data, cookies, headers, identifiers, filters, and form fields are untrusted.
2. Edge or reverse proxy to application: `x-forwarded-*` values are trusted only when `TRUST_PROXY=true` and the immediate proxy overwrites them. The application must not be directly reachable around that proxy.
3. Application to PostgreSQL: the connection string and database network path are secrets/trusted infrastructure. The runtime role must not be the migration owner.
4. Runtime to deployment control plane: environment variables contain the database credential and session secret; seed passwords are setup-only secrets.
5. Application to downloaded CSV: an authorized export leaves the application boundary and becomes the operator's responsibility.
6. Migration, seed, backup, and restore tooling to PostgreSQL: these are privileged operator paths and must use identities separate from the application runtime.

## Protected assets

| Asset                                 | Examples in the schema                                                                                    | Required properties                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Identity and authentication           | email addresses, Argon2id password hashes, role assignments, permission assignments, session token hashes | confidentiality, integrity, revocability               |
| Student personal data                 | names, contact details, date of birth, gender, city, country, notes                                       | confidentiality, minimization, retention control       |
| Academic and administrative records   | GPA, standing, program, credits, grades, holds, registrations, waitlists                                  | integrity, authorized availability, traceability       |
| Faculty and department records        | contact details, rank, employment data, offices, notes, chair assignments                                 | confidentiality, integrity                             |
| Registration capacity                 | semester windows, prerequisites, meeting times, seat counts, queue order, global switch                   | atomic integrity and availability                      |
| Institutional configuration           | current semester, maximum credit load, registration switch, contact settings                              | integrity and change accountability                    |
| Audit evidence                        | actor, role, action, entity, outcome, request/correlation IDs, hashed source metadata                     | append-only integrity, availability, controlled access |
| Operational secrets and recovery data | `SESSION_SECRET`, `DATABASE_URL`, seed passwords, database backups                                        | confidentiality, rotation, recoverability              |

Source IP addresses and user agents are hashed before audit storage, but stable hashes can still be identifying metadata. They require a documented purpose and retention period.

## Actors and privileges

| Actor                           | Intended access                                                     | Security concern                                                                   |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Anonymous user                  | login and bounded health response                                   | credential stuffing, enumeration, malformed input, availability attacks            |
| Viewer                          | records and reports; current policy also permits audit read         | excess disclosure if the broad institutional read model is unsuitable              |
| Staff                           | record workflows, registration management, reports, exports         | bulk disclosure or integrity damage from a compromised account                     |
| Administrator                   | all declared application capabilities, including settings and audit | highest application-level blast radius                                             |
| Application runtime role        | SQL required by the PostgreSQL repository                           | a compromised process can exercise every SQL privilege granted to this shared role |
| Migration/seed operator         | schema changes or explicitly bounded synthetic fixtures             | can alter controls; must not share the runtime credential                          |
| Database/platform administrator | infrastructure, backup, restore, and role management                | can bypass or remove database triggers and is outside application enforcement      |
| Trusted reverse proxy           | TLS termination and forwarded client metadata                       | spoofed host/IP data if misconfigured or bypassed                                  |

The current authorization model is institutional, not tenant-, student-, or department-row scoped. PostgreSQL row-level security is not configured. That limitation must be accepted explicitly or remediated before real records are loaded.

## Security invariants implemented in code

- Password verification uses Argon2id and a dummy hash path to reduce account-enumeration timing differences. Login errors are generic and failed attempts are bounded in a 15-minute window.
- Sessions use 32-byte opaque random tokens. Only a secret-keyed SHA-256 digest is stored. Cookies are `HttpOnly`, `SameSite=Strict`, path-scoped to `/`, and expire; persisted sessions have absolute and idle limits, rotation, and logout revocation.
- Every mutation in `app/actions.ts` verifies same origin, parses an explicit Zod command, requires an authenticated capability, and calls a repository method that checks the capability again.
- Protected server-rendered pages require an authenticated session and a declared capability. Export handlers independently enforce `exports:create`; audit exports additionally require `audit:read`.
- PostgreSQL queries use Drizzle parameter binding. User-controlled filters are length-bounded and are not concatenated into SQL text.
- Registration decisions are recalculated inside a database transaction after locking the offering row. Domain checks cover active/eligible students, the current active semester and window, the global switch, duplicates, holds, prerequisites, meeting conflicts, credit limits, capacity, and waitlist order.
- Database checks, foreign keys, unique indexes, optimistic versions, registration-transition triggers, and hard-delete guards reinforce application validation.
- Audit rows reject update, delete, and truncate through database triggers. The recommended runtime grants also omit those privileges.
- CSV exports use explicit column allowlists, RFC 4180 escaping, spreadsheet-formula neutralization, `no-store`, and authorization-scoped repository reads. Hidden notes, contact fields, password/session hashes, and source metadata are not in export projections.
- Structured logs accept only a small metadata allowlist. Security headers include CSP, frame denial, MIME sniffing protection, a restrictive permissions policy, and a referrer policy. HSTS is opt-in because it is safe only on a verified HTTPS origin.
- Production defaults to PostgreSQL and refuses the demo adapter unless an explicit override is set. The seed script refuses production and ambiguous/remote targets without explicit demo-only confirmation.

## Threat register

| ID and abuse case                                                                             | Existing controls                                                                                                                                                                  | Residual risk / required treatment                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01: credential stuffing, brute force, or account enumeration                             | Argon2id; dummy verification; generic errors; persisted login-attempt counting; structured audit                                                                                   | No MFA, federation, breached-password screening, bot defense, or edge-wide rate limit. Add MFA/SSO for privileged accounts and distributed abuse controls before production.                                                                                                                                                                        |
| SESSION-01: stolen, replayed, or fixed session token                                          | opaque high-entropy token; keyed digest at rest; `HttpOnly`; `SameSite=Strict`; expiry, idle refresh, rotation on mutations, logout revocation                                     | A stolen live cookie remains usable until revoked/expired. Enforce HTTPS and `Secure` in the deployed response, protect endpoints from XSS, and add session-management/incident revocation procedures.                                                                                                                                              |
| CSRF-01: cross-site state-changing request or login CSRF                                      | all current server actions call `assertSameOrigin`; strict same-site cookie; CSP `form-action 'self'`                                                                              | Origin verification relies on a trustworthy Host boundary. Do not expose the app behind a proxy that passes attacker-controlled host headers; retain regression tests whenever mutation transports change.                                                                                                                                          |
| AUTHZ-01: IDOR, role escalation, or hidden-control bypass                                     | session roles and persisted permission assignments; capability check at page/action/route and repository layers; audit on denied actions                                           | The shared runtime role is not user-aware and there is no department/row scope. A compromised process or overly broad staff account can reach institutional data allowed by the repository. Define and test row-scope policy before real data.                                                                                                      |
| INPUT-01: mass assignment, SQL injection, stored/reflected XSS, or malformed identifiers      | explicit Zod action objects; bounded IDs/filters; explicit update objects; Drizzle parameters; React escaping; CSP                                                                 | CSP permits inline styles, development permits unsafe scripts, and no independent penetration test has been performed. Keep raw SQL review mandatory and do not render stored HTML without a sanitizer.                                                                                                                                             |
| REG-01: oversubscribed final seat, duplicate enrollment, queue jumping, or invalid transition | offering row lock; one transaction for decision/write/audit/notification; deterministic ordering; unique/check constraints; transition trigger; optimistic writes                  | Lock contention can affect availability. Run the PostgreSQL concurrency suite against the production-equivalent engine and monitor transaction conflicts/latency. Cross-database behavior is not supported.                                                                                                                                         |
| DATA-01: PII leakage through pages, exports, cache, errors, or logs                           | protected SSR; capability-gated exports; export projection allowlists; `Cache-Control: no-store` on export/health responses; generic public errors; allowlisted structured logging | Page responses are not universally marked `no-store` by an explicit application header, and the DB stores sensitive fields that current list projections omit. Verify framework caching behavior, CDN rules, observability sinks, support tooling, and retention before launch.                                                                     |
| CSV-01: spreadsheet formula execution or accidental bulk disclosure                           | formula-prefix neutralization; quoting; fixed columns; filtered authorized reads; export audit event                                                                               | The downloaded file can be forwarded or opened in software with different interpretation rules. Apply download handling, retention, and data-loss-prevention policy outside the app.                                                                                                                                                                |
| AUDIT-01: repudiation, audit deletion, or misleading correlation data                         | mutation/export/auth events; request IDs; append-only database triggers; runtime audit grant limited to select/insert                                                              | Some updates and their audit writes are separate transactions, so a later audit-write failure can leave an unaudited change. A table owner/superuser can disable triggers. Validate/generate request IDs at the trusted edge, alert on audit-write failures, and export evidence to separately controlled storage if tamper resistance is required. |
| DB-01: compromised app credential mutates or destroys records                                 | foreign keys/checks; hard-delete triggers; no runtime DELETE/TRUNCATE/DDL; separate least-privilege template                                                                       | The runtime role can still read all application tables and update the workflows it serves. Use a dedicated private database, TLS, credential rotation, network allowlists, query/connection limits, and separately held migration/backup identities.                                                                                                |
| OPS-01: secret, TLS, proxy, or demo-mode misconfiguration                                     | production PostgreSQL default; minimum session-secret length; explicit HSTS/proxy/demo switches; bounded public health output                                                      | Configuration is environment-driven and not a deployment attestation. Validate rendered cookies/headers and network routes from outside, keep secrets in a managed store, and prevent the demo override in production policy.                                                                                                                       |
| AVAIL-01: expensive reads/exports, login floods, lock exhaustion, or database outage          | bounded audit/notification reads; login throttling; database pool; health status; indexed query paths                                                                              | No global request/body limit, export pagination/size ceiling, queue, circuit breaker, or production autoscaling policy is present. Add edge limits, timeouts, resource alerts, and load/capacity tests.                                                                                                                                             |
| SUPPLY-01: compromised dependency, build action, or generated artifact                        | frozen pnpm lockfile; pinned CI actions; type/lint/test/build/audit gates                                                                                                          | Package audit is not proof against unknown compromise. Protect the default branch, review lockfile changes, use trusted registries/builders, produce provenance/SBOM as required, and define patch SLAs.                                                                                                                                            |
| RECOVERY-01: unavailable or privacy-unsafe backup/restore                                     | README defines encrypted backup, staged migration, clean restore, and controlled cutover expectations                                                                              | No backup artifact or successful restore drill is evidence in this repository. Set RPO/RTO, encryption/key ownership, retention/deletion, regional residency, and restore-test schedules.                                                                                                                                                           |

## Database privilege model

Use a dedicated database with at least three separate identities:

- Runtime: connect, schema usage, application-table reads, and only the inserts/updates used by the current repository. It receives no DELETE, TRUNCATE, DDL, role administration, ownership, or audit mutation rights.
- Migration/seed: owns schema objects and applies reviewed migrations. Seed/reset operations are never available to the runtime role.
- Backup/restore: independently controlled and limited to the approved recovery workflow.

Apply `ops/least-privilege.sql` after migrations as the database owner, then inspect its privilege report. PostgreSQL ownership and superuser status imply rights that `REVOKE` cannot meaningfully constrain; the template rejects such a runtime role. Default privileges belong to the object-creating role, so every migration must either add exact grants for new objects or be followed by an updated grant step.

Database triggers are a second line of defense, not protection from a malicious database owner. In particular, the migration owner can replace triggers and an explicitly privileged maintenance session can enable the hard-delete guard's maintenance setting. Such actions require an approved, logged runbook and independent backup.

## Production launch gates

All of the following are blockers for real student or faculty data unless an accountable owner records a narrower risk acceptance:

- Deploy only the PostgreSQL adapter to a dedicated private PostgreSQL 17 environment; apply migrations and the reviewed least-privilege runtime grants. Prove the runtime role cannot create schema objects, delete/truncate records, or update/delete audit rows.
- Run frozen install, formatting, lint, strict type checking, unit tests, dependency audit, production build, seeded PostgreSQL integration tests, concurrency tests, and desktop/mobile E2E tests in the exact release pipeline. A skipped database suite is not a pass.
- Terminate TLS at a trusted boundary, verify the cookie is actually `Secure`, enable HSTS only after HTTPS/subdomain review, and ensure direct application access cannot bypass the proxy. Test hostile Host, Origin, forwarded-header, and request-ID inputs.
- Generate and store independent high-entropy database, session, and seed secrets in a managed secret store. Document rotation, emergency session invalidation, and database credential rollover. Do not make seed credentials available to the runtime workload.
- Add MFA or approved institutional SSO for privileged users, recovery/lockout support, centralized edge rate limiting, and alerts for authentication abuse.
- Decide and enforce the required record scope (institution, department, advisor, or self-service). Add row-level/application policy tests; the current broad institutional model must not be assumed appropriate.
- Complete privacy/data-classification review for every schema field, lawful basis/consent where applicable, retention/deletion rules (including logs, audit, hashes, exports, and backups), data-subject workflows, residency, and third-party processor review.
- Establish encrypted backups, immutable/offsite protection as required, measured RPO/RTO, and a witnessed restore drill against a clean database. Record artifact, migration journal, backup identifier, and approver for each release.
- Add production observability for 401/403/409/422/429/5xx responses, audit-write failures, registration conflicts, export volume, pool saturation, query latency, health, and backup age without collecting request bodies, raw tokens, raw IPs, or contact data.
- Perform independent penetration testing, threat-model sign-off, manual accessibility testing with disabled users and assistive technology, load/capacity testing, incident-response exercises, and operator training.
- Define audit retention, restricted reviewer access, clock synchronization, correlation-ID validation, integrity monitoring, and—if required—replication to a separately administered append-only sink.
- Remove the production demo override through deployment policy, verify synthetic fixtures are absent, and document that no email/SMS, payment, SIS/LMS, document upload, or identity-proofing integration exists until those systems receive their own review.

Revisit this threat model whenever routes, capabilities, data fields, integrations, deployment topology, database grants, caching, or authentication mechanisms change.
