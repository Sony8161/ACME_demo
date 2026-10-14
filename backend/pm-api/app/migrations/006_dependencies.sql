-- 006: dependencies. A milestone can wait for another milestone (in the same project or another), and a project can wait
--      for another project. "Waiting" means finish-to-start: the later one cannot be started or completed until the
--      earlier one is completed. A link is archived, never deleted, and every change to one is written to the history.
--
--   * Two tables, so each end is a real foreign key. A loop (A waits for B, B waits for A, or a longer circle) is refused by the
--     service. A cancelled predecessor no longer blocks anything.
--   * The audit trigger learns the new tables; the audit log accepts a new kind of record, "dependency".

CREATE TABLE IF NOT EXISTS milestone_dependencies (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_id uuid        NOT NULL REFERENCES milestones (id),
    successor_id   uuid        NOT NULL REFERENCES milestones (id),
    created_by     uuid        REFERENCES users (id),
    archived_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (predecessor_id <> successor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS milestone_dependencies_active_idx
    ON milestone_dependencies (predecessor_id, successor_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS milestone_dependencies_successor_idx ON milestone_dependencies (successor_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS project_dependencies (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    predecessor_id uuid        NOT NULL REFERENCES projects (id),
    successor_id   uuid        NOT NULL REFERENCES projects (id),
    created_by     uuid        REFERENCES users (id),
    archived_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (predecessor_id <> successor_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_dependencies_active_idx
    ON project_dependencies (predecessor_id, successor_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS project_dependencies_successor_idx ON project_dependencies (successor_id) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS milestone_dependencies_set_updated_at ON milestone_dependencies;
CREATE TRIGGER milestone_dependencies_set_updated_at BEFORE UPDATE ON milestone_dependencies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS project_dependencies_set_updated_at ON project_dependencies;
CREATE TRIGGER project_dependencies_set_updated_at BEFORE UPDATE ON project_dependencies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_check
    CHECK (entity IN ('person', 'project', 'milestone', 'deliverable', 'assignment', 'cost', 'dependency'));

CREATE OR REPLACE FUNCTION audit_row() RETURNS trigger AS $$
DECLARE
    -- Columns that are never worth showing: bookkeeping, secrets, and values derived from other columns.
    skip     text[] := ARRAY['id', 'created_at', 'updated_at', 'archived_at', 'completed_at', 'done_at', 'password_hash',
                             'token_version', 'failed_logins', 'locked_until', 'must_change_password', 'expected_hours',
                             'expected_cost', 'created_by', 'assigned_by', 'reviewed_by', 'done_by', 'project_id',
                             'milestone_id', 'user_id', 'predecessor_id', 'successor_id'];
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
    ELSIF TG_TABLE_NAME = 'milestone_dependencies' THEN
        v_entity := 'dependency';
        SELECT s.project_id, (SELECT p.name FROM milestones p WHERE p.id = NEW.predecessor_id) || ' before ' || s.name
          INTO v_project, v_label FROM milestones s WHERE s.id = NEW.successor_id;
    ELSIF TG_TABLE_NAME = 'project_dependencies' THEN
        v_entity := 'dependency'; v_project := NEW.successor_id;
        SELECT (SELECT p.name FROM projects p WHERE p.id = NEW.predecessor_id) || ' before ' || s.name
          INTO v_label FROM projects s WHERE s.id = NEW.successor_id;
    ELSE
        v_entity := 'cost'; v_project := NEW.project_id; v_label := NEW.description;
    END IF;

    SELECT name INTO v_actor_name FROM users WHERE id = v_actor;
    INSERT INTO audit_log (actor_id, actor_name, entity, entity_id, project_id, label, action, changes)
    VALUES (v_actor, COALESCE(v_actor_name, 'System'), v_entity, NEW.id, v_project, COALESCE(v_label, ''), v_action, v_changes);
    RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_dependencies_audit ON milestone_dependencies;
CREATE TRIGGER milestone_dependencies_audit AFTER INSERT OR UPDATE ON milestone_dependencies
    FOR EACH ROW EXECUTE FUNCTION audit_row();
DROP TRIGGER IF EXISTS project_dependencies_audit ON project_dependencies;
CREATE TRIGGER project_dependencies_audit AFTER INSERT OR UPDATE ON project_dependencies
    FOR EACH ROW EXECUTE FUNCTION audit_row();
