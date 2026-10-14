-- 005: a deliverable becomes a task: it has a status, an owner, a due date and a priority, so it can sit on a board.
--
--   * status (todo, in_progress, done) is the board column. The old "done" tick stays and means status = done; a trigger keeps
--     the two in step whichever one changes, so the milestone sign-off rule (every item ticked) works exactly as before.
--   * assignee_id is the person who owns the task. The API only accepts someone who is on the task's milestone.
--   * Nothing here changes who may review work: an owner can move their own task between To do and In progress, and only
--     a manager or admin can mark it done.
--   * The audit trigger (004) needs no change: status, priority, due_date and assignee_id are ordinary columns to it.

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done'));
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES users (id);

UPDATE deliverables SET status = 'done' WHERE done AND status <> 'done';

CREATE INDEX IF NOT EXISTS deliverables_assignee_idx ON deliverables (assignee_id) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION deliverable_sync_status() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.done THEN NEW.status := 'done'; ELSE NEW.done := (NEW.status = 'done'); END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.done := (NEW.status = 'done');
    ELSIF NEW.done IS DISTINCT FROM OLD.done THEN
        NEW.status := CASE WHEN NEW.done THEN 'done' WHEN OLD.status = 'done' THEN 'todo' ELSE OLD.status END;
    END IF;
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deliverables_sync_status ON deliverables;
CREATE TRIGGER deliverables_sync_status BEFORE INSERT OR UPDATE ON deliverables
    FOR EACH ROW EXECUTE FUNCTION deliverable_sync_status();
