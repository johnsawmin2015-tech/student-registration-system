-- Northstar runtime-role grants for PostgreSQL 17.
--
-- Preconditions:
--   * Run with psql, after the committed migrations, in a dedicated Northstar
--     database while connected as the database/schema owner.
--   * The runtime login role must already exist. Create its password outside
--     this file with a managed secret; never place credentials in this script.
--   * The runtime role must not own the database or schema objects, be a member
--     of another role, or hold SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/
--     BYPASSRLS. This script deliberately aborts for those unsafe cases.
--
-- Example (runtime role name is identifier-quoted by psql):
--   psql "$ADMIN_DATABASE_URL" \
--     --set=runtime_role=northstar_runtime \
--     --file=ops/least-privilege.sql

\set ON_ERROR_STOP on

\if :{?runtime_role}
\else
  \echo 'ERROR: supply --set=runtime_role=<pre-created-login-role>.'
  \quit 3
\endif

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role'
  ) THEN 'true' ELSE 'false' END AS runtime_role_exists,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'runtime_role'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  ) THEN 'true' ELSE 'false' END AS runtime_role_is_restricted,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_auth_members memberships
    JOIN pg_roles member_role ON member_role.oid = memberships.member
    WHERE member_role.rolname = :'runtime_role'
  ) THEN 'true' ELSE 'false' END AS runtime_role_has_memberships,
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_database database_object
    JOIN pg_roles owner_role ON owner_role.oid = database_object.datdba
    WHERE database_object.datname = current_database()
      AND owner_role.rolname = :'runtime_role'
    UNION ALL
    SELECT 1
    FROM pg_namespace namespace_object
    JOIN pg_roles owner_role ON owner_role.oid = namespace_object.nspowner
    WHERE namespace_object.nspname IN ('public', 'drizzle')
      AND owner_role.rolname = :'runtime_role'
    UNION ALL
    SELECT 1
    FROM pg_class relation_object
    JOIN pg_namespace namespace_object ON namespace_object.oid = relation_object.relnamespace
    JOIN pg_roles owner_role ON owner_role.oid = relation_object.relowner
    WHERE namespace_object.nspname IN ('public', 'drizzle')
      AND owner_role.rolname = :'runtime_role'
    UNION ALL
    SELECT 1
    FROM pg_proc function_object
    JOIN pg_namespace namespace_object ON namespace_object.oid = function_object.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_object.proowner
    WHERE namespace_object.nspname IN ('public', 'drizzle')
      AND owner_role.rolname = :'runtime_role'
  ) THEN 'true' ELSE 'false' END AS runtime_role_owns_objects
\gset

\if :runtime_role_exists
\else
  \echo 'ERROR: runtime_role does not exist. Create it separately, then retry.'
  \quit 3
\endif

\if :runtime_role_is_restricted
\else
  \echo 'ERROR: runtime_role must be LOGIN and must not hold elevated PostgreSQL attributes.'
  \quit 3
\endif

\if :runtime_role_has_memberships
  \echo 'ERROR: runtime_role has role memberships. Remove/review them before applying direct least-privilege grants.'
  \quit 3
\endif

\if :runtime_role_owns_objects
  \echo 'ERROR: runtime_role owns the database or application objects; ownership bypasses least-privilege revocation.'
  \quit 3
\endif

BEGIN;

-- The runtime can connect but cannot create schemas in this database.
GRANT CONNECT ON DATABASE :"DBNAME" TO :"runtime_role";
REVOKE CREATE ON DATABASE :"DBNAME" FROM :"runtime_role";

-- PostgreSQL grants USAGE on public by default, but older installations can
-- also grant CREATE. Remove CREATE from every role, then grant runtime lookup
-- only. The drizzle schema is visible solely so /api/health can resolve the
-- migration-journal relation; no migration-table privileges are granted.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT USAGE ON SCHEMA drizzle TO :"runtime_role";

-- Start from no direct or PUBLIC rights on the current application tables.
REVOKE ALL PRIVILEGES ON TABLE
  public.users,
  public.roles,
  public.permissions,
  public.user_roles,
  public.role_permissions,
  public.sessions,
  public.login_attempts,
  public.departments,
  public.faculty,
  public.students,
  public.course_catalog,
  public.prerequisites,
  public.semesters,
  public.course_offerings,
  public.offering_meetings,
  public.registrations,
  public.completed_courses,
  public.student_holds,
  public.notifications,
  public.system_settings,
  public.audit_events
FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  public.users,
  public.roles,
  public.permissions,
  public.user_roles,
  public.role_permissions,
  public.sessions,
  public.login_attempts,
  public.departments,
  public.faculty,
  public.students,
  public.course_catalog,
  public.prerequisites,
  public.semesters,
  public.course_offerings,
  public.offering_meetings,
  public.registrations,
  public.completed_courses,
  public.student_holds,
  public.notifications,
  public.system_settings,
  public.audit_events
FROM :"runtime_role";

