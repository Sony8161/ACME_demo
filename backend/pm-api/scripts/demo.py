"""Prepare the demo database: create it, empty it, or load the sample company with short, memorable logins.

Used by ``bin/demo-local.sh`` (macOS and Linux; no Docker bridge and no LocalStack needed). It talks to PostgreSQL directly
and runs the same sample-data code as ``POST /admin/seed-demo``, so the data goes through the same rules as real data.

    cd backend/pm-api && source .venv/bin/activate
    POSTGRES_NAME=pm_demo python scripts/demo.py create-db   # create the database if it does not exist
    POSTGRES_NAME=pm_demo python scripts/demo.py reset       # empty it: first admin only, admin1 / ChangeMe123!
    POSTGRES_NAME=pm_demo python scripts/demo.py ready       # sample company, with the logins printed at the end

The connection comes from the usual POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASS and POSTGRES_NAME settings.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg  # noqa: E402
from psycopg.conninfo import make_conninfo  # noqa: E402

from app import db  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.core import security  # noqa: E402
from app.domains.users import repository as users_repo  # noqa: E402
from app.seed import ensure_bootstrap_admin, seed_demo  # noqa: E402

DEMO_PASSWORD = "Demo1234!"  # noqa: S105  # nosec B105 - a public, local-only demo password
NEW_HIRE_PASSWORD = "Welcome123!"  # noqa: S105  # nosec B105 - a public, local-only demo password
# Readable six-character usernames, keyed by the sample accounts' email (seed_demo builds name.surname@demo.acme.example).
USERNAMES = {
    "maria.lopez": "maria1", "james.carter": "james1", "alex.kim": "alex01", "priya.shah": "priya1", "tom.becker": "tom001",
    "lena.fischer": "lena01", "omar.haddad": "omar01", "sofia.rossi": "sofia1", "nina.park": "nina01",
}

CHEAT_SHEET = """
Ready.

  Username   Password      Who                      Use it to show
  ---------  ------------  -----------------------  --------------------------------------------
  admin1     Demo1234!     System Admin (admin)     dashboard, create/archive/restore, people
  maria1     Demo1234!     Maria Lopez (manager)    Website Redesign: tick, complete, assign
  james1     Demo1234!     James Carter (manager)   the overdue and at-risk projects
  alex01     Demo1234!     Alex Kim (employee)      "My work": no money, only my milestone
  nina01     Welcome123!   Nina Park (new hire)     first sign-in forces a new password (once)
  priya1 sofia1 tom001 lena01 omar01: more employees, all Demo1234!
"""


def connect() -> psycopg.Connection:
    conn = db.connect(get_settings().pg_conninfo, attempts=3, delay_seconds=2.0)
    db.run_migrations(conn)
    conn.commit()
    return conn


def create_db() -> None:
    s = get_settings()
    admin = make_conninfo(host=s.pg_host, port=s.pg_port, user=s.pg_user, password=s.pg_password, dbname="postgres",
                          connect_timeout=s.pg_connect_timeout)
    with psycopg.connect(admin, autocommit=True) as conn:
        if conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (s.pg_database,)).fetchone():
            print(f"Database {s.pg_database} already exists")
        else:
            conn.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(s.pg_database)))
            print(f"Created database {s.pg_database}")


def reset(conn: psycopg.Connection) -> None:
    """Empty every table that references users, then recreate the first admin (one-time password, must change it)."""
    conn.execute("TRUNCATE users, audit_log CASCADE")
    ensure_bootstrap_admin(conn)


def ready(conn: psycopg.Connection) -> None:
    reset(conn)
    admin = users_repo.get_auth_by_username(conn, get_settings().bootstrap_admin_username)
    # The history credits the admin, as it does when the same data is loaded through the API.
    conn.execute("SELECT set_config('app.actor_id', %s, true)", (str(admin["id"]),))
    seed_demo(conn, admin["id"])
    maria = conn.execute("SELECT id FROM users WHERE email LIKE 'maria.lopez@%'").fetchone()
    users_repo.insert(
        conn, username="nina01", password_hash=security.hash_password(NEW_HIRE_PASSWORD), name="Nina Park",
        email="nina.park@demo.acme.example", job_title="Junior Designer", role="employee", manager_id=maria["id"], salary=38,
    )
    try:
        with conn.transaction():  # keeps the cosmetic edits out of the history (needs a superuser; else they are recorded)
            conn.execute("SET LOCAL session_replication_role = replica")
            _rename_and_set_passwords(conn)
    except psycopg.errors.InsufficientPrivilege:
        _rename_and_set_passwords(conn)


def _rename_and_set_passwords(conn: psycopg.Connection) -> None:
    for prefix, username in USERNAMES.items():
        conn.execute("UPDATE users SET username = %s WHERE email LIKE %s", (username, f"{prefix}@%"))
    demo_hash = security.hash_password(DEMO_PASSWORD)
    conn.execute("UPDATE users SET password_hash = %s, must_change_password = false WHERE username <> 'nina01'", (demo_hash,))
    conn.execute("UPDATE users SET must_change_password = true WHERE username = 'nina01'")


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else ""
    if command == "create-db":
        create_db()
    elif command in {"reset", "ready"}:
        with connect() as conn:
            (reset if command == "reset" else ready)(conn)
        print("Emptied; sign in as admin1 / ChangeMe123! (a new password is required)." if command == "reset" else CHEAT_SHEET)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
