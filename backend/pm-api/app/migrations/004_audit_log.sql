-- 004: an audit history. Every create, edit, archive and restore of a person, project, milestone, deliverable, team
--      member or cost is written to audit_log by the database itself, in the same transaction as the change.
--
--   * Triggers (not application code) write it, so no code path can forget, and a refused request leaves nothing behind.
--   * The caller is passed per transaction with set_config('app.actor_id', ...) by the API (see app/core/deps.py). Work that
--     has no caller (the first admin created at start-up) is recorded as "System".
--   * The log keeps the actor's name and the row's label as they were, with no foreign keys, so history outlives renamed
--     or archived people. It is append-only: UPDATE and DELETE are refused by a trigger.
--   * Secrets never enter it: a password change is recorded as the word "changed", never as a hash.
--   * Noise is left out: timestamps, counters, and the numbers the database derives (expected hours and cost).

CREATE TABLE IF NOT EXISTS audit_log (
    id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_id    uuid,
    actor_name  text        NOT NULL DEFAULT 'System',
    entity      text        NOT NULL CHECK (entity IN ('person', 'project', 'milestone', 'deliverable', 'assignment', 'cost')),
    entity_id   uuid        NOT NULL,
    project_id  uuid,
    label       text        NOT NULL DEFAULT '',
    action      text        NOT NULL CHECK (action IN ('create', 'update', 'archive', 'restore')),
    -- {"field": {"before": ..., "after": ...}}; "before" is absent on create
    changes     jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS audit_log_time_idx    ON audit_log (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_project_idx ON audit_log (project_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx   ON audit_log (actor_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION audit_log_readonly() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();

CREATE OR REPLACE FUNCTION audit_row() RETURNS trigger AS $$
DECLARE
    -- Columns that are never worth showing: bookkeeping, secrets, and values derived from other columns.
    skip     text[] := ARRAY['id', 'created_at', 'updated_at', 'archived_at', 'completed_at', 'done_at', 'password_hash',
                             'token_version', 'failed_logins', 'locked_until', 'must_change_password', 'expected_hours',
                             'expected_cost', 'created_by', 'assigned_by', 'reviewed_by', 'done_by', 'project_id',
                             'milestone_id', 'user_id'];
    v_new    jsonb := to_jsonb(NEW);
    v_old    jsonb;
    v_key    text;
    v_changes jsonb := '{}';
    v_entity text;
    v_project uuid;
    v_label  text;
    v_action text;
    v_actor  uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    v_actor_name text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
            IF NOT (v_key = ANY (skip)) THEN
                v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('after', v_new -> v_key));
            END IF;
        END LOOP;
    ELSE
        v_old := to_jsonb(OLD);
        v_action := CASE
            WHEN OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN 'archive'
            WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN 'restore'
            ELSE 'update' END;
        FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
            IF NOT (v_key = ANY (skip)) AND v_new -> v_key IS DISTINCT FROM v_old -> v_key THEN
                v_changes := v_changes || jsonb_build_object(
                    v_key, jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key));
            END IF;
        END LOOP;
        -- Said without its value: the hash itself must never be copied.
        IF TG_TABLE_NAME = 'users' AND v_new -> 'password_hash' IS DISTINCT FROM v_old -> 'password_hash' THEN
            v_changes := v_changes || jsonb_build_object('password', jsonb_build_object('before', NULL, 'after', 'changed'));
        END IF;
        IF v_action = 'update' AND v_changes = '{}' THEN
            RETURN NULL;  -- only bookkeeping changed (a failed sign-in counter, a timestamp)
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'users' THEN
        v_entity := 'person';  v_project := NULL;  v_label := NEW.name;
    ELSIF TG_TABLE_NAME = 'projects' THEN
        v_entity := 'project'; v_project := NEW.id; v_label := NEW.name;
    ELSIF TG_TABLE_NAME = 'milestones' THEN
        v_entity := 'milestone'; v_project := NEW.project_id; v_label := NEW.name;
    ELSIF TG_TABLE_NAME = 'deliverables' THEN
        v_entity := 'deliverable'; v_label := NEW.name;
        SELECT project_id INTO v_project FROM milestones WHERE id = NEW.milestone_id;
    ELSIF TG_TABLE_NAME = 'milestone_assignments' THEN
        v_entity := 'assignment';
        SELECT m.project_id, (SELECT u.name FROM users u WHERE u.id = NEW.user_id) || ' on ' || m.name
          INTO v_project, v_label FROM milestones m WHERE m.id = NEW.milestone_id;
    ELSE
        v_entity := 'cost'; v_project := NEW.project_id; v_label := NEW.description;
    END IF;

    SELECT name INTO v_actor_name FROM users WHERE id = v_actor;
    INSERT INTO audit_log (actor_id, actor_name, entity, entity_id, project_id, label, action, changes)
    VALUES (v_actor, COALESCE(v_actor_name, 'System'), v_entity, NEW.id, v_project, COALESCE(v_label, ''), v_action, v_changes);
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_audit ON users;
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS projects_audit ON projects;
CREATE TRIGGER projects_audit AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS milestones_audit ON milestones;
CREATE TRIGGER milestones_audit AFTER INSERT OR UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS deliverables_audit ON deliverables;
CREATE TRIGGER deliverables_audit AFTER INSERT OR UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS milestone_assignments_audit ON milestone_assignments;
CREATE TRIGGER milestone_assignments_audit AFTER INSERT OR UPDATE ON milestone_assignments
    FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS project_costs_audit ON project_costs;
CREATE TRIGGER project_costs_audit AFTER INSERT OR UPDATE ON project_costs FOR EACH ROW EXECUTE FUNCTION audit_row();