-- Every current repository path reads through one or more of these relations.
GRANT SELECT ON TABLE
  public.users,
  public.roles,
  public.permissions,
  public.user_roles,
  public.role_permissions,
  public.sessions,
  public.login_attempts,
  public.departments,
  public.faculty,
  public.students,
  public.course_catalog,
  public.prerequisites,
  public.semesters,
  public.course_offerings,
  public.offering_meetings,
  public.registrations,
  public.completed_courses,
  public.student_holds,
  public.notifications,
  public.system_settings,
  public.audit_events
TO :"runtime_role";

-- Authentication state. Login attempts are append-only in the current app;
-- sessions are inserted and updated for idle expiry, rotation, and revocation.
GRANT INSERT ON TABLE public.login_attempts TO :"runtime_role";
GRANT INSERT, UPDATE ON TABLE public.sessions TO :"runtime_role";

-- Current record lifecycle uses soft archive/restore with optimistic versions.
GRANT UPDATE ON TABLE
  public.students,
  public.faculty,
  public.course_catalog
TO :"runtime_role";

-- User-role administration changes only assignment rows and the target
-- account's optimistic version/timestamp. Active sessions are revoked below
-- through the existing sessions UPDATE grant; credentials and account status
-- are not writable through this role-administration path.
GRANT UPDATE (updated_at, version) ON TABLE public.users TO :"runtime_role";
GRANT INSERT (user_id, role_id, granted_by_user_id, granted_at, revoked_at),
      UPDATE (granted_by_user_id, granted_at, revoked_at)
ON TABLE public.user_roles TO :"runtime_role";

-- Registration and waitlist transactions insert/update registrations and
-- notifications. They lock offerings using SELECT; offerings are not mutated.
GRANT INSERT, UPDATE ON TABLE
  public.registrations,
  public.notifications
TO :"runtime_role";

-- Settings use upsert, and choosing the current semester updates semesters.
GRANT INSERT, UPDATE ON TABLE public.system_settings TO :"runtime_role";
GRANT UPDATE ON TABLE public.semesters TO :"runtime_role";

-- Audit is intentionally SELECT/INSERT only. UPDATE, DELETE, and TRUNCATE are
-- absent here and are also rejected by the committed database triggers.
GRANT SELECT, INSERT ON TABLE public.audit_events TO :"runtime_role";

-- The current schema uses gen_random_uuid() and defines no application
-- sequences. Revoke inherited/direct sequence rights rather than granting a
-- blanket capability. If a future reviewed migration adds an identity/serial
-- sequence, grant USAGE and SELECT on that named sequence only in that migration.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"runtime_role";

-- Fail closed if ownership, PUBLIC, or an unexpected grant left destructive
-- runtime capabilities behind.
SELECT CASE WHEN
  has_schema_privilege(:'runtime_role', 'public', 'CREATE')
  OR has_database_privilege(:'runtime_role', current_database(), 'CREATE')
  OR has_table_privilege(:'runtime_role', 'public.audit_events', 'UPDATE')
  OR has_table_privilege(:'runtime_role', 'public.audit_events', 'DELETE')
  OR has_table_privilege(:'runtime_role', 'public.audit_events', 'TRUNCATE')
  OR EXISTS (
    SELECT 1
    FROM pg_class relation_object
    JOIN pg_namespace namespace_object ON namespace_object.oid = relation_object.relnamespace
    WHERE namespace_object.nspname = 'public'
      AND relation_object.relname = ANY (ARRAY[
        'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
        'sessions', 'login_attempts', 'departments', 'faculty', 'students',
        'course_catalog', 'prerequisites', 'semesters', 'course_offerings',
        'offering_meetings', 'registrations', 'completed_courses',
        'student_holds', 'notifications', 'system_settings', 'audit_events'
      ])
      AND (
        has_table_privilege(:'runtime_role', relation_object.oid, 'DELETE')
        OR has_table_privilege(:'runtime_role', relation_object.oid, 'TRUNCATE')
        OR has_table_privilege(:'runtime_role', relation_object.oid, 'REFERENCES')
        OR has_table_privilege(:'runtime_role', relation_object.oid, 'TRIGGER')
      )
  )
THEN 'true' ELSE 'false' END AS unsafe_privilege_found
\gset

\if :unsafe_privilege_found
  ROLLBACK;
  \echo 'ERROR: destructive, audit-mutation, or DDL privileges remain through another grant path. Nothing was applied.'
  \quit 3
\endif

COMMIT;

\echo 'Applied Northstar runtime grants. Review the effective table privileges below:'
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = :'runtime_role'
  AND table_schema IN ('public', 'drizzle')
ORDER BY table_schema, table_name, privilege_type;

SELECT table_schema, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE grantee = :'runtime_role'
  AND table_schema = 'public'
  AND table_name IN ('users', 'user_roles')
ORDER BY table_name, column_name, privilege_type;

-- DEFAULT PRIVILEGE CAVEAT
-- ALTER DEFAULT PRIVILEGES affects only objects subsequently created by the
-- role that executes it. Do not run it as the runtime role and do not add a
-- blanket runtime grant. The migration owner should at minimum revoke PUBLIC
-- defaults in its provisioning/bootstrap process:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
--
-- Each migration that creates a table or sequence must then grant only the
-- operations required by the reviewed repository code and update this file.
