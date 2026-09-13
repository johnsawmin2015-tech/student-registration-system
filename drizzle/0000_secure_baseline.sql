CREATE EXTENSION IF NOT EXISTS "citext";
--> statement-breakpoint
CREATE TYPE "entity_status" AS ENUM ('active', 'inactive', 'archived');
--> statement-breakpoint
CREATE TYPE "gender" AS ENUM ('female', 'male', 'nonbinary', 'undisclosed');
--> statement-breakpoint
CREATE TYPE "degree_level" AS ENUM ('undergraduate', 'graduate', 'doctoral');
--> statement-breakpoint
CREATE TYPE "student_standing" AS ENUM ('good', 'probation', 'suspended', 'graduated', 'withdrawn');
--> statement-breakpoint
CREATE TYPE "enrollment_state" AS ENUM ('enrolled', 'leave', 'graduated', 'withdrawn');
--> statement-breakpoint
CREATE TYPE "faculty_rank" AS ENUM ('professor', 'associate', 'assistant', 'lecturer', 'adjunct');
--> statement-breakpoint
CREATE TYPE "employment_type" AS ENUM ('full-time', 'part-time', 'visiting');
--> statement-breakpoint
CREATE TYPE "semester_season" AS ENUM ('fall', 'spring', 'summer');
--> statement-breakpoint
CREATE TYPE "semester_status" AS ENUM ('planned', 'active', 'closed', 'archived');
--> statement-breakpoint
CREATE TYPE "course_offering_status" AS ENUM ('draft', 'open', 'closed', 'cancelled', 'archived');
--> statement-breakpoint
CREATE TYPE "registration_status" AS ENUM ('registered', 'waitlisted', 'dropped', 'completed');
--> statement-breakpoint
CREATE TYPE "letter_grade" AS ENUM ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'IP', 'W');
--> statement-breakpoint
CREATE TYPE "completed_course_source" AS ENUM ('institutional', 'transfer', 'exam');
--> statement-breakpoint
CREATE TYPE "student_hold_type" AS ENUM ('academic', 'administrative', 'financial', 'conduct', 'health');
--> statement-breakpoint
CREATE TYPE "student_hold_status" AS ENUM ('active', 'released', 'expired');
--> statement-breakpoint
CREATE TYPE "notification_level" AS ENUM ('info', 'success', 'warning', 'critical');
--> statement-breakpoint
CREATE TYPE "login_attempt_outcome" AS ENUM ('success', 'failure', 'locked', 'rate_limited');
--> statement-breakpoint
CREATE TYPE "audit_outcome" AS ENUM ('success', 'denied', 'failure');
--> statement-breakpoint
CREATE TYPE "setting_value_type" AS ENUM ('boolean', 'number', 'string', 'json');
--> statement-breakpoint

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" citext NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "title" varchar(160),
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "is_disabled" boolean DEFAULT false NOT NULL,
  "last_active_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "users_version_positive" CHECK ("users"."version" >= 1),
  CONSTRAINT "users_archived_state_consistent" CHECK (("users"."status" = 'archived') = ("users"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(64) NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" text NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "roles_version_positive" CHECK ("roles"."version" >= 1),
  CONSTRAINT "roles_archived_state_consistent" CHECK (("roles"."status" = 'archived') = ("roles"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_unique" ON "roles" USING btree ("key");
--> statement-breakpoint

CREATE TABLE "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL,
  "description" text NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "permissions_version_positive" CHECK ("permissions"."version" >= 1),
  CONSTRAINT "permissions_archived_state_consistent" CHECK (("permissions"."status" = 'archived') = ("permissions"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_unique" ON "permissions" USING btree ("key");
--> statement-breakpoint

CREATE TABLE "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "granted_by_user_id" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "user_roles_user_role_unique" UNIQUE ("user_id", "role_id"),
  CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "user_roles_user_active_idx" ON "user_roles" USING btree ("user_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "granted_by_user_id" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "role_permissions_role_permission_unique" UNIQUE ("role_id", "permission_id"),
  CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "role_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "role_permissions_role_active_idx" ON "role_permissions" USING btree ("role_id") WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "csrf_token_hash" varchar(128) NOT NULL,
  "session_family_id" uuid NOT NULL,
  "rotated_from_session_id" uuid,
  "ip_hash" varchar(128),
  "user_agent_summary" varchar(255),
  "expires_at" timestamp with time zone NOT NULL,
  "idle_expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoke_reason" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "sessions_rotated_from_session_id_sessions_id_fk" FOREIGN KEY ("rotated_from_session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "sessions_version_positive" CHECK ("sessions"."version" >= 1),
  CONSTRAINT "sessions_expiry_after_creation" CHECK ("sessions"."expires_at" > "sessions"."created_at" AND "sessions"."idle_expires_at" > "sessions"."created_at"),
  CONSTRAINT "sessions_revocation_consistent" CHECK (("sessions"."revoked_at" IS NULL AND "sessions"."revoke_reason" IS NULL) OR "sessions"."revoked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id", "expires_at") WHERE "revoked_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "email_hash" varchar(128) NOT NULL,
  "ip_hash" varchar(128) NOT NULL,
  "outcome" "login_attempt_outcome" NOT NULL,
  "request_id" uuid NOT NULL,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "login_attempts_rate_limit_idx" ON "login_attempts" USING btree ("email_hash", "ip_hash", "attempted_at");
--> statement-breakpoint
CREATE INDEX "login_attempts_user_idx" ON "login_attempts" USING btree ("user_id", "attempted_at");
--> statement-breakpoint

CREATE TABLE "departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" citext NOT NULL,
  "name" varchar(180) NOT NULL,
  "school_name" varchar(180) NOT NULL,
  "chair_faculty_id" uuid,
  "building" varchar(180),
  "contact_email" citext,
  "description" text NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "departments_version_positive" CHECK ("departments"."version" >= 1),
  CONSTRAINT "departments_archived_state_consistent" CHECK (("departments"."status" = 'archived') = ("departments"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_unique" ON "departments" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "departments_name_unique" ON "departments" USING btree ("name");
--> statement-breakpoint

CREATE TABLE "faculty" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" citext NOT NULL,
  "user_id" uuid,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" citext NOT NULL,
  "phone" varchar(40),
  "department_id" uuid NOT NULL,
  "rank" "faculty_rank" NOT NULL,
  "employment_type" "employment_type" NOT NULL,
  "office" varchar(120),
  "specialization" varchar(180),
  "hired_on" date,
  "notes" text DEFAULT '' NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "faculty_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "faculty_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "faculty_department_identity_unique" UNIQUE ("department_id", "id"),
  CONSTRAINT "faculty_version_positive" CHECK ("faculty"."version" >= 1),
  CONSTRAINT "faculty_archived_state_consistent" CHECK (("faculty"."status" = 'archived') = ("faculty"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_employee_id_unique" ON "faculty" USING btree ("employee_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_email_unique" ON "faculty" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "faculty_user_id_unique" ON "faculty" USING btree ("user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "faculty_department_status_idx" ON "faculty" USING btree ("department_id", "status");
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_chair_faculty_id_faculty_id_fk" FOREIGN KEY ("chair_faculty_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_chair_same_department_fk" FOREIGN KEY ("id", "chair_faculty_id") REFERENCES "faculty"("department_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

CREATE TABLE "students" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "university_id" citext NOT NULL,
  "user_id" uuid,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "email" citext NOT NULL,
  "phone" varchar(40),
  "date_of_birth" date,
  "gender" "gender" DEFAULT 'undisclosed' NOT NULL,
  "department_id" uuid NOT NULL,
  "advisor_id" uuid,
  "program" varchar(180) NOT NULL,
  "degree_level" "degree_level" NOT NULL,
  "cohort_year" smallint NOT NULL,
  "gpa" numeric(3,2) DEFAULT 0 NOT NULL,
  "required_credits" numeric(6,1) NOT NULL,
  "standing" "student_standing" DEFAULT 'good' NOT NULL,
  "enrollment_state" "enrollment_state" DEFAULT 'enrolled' NOT NULL,
  "city" varchar(120),
  "country" varchar(120),
  "notes" text DEFAULT '' NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "students_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "students_advisor_id_faculty_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "students_advisor_same_department_fk" FOREIGN KEY ("department_id", "advisor_id") REFERENCES "faculty"("department_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "students_gpa_range" CHECK ("students"."gpa" BETWEEN 0 AND 4.00),
  CONSTRAINT "students_required_credits_nonnegative" CHECK ("students"."required_credits" >= 0),
  CONSTRAINT "students_cohort_year_range" CHECK ("students"."cohort_year" BETWEEN 1900 AND 2200),
  CONSTRAINT "students_version_positive" CHECK ("students"."version" >= 1),
  CONSTRAINT "students_archived_state_consistent" CHECK (("students"."status" = 'archived') = ("students"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "students_university_id_unique" ON "students" USING btree ("university_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_unique" ON "students" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "students_user_id_unique" ON "students" USING btree ("user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "students_department_status_idx" ON "students" USING btree ("department_id", "status");
--> statement-breakpoint

CREATE TABLE "course_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" citext NOT NULL,
  "title" varchar(240) NOT NULL,
  "department_id" uuid NOT NULL,
  "description" text NOT NULL,
  "credits" numeric(4,1) NOT NULL,
  "level" smallint NOT NULL,
  "status" "entity_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "course_catalog_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "course_catalog_credits_positive" CHECK ("course_catalog"."credits" > 0 AND "course_catalog"."credits" <= 30),
  CONSTRAINT "course_catalog_level_range" CHECK ("course_catalog"."level" BETWEEN 0 AND 999),
  CONSTRAINT "course_catalog_version_positive" CHECK ("course_catalog"."version" >= 1),
  CONSTRAINT "course_catalog_archived_state_consistent" CHECK (("course_catalog"."status" = 'archived') = ("course_catalog"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_catalog_code_unique" ON "course_catalog" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "course_catalog_department_status_idx" ON "course_catalog" USING btree ("department_id", "status");
--> statement-breakpoint

CREATE TABLE "prerequisites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_catalog_id" uuid NOT NULL,
  "prerequisite_course_catalog_id" uuid NOT NULL,
  "minimum_grade" "letter_grade",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "prerequisites_course_catalog_id_course_catalog_id_fk" FOREIGN KEY ("course_catalog_id") REFERENCES "course_catalog"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "prerequisites_prerequisite_course_catalog_id_course_catalog_id_fk" FOREIGN KEY ("prerequisite_course_catalog_id") REFERENCES "course_catalog"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "prerequisites_course_pair_unique" UNIQUE ("course_catalog_id", "prerequisite_course_catalog_id"),
  CONSTRAINT "prerequisites_not_self_referential" CHECK ("prerequisites"."course_catalog_id" <> "prerequisites"."prerequisite_course_catalog_id"),
  CONSTRAINT "prerequisites_minimum_grade_final" CHECK ("prerequisites"."minimum_grade" IS NULL OR "prerequisites"."minimum_grade" NOT IN ('IP', 'W'))
);
--> statement-breakpoint

CREATE TABLE "semesters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" citext NOT NULL,
  "name" varchar(160) NOT NULL,
  "season" "semester_season" NOT NULL,
  "year" smallint NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "registration_starts_at" timestamp with time zone NOT NULL,
  "registration_ends_at" timestamp with time zone NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "status" "semester_status" DEFAULT 'planned' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "semesters_date_order" CHECK ("semesters"."starts_on" <= "semesters"."ends_on" AND "semesters"."registration_starts_at" < "semesters"."registration_ends_at"),
  CONSTRAINT "semesters_year_range" CHECK ("semesters"."year" BETWEEN 1900 AND 2200),
  CONSTRAINT "semesters_version_positive" CHECK ("semesters"."version" >= 1),
  CONSTRAINT "semesters_current_not_archived" CHECK (NOT ("semesters"."is_current" AND "semesters"."status" = 'archived')),
  CONSTRAINT "semesters_archived_state_consistent" CHECK (("semesters"."status" = 'archived') = ("semesters"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_code_unique" ON "semesters" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "semesters_one_current_unique" ON "semesters" USING btree ("is_current") WHERE "is_current" = true;
--> statement-breakpoint

CREATE TABLE "course_offerings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "course_catalog_id" uuid NOT NULL,
  "semester_id" uuid NOT NULL,
  "instructor_id" uuid,
  "section_code" citext NOT NULL,
  "capacity" integer NOT NULL,
  "room" varchar(120),
  "status" "course_offering_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "course_offerings_course_catalog_id_course_catalog_id_fk" FOREIGN KEY ("course_catalog_id") REFERENCES "course_catalog"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "course_offerings_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "course_offerings_instructor_id_faculty_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "faculty"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "course_offerings_course_term_section_unique" UNIQUE ("course_catalog_id", "semester_id", "section_code"),
  CONSTRAINT "course_offerings_id_semester_unique" UNIQUE ("id", "semester_id"),
  CONSTRAINT "course_offerings_capacity_nonnegative" CHECK ("course_offerings"."capacity" >= 0),
  CONSTRAINT "course_offerings_version_positive" CHECK ("course_offerings"."version" >= 1),
  CONSTRAINT "course_offerings_archived_state_consistent" CHECK (("course_offerings"."status" = 'archived') = ("course_offerings"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "course_offerings_semester_status_idx" ON "course_offerings" USING btree ("semester_id", "status");
--> statement-breakpoint

CREATE TABLE "offering_meetings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offering_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "starts_at" time NOT NULL,
  "ends_at" time NOT NULL,
  "room" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "offering_meetings_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "offering_meetings_slot_unique" UNIQUE ("offering_id", "day_of_week", "starts_at", "ends_at"),
  CONSTRAINT "offering_meetings_day_range" CHECK ("offering_meetings"."day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "offering_meetings_time_order" CHECK ("offering_meetings"."starts_at" < "offering_meetings"."ends_at")
);
--> statement-breakpoint
CREATE INDEX "offering_meetings_conflict_idx" ON "offering_meetings" USING btree ("day_of_week", "starts_at", "ends_at");
--> statement-breakpoint

CREATE TABLE "registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "offering_id" uuid NOT NULL,
  "semester_id" uuid NOT NULL,
  "status" "registration_status" NOT NULL,
  "waitlist_position" integer,
  "grade" "letter_grade",
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "dropped_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "registrations_offering_semester_fk" FOREIGN KEY ("offering_id", "semester_id") REFERENCES "course_offerings"("id", "semester_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "registrations_student_offering_unique" UNIQUE ("student_id", "offering_id"),
  CONSTRAINT "registrations_waitlist_state_consistent" CHECK (("registrations"."status" = 'waitlisted' AND "registrations"."waitlist_position" IS NOT NULL AND "registrations"."waitlist_position" > 0) OR ("registrations"."status" <> 'waitlisted' AND "registrations"."waitlist_position" IS NULL)),
  CONSTRAINT "registrations_grade_state_consistent" CHECK (
    ("registrations"."status" = 'completed' AND "registrations"."grade" IS NOT NULL AND "registrations"."grade" NOT IN ('IP', 'W'))
    OR ("registrations"."status" = 'dropped' AND ("registrations"."grade" IS NULL OR "registrations"."grade" = 'W'))
    OR ("registrations"."status" = 'registered' AND ("registrations"."grade" IS NULL OR "registrations"."grade" = 'IP'))
    OR ("registrations"."status" = 'waitlisted' AND "registrations"."grade" IS NULL)
  ),
  CONSTRAINT "registrations_lifecycle_timestamps_consistent" CHECK (
    ("registrations"."status" = 'dropped' AND "registrations"."dropped_at" IS NOT NULL AND "registrations"."completed_at" IS NULL)
    OR ("registrations"."status" = 'completed' AND "registrations"."completed_at" IS NOT NULL AND "registrations"."dropped_at" IS NULL)
    OR ("registrations"."status" IN ('registered', 'waitlisted') AND "registrations"."dropped_at" IS NULL AND "registrations"."completed_at" IS NULL)
  ),
  CONSTRAINT "registrations_version_positive" CHECK ("registrations"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_offering_waitlist_position_unique" ON "registrations" USING btree ("offering_id", "waitlist_position") WHERE "waitlist_position" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "registrations_semester_status_idx" ON "registrations" USING btree ("semester_id", "status");
--> statement-breakpoint
CREATE INDEX "registrations_student_status_idx" ON "registrations" USING btree ("student_id", "status");
--> statement-breakpoint

CREATE TABLE "completed_courses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "course_catalog_id" uuid NOT NULL,
  "registration_id" uuid,
  "semester_id" uuid,
  "source" "completed_course_source" NOT NULL,
  "grade" "letter_grade" NOT NULL,
  "grade_points" numeric(3,2) NOT NULL,
  "credits_earned" numeric(4,1) NOT NULL,
  "completed_on" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "completed_courses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "completed_courses_course_catalog_id_course_catalog_id_fk" FOREIGN KEY ("course_catalog_id") REFERENCES "course_catalog"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "completed_courses_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "completed_courses_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "completed_courses_grade_final" CHECK ("completed_courses"."grade" NOT IN ('IP', 'W')),
  CONSTRAINT "completed_courses_grade_points_range" CHECK ("completed_courses"."grade_points" BETWEEN 0 AND 4.00),
  CONSTRAINT "completed_courses_credits_nonnegative" CHECK ("completed_courses"."credits_earned" >= 0),
  CONSTRAINT "completed_courses_version_positive" CHECK ("completed_courses"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "completed_courses_registration_unique" ON "completed_courses" USING btree ("registration_id") WHERE "registration_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "completed_courses_prerequisite_lookup_idx" ON "completed_courses" USING btree ("student_id", "course_catalog_id");
--> statement-breakpoint

CREATE TABLE "student_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL,
  "type" "student_hold_type" NOT NULL,
  "status" "student_hold_status" DEFAULT 'active' NOT NULL,
  "blocks_registration" boolean DEFAULT true NOT NULL,
  "reason" varchar(240) NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "released_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "student_holds_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "student_holds_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "student_holds_expiry_after_start" CHECK ("student_holds"."expires_at" IS NULL OR "student_holds"."expires_at" > "student_holds"."starts_at"),
  CONSTRAINT "student_holds_release_consistent" CHECK (("student_holds"."status" = 'released') = ("student_holds"."released_at" IS NOT NULL)),
  CONSTRAINT "student_holds_version_positive" CHECK ("student_holds"."version" >= 1)
);
--> statement-breakpoint
CREATE INDEX "student_holds_active_lookup_idx" ON "student_holds" USING btree ("student_id", "blocks_registration") WHERE "status" = 'active';
--> statement-breakpoint

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "level" "notification_level" DEFAULT 'info' NOT NULL,
  "title" varchar(180) NOT NULL,
  "message" text NOT NULL,
  "entity_type" varchar(64),
  "entity_id" uuid,
  "href" varchar(500),
  "read_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "notifications_version_positive" CHECK ("notifications"."version" >= 1),
  CONSTRAINT "notifications_entity_reference_consistent" CHECK (("notifications"."entity_type" IS NULL) = ("notifications"."entity_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id", "created_at") WHERE "read_at" IS NULL AND "archived_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "system_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL,
  "value_type" "setting_value_type" NOT NULL,
  "value" jsonb NOT NULL,
  "description" text NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "system_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "system_settings_version_positive" CHECK ("system_settings"."version" >= 1),
  CONSTRAINT "system_settings_json_type_matches" CHECK (
    ("system_settings"."value_type" = 'boolean' AND jsonb_typeof("system_settings"."value") = 'boolean')
    OR ("system_settings"."value_type" = 'number' AND jsonb_typeof("system_settings"."value") = 'number')
    OR ("system_settings"."value_type" = 'string' AND jsonb_typeof("system_settings"."value") = 'string')
    OR ("system_settings"."value_type" = 'json' AND jsonb_typeof("system_settings"."value") IN ('object', 'array'))
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_key_unique" ON "system_settings" USING btree ("key");
--> statement-breakpoint

CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "actor_role_key" varchar(64) NOT NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" varchar(255),
  "request_id" uuid NOT NULL,
  "correlation_id" uuid NOT NULL,
  "outcome" "audit_outcome" NOT NULL,
  "change_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type", "entity_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");
--> statement-breakpoint

CREATE FUNCTION "set_updated_at_and_increment_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" := clock_timestamp();
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "users_update_metadata"
BEFORE UPDATE ON "users"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "roles_update_metadata"
BEFORE UPDATE ON "roles"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "permissions_update_metadata"
BEFORE UPDATE ON "permissions"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "sessions_update_metadata"
BEFORE UPDATE ON "sessions"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "departments_update_metadata"
BEFORE UPDATE ON "departments"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "faculty_update_metadata"
BEFORE UPDATE ON "faculty"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "students_update_metadata"
BEFORE UPDATE ON "students"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "course_catalog_update_metadata"
BEFORE UPDATE ON "course_catalog"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "semesters_update_metadata"
BEFORE UPDATE ON "semesters"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "course_offerings_update_metadata"
BEFORE UPDATE ON "course_offerings"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "registrations_update_metadata"
BEFORE UPDATE ON "registrations"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "completed_courses_update_metadata"
BEFORE UPDATE ON "completed_courses"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "student_holds_update_metadata"
BEFORE UPDATE ON "student_holds"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "notifications_update_metadata"
BEFORE UPDATE ON "notifications"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint
CREATE TRIGGER "system_settings_update_metadata"
BEFORE UPDATE ON "system_settings"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at_and_increment_version"();
--> statement-breakpoint

CREATE FUNCTION "enforce_registration_status_transition"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD."status" = 'waitlisted' AND NEW."status" IN ('registered', 'dropped'))
    OR (OLD."status" = 'registered' AND NEW."status" IN ('dropped', 'completed'))
    OR (OLD."status" = 'dropped' AND NEW."status" IN ('registered', 'waitlisted'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'invalid registration status transition from %s to %s',
        OLD."status",
        NEW."status"
      );
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "registrations_valid_status_transition"
BEFORE UPDATE OF "status" ON "registrations"
FOR EACH ROW EXECUTE FUNCTION "enforce_registration_status_transition"();
--> statement-breakpoint

CREATE FUNCTION "assert_exactly_one_current_semester"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_semester_count integer;
BEGIN
  SELECT count(*)::integer
  INTO current_semester_count
  FROM "semesters"
  WHERE "is_current" = true;

  IF current_semester_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'exactly one current semester is required; found %s',
        current_semester_count
      );
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "semesters_exactly_one_current"
AFTER INSERT OR UPDATE OR DELETE ON "semesters"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_exactly_one_current_semester"();
--> statement-breakpoint

CREATE FUNCTION "prevent_unapproved_hard_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_hard_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = format(
        'hard deletion from %I is disabled; archive or revoke the record instead',
        TG_TABLE_NAME
      ),
      HINT = 'An explicitly authorized, audited maintenance transaction may set app.allow_hard_delete=on locally.';
  END IF;

  RETURN OLD;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "users_prevent_unapproved_delete" BEFORE DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "roles_prevent_unapproved_delete" BEFORE DELETE ON "roles" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "permissions_prevent_unapproved_delete" BEFORE DELETE ON "permissions" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "user_roles_prevent_unapproved_delete" BEFORE DELETE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "role_permissions_prevent_unapproved_delete" BEFORE DELETE ON "role_permissions" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "departments_prevent_unapproved_delete" BEFORE DELETE ON "departments" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "faculty_prevent_unapproved_delete" BEFORE DELETE ON "faculty" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "students_prevent_unapproved_delete" BEFORE DELETE ON "students" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "course_catalog_prevent_unapproved_delete" BEFORE DELETE ON "course_catalog" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "prerequisites_prevent_unapproved_delete" BEFORE DELETE ON "prerequisites" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "semesters_prevent_unapproved_delete" BEFORE DELETE ON "semesters" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "course_offerings_prevent_unapproved_delete" BEFORE DELETE ON "course_offerings" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "offering_meetings_prevent_unapproved_delete" BEFORE DELETE ON "offering_meetings" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "registrations_prevent_unapproved_delete" BEFORE DELETE ON "registrations" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "completed_courses_prevent_unapproved_delete" BEFORE DELETE ON "completed_courses" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "student_holds_prevent_unapproved_delete" BEFORE DELETE ON "student_holds" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "notifications_prevent_unapproved_delete" BEFORE DELETE ON "notifications" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint
CREATE TRIGGER "system_settings_prevent_unapproved_delete" BEFORE DELETE ON "system_settings" FOR EACH ROW EXECUTE FUNCTION "prevent_unapproved_hard_delete"();
--> statement-breakpoint

CREATE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = format('audit events are append-only; %s is not permitted', TG_OP);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();
--> statement-breakpoint

CREATE FUNCTION "prevent_audit_event_truncate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'audit events are append-only; TRUNCATE is not permitted';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "audit_events_prevent_truncate"
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_audit_event_truncate"();
--> statement-breakpoint
