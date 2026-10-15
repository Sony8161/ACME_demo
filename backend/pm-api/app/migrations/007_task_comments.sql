-- 007: comments on tasks. A short thread under each task (a deliverable), written by anyone who can see the project.
--
--   * A comment is archived, never deleted (like everything else). It is not part of the history log, whose kinds of record are fixed:
--     the thread is its own record.
--   * 1 to 2000 characters; the service trims the text first.

CREATE TABLE IF NOT EXISTS task_comments (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable_id uuid        NOT NULL REFERENCES deliverables (id),
    author_id      uuid        NOT NULL REFERENCES users (id),
    body           text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at     timestamptz NOT NULL DEFAULT now(),
    archived_at    timestamptz
);

CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (deliverable_id, created_at) WHERE archived_at IS NULL;
